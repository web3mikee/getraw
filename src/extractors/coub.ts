import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict, Format, Thumbnail } from "../core/types";

interface CoubMediaSource {
  url?: string;
  size?: number;
}

interface CoubFileVersions {
  html5?: {
    video?: Record<string, CoubMediaSource>;
    audio?: Record<string, CoubMediaSource>;
  };
  mobile?: {
    video?: string[];
    audio?: string;
  };
}

interface CoubData {
  id?: number;
  title?: string;
  description?: string;
  views_count?: number;
  likes_count?: number;
  created_at?: string;
  duration?: number;
  file_versions?: CoubFileVersions;
  image_versions?: {
    template?: string;
    versions?: string[];
  };
  channel?: {
    permalink?: string;
    title?: string;
  };
  tags?: Array<{ title?: string }>;
}

export class CoubExtractor extends BaseExtractor {
  readonly _VALID_URL = /https?:\/\/(?:www\.)?coub\.com\/(?:view|embed)\/([a-zA-Z0-9_-]+)/;
  readonly _NAME = "coub";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = url.match(this._VALID_URL);
    if (!match) throw new ExtractorError(`Invalid Coub URL: ${url}`);
    const coubId = match[1];

    const apiUrl = `https://coub.com/api/v2/coubs/${coubId}`;
    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      throw new ExtractorError(`Coub API error: ${response.status}`);
    }

    const data = (await response.json()) as CoubData;

    const formats: Format[] = [];
    const html5 = data.file_versions?.html5;

    const qualityOrder: Record<string, number> = {
      higher: 4,
      high: 3,
      med: 2,
      low: 1,
    };

    const heightMap: Record<string, number> = {
      higher: 1080,
      high: 720,
      med: 360,
      low: 240,
    };

    if (html5?.video) {
      for (const [quality, source] of Object.entries(html5.video)) {
        if (source.url) {
          formats.push({
            format_id: `video-${quality}`,
            url: source.url,
            ext: "mp4",
            vcodec: "h264",
            acodec: "none",
            height: heightMap[quality],
            filesize: source.size,
            quality: qualityOrder[quality] ?? 0,
            format_note: `video-only (${quality}); audio is separate and requires merge`,
          });
        }
      }
    }

    if (html5?.audio) {
      for (const [quality, source] of Object.entries(html5.audio)) {
        if (source.url) {
          formats.push({
            format_id: `audio-${quality}`,
            url: source.url,
            ext: "mp4",
            vcodec: "none",
            acodec: "aac",
            filesize: source.size,
            quality: qualityOrder[quality] ?? 0,
            format_note: `audio-only (${quality})`,
          });
        }
      }
    }

    const thumbnails: Thumbnail[] = [];
    const imgTemplate = data.image_versions?.template;
    if (imgTemplate) {
      for (const version of data.image_versions?.versions ?? []) {
        thumbnails.push({ url: imgTemplate.replace("%{version}", version) });
      }
    }

    return {
      id: String(data.id ?? coubId),
      title: data.title ?? coubId,
      description: data.description,
      duration: data.duration,
      view_count: data.views_count,
      like_count: data.likes_count,
      uploader: data.channel?.title,
      uploader_id: data.channel?.permalink,
      upload_date: data.created_at?.slice(0, 10).replace(/-/g, ""),
      thumbnails,
      formats,
      tags: data.tags?.map((t) => t.title ?? "").filter(Boolean),
      webpage_url: url,
      extractor: this._NAME,
    };
  }
}
