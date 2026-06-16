import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict, Format, Thumbnail } from "../core/types";

interface StreamableVideoSource {
  url?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  size?: number;
}

interface StreamablePageData {
  title?: string;
  status?: number;
  percent?: number;
  thumbnail_url?: string;
  files?: Record<string, StreamableVideoSource>;
  url?: string;
  duration?: number;
}

export class StreamableExtractor extends BaseExtractor {
  readonly _VALID_URL = /https?:\/\/(?:www\.)?streamable\.com\/([a-zA-Z0-9]+)/;
  readonly _NAME = "streamable";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = url.match(this._VALID_URL);
    if (!match) throw new ExtractorError(`Invalid Streamable URL: ${url}`);
    const videoId = match[1];

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      throw new ExtractorError(`Streamable fetch error: ${response.status}`);
    }

    const html = await response.text();

    let pageData: StreamablePageData = {};

    const reactDataMatch = html.match(/window\.__reactData__\s*=\s*(\{[\s\S]*?});\s*<\/script>/);
    if (reactDataMatch) {
      try {
        const reactData = JSON.parse(reactDataMatch[1]) as Record<string, unknown>;
        const videoKey = Object.keys(reactData).find((k) => (reactData[k] as Record<string, unknown>)?.files);
        if (videoKey) pageData = reactData[videoKey] as StreamablePageData;
      } catch {
      }
    }

    if (!pageData.files) {
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]) as Record<string, unknown>;
          const props = (nextData.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined;
          pageData = (props?.video ?? props?.clip ?? {}) as StreamablePageData;
        } catch {
        }
      }
    }

    if (!pageData.files) {
      const jsonMatch = html.match(/"files"\s*:\s*(\{[^}]+\})/);
      if (jsonMatch) {
        try {
          pageData.files = JSON.parse(jsonMatch[1]) as Record<string, StreamableVideoSource>;
        } catch {
        }
      }
    }

    const files = pageData.files ?? {};
    const formats: Format[] = [];

    const qualityMap: Record<string, number> = {
      mp4: 1,
      "mp4-mobile": 2,
      original: 3,
    };

    for (const [key, source] of Object.entries(files)) {
      if (!source.url) continue;

      const fullUrl = source.url.startsWith("//")
        ? `https:${source.url}`
        : source.url;

      formats.push({
        format_id: key,
        url: fullUrl,
        ext: "mp4",
        width: source.width,
        height: source.height,
        tbr: source.bitrate,
        filesize: source.size,
        quality: qualityMap[key] ?? 0,
        resolution: source.height ? `${source.height}p` : undefined,
      });
    }

    const thumbnails: Thumbnail[] = pageData.thumbnail_url
      ? [{ url: pageData.thumbnail_url.startsWith("//") ? `https:${pageData.thumbnail_url}` : pageData.thumbnail_url }]
      : [];

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = pageData.title ?? titleMatch?.[1]?.replace(" - Streamable", "").trim() ?? videoId;

    return {
      id: videoId,
      title,
      thumbnails,
      formats,
      duration: pageData.duration,
      webpage_url: url,
      extractor: this._NAME,
    };
  }
}
