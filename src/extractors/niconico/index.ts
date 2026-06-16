import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const VALID_URL = /https?:\/\/(?:www\.)?nicovideo\.jp\/watch\/((?:sm|nm)\d+)/;

interface NicoVideoData {
  id: string;
  title: string;
  description: string;
  owner?: { id: number; nickname: string };
  user?: { id: number; nickname: string };
  count: { view: number; comment: number; mylist: number; like: number };
  duration: number;
  thumbnail: { url: string; largeUrl?: string };
  registeredAt: string;
  tags: Array<{ name: string }>;
  channel?: { id: string; name: string };
}

interface NicoApiData {
  meta: { status: number };
  data: {
    video: NicoVideoData;
    media: {
      domand?: {
        videos: Array<{
          id: string;
          isAvailable: boolean;
          label: string;
          bitRate: number;
          width: number;
          height: number;
          qualityLevel: number;
        }>;
        audios: Array<{
          id: string;
          isAvailable: boolean;
          label: string;
          bitRate: number;
          samplingRate: number;
          qualityLevel: number;
        }>;
        accessRightKey: string;
      };
    };
  };
}

interface DmsSession {
  meta: { status: number; message: string };
  data: {
    contentUrl: string;
    created: string;
    expireTime: string;
  };
}

const NICONICO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://www.nicovideo.jp",
};

export class NiconicoExtractor extends BaseExtractor {
  readonly _VALID_URL = VALID_URL;
  readonly _NAME = "niconico";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = VALID_URL.exec(url);
    if (!match) throw new ExtractorError(`niconico: invalid URL: ${url}`);

    const videoId = match[1];

    const watchResp = await fetch(`https://www.nicovideo.jp/watch/${videoId}`, {
      headers: {
        ...NICONICO_HEADERS,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!watchResp.ok) {
      throw new ExtractorError(`niconico: watch page request failed: ${watchResp.status}`);
    }

    const html = await watchResp.text();
    const cookies = watchResp.headers.get("set-cookie") ?? "";

    const dataMatch = html.match(/id="js-initial-watch-data"\s+data-api-data="([^"]+)"/);
    if (!dataMatch) {
      throw new ExtractorError(`niconico: could not find watch data in page for ${videoId}`);
    }

    const apiData = JSON.parse(
      dataMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
    ) as NicoApiData;

    if (apiData.meta.status !== 200) {
      throw new ExtractorError(`niconico: API returned non-200 status for ${videoId}`);
    }

    const video = apiData.data.video;
    const domand = apiData.data.media.domand;

    const formats: Format[] = [];

    if (domand) {
      const availableVideos = domand.videos.filter((v) => v.isAvailable);
      const availableAudios = domand.audios.filter((a) => a.isAvailable);

      if (availableVideos.length === 0) {
        throw new ExtractorError(`niconico: no available video streams for ${videoId}`);
      }

      const bestVideo = availableVideos.reduce((best, v) =>
        v.qualityLevel > best.qualityLevel ? v : best,
      );
      const bestAudio = availableAudios.reduce<typeof availableAudios[0] | null>((best, a) => {
        if (!best || a.qualityLevel > best.qualityLevel) return a;
        return best;
      }, null);

      const sessionBody = {
        outputs: [[bestVideo.id, bestAudio?.id ?? availableAudios[0]?.id]],
        accessRightKey: domand.accessRightKey,
      };

      const sessionResp = await fetch(
        `https://nvapi.nicovideo.jp/v1/watch/${videoId}/access-rights/hls?actionTrackId=dlpx_${Date.now()}`,
        {
          method: "POST",
          headers: {
            ...NICONICO_HEADERS,
            "Content-Type": "application/json",
            "X-Frontend-Id": "6",
            "X-Frontend-Version": "0",
            Cookie: cookies,
          },
          body: JSON.stringify(sessionBody),
        },
      );

      if (sessionResp.ok) {
        const sessionData = (await sessionResp.json()) as DmsSession;
        if (sessionData.meta.status === 201 && sessionData.data?.contentUrl) {
          formats.push({
            format_id: "hls",
            url: sessionData.data.contentUrl,
            ext: "mp4",
            protocol: "m3u8",
            vcodec: bestVideo.id.includes("h264") ? "avc1" : "hev1",
            width: bestVideo.width,
            height: bestVideo.height,
            tbr: Math.round(bestVideo.bitRate / 1000),
            format_note: bestVideo.label,
            http_headers: NICONICO_HEADERS,
          });
        }
      }
    }

    if (formats.length === 0) {
      formats.push({
        format_id: "fallback",
        url: `https://www.nicovideo.jp/watch/${videoId}`,
        ext: "mp4",
        protocol: "https",
        format_note: "webpage fallback",
      });
    }

    const thumbnails: Thumbnail[] = [];
    if (video.thumbnail.largeUrl) thumbnails.push({ url: video.thumbnail.largeUrl });
    thumbnails.push({ url: video.thumbnail.url });

    const uploadDate = video.registeredAt
      ? new Date(video.registeredAt).toISOString().slice(0, 10).replace(/-/g, "")
      : undefined;

    const uploader = video.owner?.nickname ?? video.user?.nickname;
    const uploaderId = video.owner?.id ?? video.user?.id;

    return {
      id: videoId,
      title: video.title,
      description: video.description,
      uploader,
      uploader_id: uploaderId ? String(uploaderId) : undefined,
      uploader_url: uploaderId
        ? `https://www.nicovideo.jp/user/${uploaderId}`
        : undefined,
      channel: video.channel?.name,
      channel_id: video.channel?.id,
      channel_url: video.channel?.id
        ? `https://ch.nicovideo.jp/channel/${video.channel.id}`
        : undefined,
      duration: video.duration,
      view_count: video.count.view,
      comment_count: video.count.comment,
      like_count: video.count.like,
      upload_date: uploadDate,
      thumbnails,
      formats,
      tags: video.tags.map((t) => t.name),
      webpage_url: url,
      _type: "video",
    };
  }
}
