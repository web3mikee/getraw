import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const VALID_URL =
  /https?:\/\/(?:www\.)?(?:tiktok\.com\/@[\w.]+\/video\/(\d+)|vm\.tiktok\.com\/([\w]+))/;

interface TikTokAuthor {
  uniqueId?: string;
  nickname?: string;
  id?: string;
  avatarThumb?: string;
}

interface TikTokMusic {
  title?: string;
  authorName?: string;
  id?: string;
}

interface TikTokVideo {
  playAddr?: string;
  downloadAddr?: string;
  width?: number;
  height?: number;
  duration?: number;
  bitrate?: number;
  format?: string;
  codecType?: string;
  cover?: string;
  dynamicCover?: string;
  originCover?: string;
}

interface TikTokStats {
  diggCount?: number;
  shareCount?: number;
  commentCount?: number;
  playCount?: number;
}

interface TikTokItemStruct {
  id?: string;
  desc?: string;
  createTime?: number;
  author?: TikTokAuthor;
  music?: TikTokMusic;
  video?: TikTokVideo;
  stats?: TikTokStats;
  textExtra?: Array<{ hashtagName?: string }>;
}

interface TikTokRehydrationData {
  __DEFAULT_SCOPE__?: {
    "webapp.video-detail"?: {
      itemInfo?: {
        itemStruct?: TikTokItemStruct;
      };
    };
  };
}

export class TikTokExtractor extends BaseExtractor {
  readonly _VALID_URL = VALID_URL;
  readonly _NAME = "tiktok";

  private readonly _headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: "https://www.tiktok.com/",
  };

  private async resolveShortUrl(url: string): Promise<string> {
    const resp = await fetch(url, {
      headers: this._headers,
      redirect: "follow",
    });
    return resp.url;
  }

  private extractRehydrationData(html: string): TikTokRehydrationData | null {
    const match = html.match(
      /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!match) return null;

    try {
      return JSON.parse(match[1]) as TikTokRehydrationData;
    } catch {
      return null;
    }
  }

  protected async _real_extract(url: string): Promise<InfoDict> {
    let resolvedUrl = url;

    if (/vm\.tiktok\.com/.test(url)) {
      resolvedUrl = await this.resolveShortUrl(url);
    }

    const match = VALID_URL.exec(resolvedUrl);
    const videoId = match?.[1] ?? match?.[2] ?? "unknown";

    const resp = await fetch(resolvedUrl, { headers: this._headers });
    if (!resp.ok) {
      throw new ExtractorError(
        `tiktok: page fetch failed: ${resp.status} ${resp.statusText}`,
      );
    }

    const html = await resp.text();
    const rehydrationData = this.extractRehydrationData(html);

    if (!rehydrationData) {
      throw new ExtractorError(
        "tiktok: could not extract __UNIVERSAL_DATA_FOR_REHYDRATION__ from page",
      );
    }

    const itemStruct =
      rehydrationData?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo
        ?.itemStruct;

    if (!itemStruct) {
      throw new ExtractorError("tiktok: could not find video item data");
    }

    const formats: Format[] = [];
    const thumbnails: Thumbnail[] = [];
    const video = itemStruct.video;

    if (video) {
      if (video.downloadAddr) {
        formats.push({
          format_id: "download",
          url: video.downloadAddr,
          ext: video.format ?? "mp4",
          width: video.width,
          height: video.height,
          tbr: video.bitrate ? video.bitrate / 1000 : undefined,
          vcodec: video.codecType,
          quality: 10,
          http_headers: {
            Referer: "https://www.tiktok.com/",
            "User-Agent": this._headers["User-Agent"],
          },
        });
      }

      if (video.playAddr && video.playAddr !== video.downloadAddr) {
        formats.push({
          format_id: "play",
          url: video.playAddr,
          ext: video.format ?? "mp4",
          width: video.width,
          height: video.height,
          tbr: video.bitrate ? video.bitrate / 1000 : undefined,
          vcodec: video.codecType,
          quality: 5,
          http_headers: {
            Referer: "https://www.tiktok.com/",
            "User-Agent": this._headers["User-Agent"],
          },
        });
      }

      if (video.originCover) thumbnails.push({ url: video.originCover, preference: 2 });
      if (video.dynamicCover) thumbnails.push({ url: video.dynamicCover, preference: 1 });
      if (video.cover) thumbnails.push({ url: video.cover, preference: 0 });
    }

    const author = itemStruct.author;
    const stats = itemStruct.stats;
    const tags = itemStruct.textExtra
      ?.filter((t) => t.hashtagName)
      .map((t) => t.hashtagName as string);

    const createTime = itemStruct.createTime;

    return {
      id: itemStruct.id ?? videoId,
      title: itemStruct.desc ?? `TikTok video ${videoId}`,
      description: itemStruct.desc,
      uploader: author?.nickname,
      uploader_id: author?.uniqueId,
      uploader_url: author?.uniqueId
        ? `https://www.tiktok.com/@${author.uniqueId}`
        : undefined,
      channel_id: author?.id,
      timestamp: createTime,
      upload_date: createTime
        ? new Date(createTime * 1000).toISOString().slice(0, 10).replace(/-/g, "")
        : undefined,
      duration: video?.duration,
      view_count: stats?.playCount,
      like_count: stats?.diggCount,
      comment_count: stats?.commentCount,
      formats,
      thumbnails,
      tags,
      webpage_url: resolvedUrl,
      _type: "video",
    };
  }
}
