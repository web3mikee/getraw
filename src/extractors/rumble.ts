import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict, Format, Thumbnail } from "../core/types";

interface RumbleVideoSource {
  url: string;
  w?: number;
  h?: number;
  fps?: number;
  bitrate?: number;
}

interface RumbleVideoInfo {
  title?: string;
  description?: string;
  author?: string;
  pubDate?: string;
  duration?: number;
  mainAncestorId?: string;
  ua?: Record<string, Record<string, RumbleVideoSource>>;
  t?: Array<{ i?: string; u?: string }>;
}

export class RumbleExtractor extends BaseExtractor {
  readonly _VALID_URL = /https?:\/\/(?:www\.)?rumble\.com\/(?:v[a-zA-Z0-9]+-[^/?]+\.html|embed\/([a-zA-Z0-9]+))/;
  readonly _NAME = "rumble";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      throw new ExtractorError(`Rumble fetch error: ${response.status}`);
    }

    const html = await response.text();

    const embedIdMatch = html.match(/rumble\.com\/embed\/([a-zA-Z0-9]+)/);
    let embedHtml = html;

    if (embedIdMatch && !url.includes("/embed/")) {
      const embedUrl = `https://rumble.com/embed/${embedIdMatch[1]}/`;
      const embedResponse = await fetch(embedUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      embedHtml = await embedResponse.text();
    }

    const configMatch = embedHtml.match(/RumblePlayer\.render\([^,]+,\s*(\{[\s\S]*?\})\s*\)/);
    const jsonMatch = embedHtml.match(/"video"\s*:\s*(\{[\s\S]*?\})\s*(?:,\s*"|\})/);

    let videoData: RumbleVideoInfo = {};

    if (configMatch) {
      try {
        videoData = JSON.parse(configMatch[1]) as RumbleVideoInfo;
      } catch {
      }
    }

    if (!videoData.ua && jsonMatch) {
      try {
        videoData = JSON.parse(jsonMatch[1]) as RumbleVideoInfo;
      } catch {
      }
    }

    if (!videoData.ua) {
      const scriptMatch = embedHtml.match(/<script[^>]*>\s*var\s+videoConfig\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
      if (scriptMatch) {
        try {
          videoData = JSON.parse(scriptMatch[1]) as RumbleVideoInfo;
        } catch {
        }
      }
    }

    const ua = videoData.ua ?? {};
    const formats: Format[] = [];

    for (const [formatKey, sourceMap] of Object.entries(ua)) {
      for (const [, source] of Object.entries(sourceMap)) {
        if (source.url) {
          const isHLS = source.url.includes(".m3u8");
          formats.push({
            format_id: formatKey,
            url: source.url,
            ext: isHLS ? "mp4" : "mp4",
            protocol: isHLS ? "m3u8" : undefined,
            width: source.w,
            height: source.h,
            fps: source.fps,
            tbr: source.bitrate,
            resolution: source.h ? `${source.h}p` : undefined,
            quality: source.h ?? 0,
          });
        }
      }
    }

    const thumbnails: Thumbnail[] = [];
    if (videoData.t) {
      for (const thumb of videoData.t) {
        if (thumb.u) thumbnails.push({ url: thumb.u });
      }
    }

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const title = videoData.title ?? ogTitle?.[1] ?? titleMatch?.[1] ?? "Rumble Video";

    const idMatch = url.match(/\/(v[a-zA-Z0-9]+)-/) ?? url.match(/embed\/([a-zA-Z0-9]+)/);
    const id = idMatch?.[1] ?? "unknown";

    return {
      id,
      title,
      description: videoData.description,
      uploader: videoData.author,
      duration: videoData.duration,
      thumbnails,
      formats,
      webpage_url: url,
      extractor: this._NAME,
    };
  }
}
