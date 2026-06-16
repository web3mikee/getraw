import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict, Format, Thumbnail } from "../core/types";

interface DailymotionQuality {
  type: string;
  url: string;
}

interface DailymotionMetadata {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  owner?: { screenname?: string; id?: string };
  created_time?: number;
  views_total?: number;
  likes_total?: number;
  thumbnail_url?: string;
  qualities?: Record<string, DailymotionQuality[]>;
}

export class DailymotionExtractor extends BaseExtractor {
  readonly _VALID_URL = /https?:\/\/(?:www\.)?dailymotion\.com\/video\/([a-zA-Z0-9]+)/;
  readonly _NAME = "dailymotion";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = url.match(this._VALID_URL);
    if (!match) throw new ExtractorError(`Invalid Dailymotion URL: ${url}`);
    const videoId = match[1];

    const apiUrl = `https://www.dailymotion.com/player/metadata/video/${videoId}?app=com.dailymotion.neon`;
    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      throw new ExtractorError(`Dailymotion API error: ${response.status}`);
    }

    const data = (await response.json()) as DailymotionMetadata;

    const formats: Format[] = [];
    const qualities = data.qualities ?? {};

    const qualityMap: Record<string, number> = {
      "2160": 2160,
      "1440": 1440,
      "1080": 1080,
      "720": 720,
      "480": 480,
      "380": 380,
      "240": 240,
      "144": 144,
    };

    for (const [qualityKey, streams] of Object.entries(qualities)) {
      for (const stream of streams) {
        if (stream.type === "video/mp4" && stream.url) {
          const height = qualityMap[qualityKey];
          formats.push({
            format_id: `mp4-${qualityKey}`,
            url: stream.url,
            ext: "mp4",
            height,
            resolution: height ? `${height}p` : qualityKey,
            quality: height ?? 0,
          });
        } else if ((stream.type === "application/x-mpegURL" || stream.type === "application/vnd.apple.mpegurl") && stream.url) {
          formats.push({
            format_id: `hls-${qualityKey}`,
            url: stream.url,
            ext: "mp4",
            protocol: "m3u8",
          });
        }
      }
    }

    const thumbnails: Thumbnail[] = data.thumbnail_url
      ? [{ url: data.thumbnail_url }]
      : [];

    return {
      id: videoId,
      title: data.title,
      description: data.description,
      duration: data.duration,
      uploader: data.owner?.screenname,
      uploader_id: data.owner?.id,
      timestamp: data.created_time,
      view_count: data.views_total,
      like_count: data.likes_total,
      thumbnails,
      formats,
      webpage_url: url,
      extractor: this._NAME,
    };
  }
}
