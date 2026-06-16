import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const VALID_URL = /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/\w+\/status\/(\d+)/;

interface VideoVariant {
  content_type: string;
  url: string;
  bitrate?: number;
}

interface VideoInfo {
  variants: VideoVariant[];
  duration_millis?: number;
}

interface MediaDetail {
  type: string;
  video_info?: VideoInfo;
  media_url_https?: string;
  original_info?: { width: number; height: number };
}

interface TweetResult {
  id_str: string;
  full_text: string;
  user?: { name: string; screen_name: string; id_str: string };
  created_at?: string;
  favorite_count?: number;
  retweet_count?: number;
  views?: { count?: string };
  mediaDetails?: MediaDetail[];
}

export class TwitterExtractor extends BaseExtractor {
  readonly _VALID_URL = VALID_URL;
  readonly _NAME = "twitter";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = VALID_URL.exec(url);
    if (!match) throw new ExtractorError(`twitter: invalid URL: ${url}`);
    const tweetId = match[1];

    const apiUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&features=tfw_timeline_list%3A%3Btfw_follower_count_sunset%3Atrue&token=0`;
    const resp = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; dlpx/1.0)",
        Accept: "application/json",
        Referer: "https://platform.twitter.com/",
        Origin: "https://platform.twitter.com",
      },
    });

    if (!resp.ok) {
      throw new ExtractorError(`twitter: API request failed: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as TweetResult;

    if (!data || !data.id_str) {
      throw new ExtractorError(`twitter: tweet not found or protected: ${tweetId}`);
    }

    const formats: Format[] = [];
    const thumbnails: Thumbnail[] = [];

    if (data.mediaDetails && data.mediaDetails.length > 0) {
      for (const media of data.mediaDetails) {
        if (media.media_url_https) {
          thumbnails.push({
            url: media.media_url_https,
            width: media.original_info?.width,
            height: media.original_info?.height,
          });
        }

        if (media.type === "video" || media.type === "animated_gif") {
          const videoInfo = media.video_info;
          if (videoInfo?.variants) {
            const mp4Variants = videoInfo.variants
              .filter((v) => v.content_type === "video/mp4")
              .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

            for (const variant of mp4Variants) {
              formats.push({
                format_id: `mp4-${variant.bitrate ?? 0}`,
                url: variant.url,
                ext: "mp4",
                tbr: variant.bitrate ? variant.bitrate / 1000 : undefined,
                vcodec: "h264",
                acodec: mp4Variants.length > 0 ? "aac" : undefined,
              });
            }

            const hlsVariant = videoInfo.variants.find(
              (v) => v.content_type === "application/x-mpegURL",
            );
            if (hlsVariant) {
              formats.push({
                format_id: "hls",
                url: hlsVariant.url,
                ext: "mp4",
                protocol: "m3u8",
              });
            }
          }
        }
      }
    }

    const uploadDate = data.created_at
      ? new Date(data.created_at).toISOString().slice(0, 10).replace(/-/g, "")
      : undefined;

    const viewCount = data.views?.count ? parseInt(data.views.count, 10) : undefined;

    const duration = data.mediaDetails?.[0]?.video_info?.duration_millis
      ? data.mediaDetails[0].video_info!.duration_millis / 1000
      : undefined;

    return {
      id: tweetId,
      title: data.full_text ? data.full_text.slice(0, 100) : `Tweet ${tweetId}`,
      description: data.full_text,
      uploader: data.user?.name,
      uploader_id: data.user?.screen_name,
      uploader_url: data.user?.screen_name
        ? `https://twitter.com/${data.user.screen_name}`
        : undefined,
      upload_date: uploadDate,
      view_count: viewCount,
      like_count: data.favorite_count,
      duration,
      formats,
      thumbnails,
      webpage_url: url,
      _type: "video",
    };
  }
}
