import { BaseExtractor } from "../core/types";
import type { InfoDict, Format } from "../core/types";

const MEDIA_EXTENSIONS = /\.(mp4|webm|mkv|flv|avi|mov|wmv|mp3|aac|flac|opus|ogg|wav|m4a)(\?|$)/i;
const MANIFEST_EXTENSIONS = /\.(m3u8|mpd)(\?|$)/i;

export class GenericExtractor extends BaseExtractor {
  readonly _VALID_URL = /^https?:\/\/.+/;
  readonly _NAME = "generic";

  protected async _real_extract(url: string): Promise<InfoDict> {
    if (MEDIA_EXTENSIONS.test(url)) {
      return this.extractDirectMedia(url);
    }

    if (MANIFEST_EXTENSIONS.test(url)) {
      return this.extractManifest(url);
    }

    return this.extractFromPage(url);
  }

  private extractDirectMedia(url: string): InfoDict {
    const urlObj = new URL(url);
    const filename = urlObj.pathname.split("/").pop() ?? "media";
    const ext = filename.split(".").pop() ?? "mp4";
    const title = filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

    return {
      id: this.generateId(url),
      title,
      url,
      ext,
      formats: [
        {
          format_id: "direct",
          url,
          ext,
        },
      ],
    };
  }

  private extractManifest(url: string): InfoDict {
    const isHLS = /\.m3u8/i.test(url);
    const ext = isHLS ? "mp4" : "webm";
    const protocol = isHLS ? "m3u8" : "dash";

    return {
      id: this.generateId(url),
      title: "Media",
      url,
      ext,
      formats: [
        {
          format_id: protocol,
          url,
          ext,
          protocol,
        },
      ],
    };
  }

  private async extractFromPage(url: string): Promise<InfoDict> {
    const response = await fetch(url);
    const html = await response.text();

    const formats: Format[] = [];

    const mediaMatches = html.matchAll(
      /(?:src|href)=["']([^"']*?\.(mp4|webm|m3u8|mpd)(?:\?[^"']*?)?)["']/gi,
    );
    for (const match of mediaMatches) {
      const mediaUrl = new URL(match[1], url).href;
      const ext = match[2].toLowerCase();
      formats.push({
        format_id: `generic-${formats.length}`,
        url: mediaUrl,
        ext: ext === "m3u8" ? "mp4" : ext === "mpd" ? "webm" : ext,
        protocol: ext === "m3u8" ? "m3u8" : ext === "mpd" ? "dash" : undefined,
      });
    }

    const ogVideo = html.match(
      /<meta[^>]+property=["']og:video(?::url)?["'][^>]+content=["']([^"']+)["']/i,
    );
    if (ogVideo) {
      const videoUrl = new URL(ogVideo[1], url).href;
      formats.push({
        format_id: "og-video",
        url: videoUrl,
        ext: "mp4",
      });
    }

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const ogTitle = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    );

    return {
      id: this.generateId(url),
      title: ogTitle?.[1] ?? titleMatch?.[1] ?? "Unknown",
      webpage_url: url,
      formats,
    };
  }

  private generateId(url: string): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(36);
  }
}
