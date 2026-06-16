import { Downloader, DownloadError } from "../core/types";
import type { DownloadOptions } from "../core/types";
import { FragmentDownloader } from "./fragment";
import type { Segment } from "./fragment";
import { logger } from "../core/logger";

interface HlsKey {
  method: string;
  uri: string;
  iv?: string;
}

interface HlsSegmentRaw {
  uri: string;
  key?: HlsKey;
  byteRange?: { length: number; offset?: number };
  map?: { uri: string; byteRange?: { length: number; offset?: number } };
}

interface HlsVariant {
  uri: string;
  bandwidth?: number;
  resolution?: { width: number; height: number };
  codecs?: string;
}

interface HlsMasterPlaylist {
  isMasterPlaylist: true;
  variants: HlsVariant[];
}

interface HlsMediaPlaylist {
  isMasterPlaylist: false;
  segments: HlsSegmentRaw[];
  endList?: boolean;
}

type HlsPlaylist = HlsMasterPlaylist | HlsMediaPlaylist;

export class HlsDownloader extends Downloader {
  readonly protocol = "m3u8";

  canHandle(protocol: string): boolean {
    return protocol === "m3u8" || protocol === "hls";
  }

  async download(
    url: string,
    filepath: string,
    options: DownloadOptions,
  ): Promise<void> {
    const retries = options.retries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.downloadHls(url, filepath, options);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < retries) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          logger.warn(`HLS download failed (attempt ${attempt}/${retries}): ${lastError.message}`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw new DownloadError(`HLS download failed after ${retries} attempts: ${lastError?.message}`);
  }

  private async fetchManifest(url: string, headers: Record<string, string>): Promise<string> {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new DownloadError(`Failed to fetch manifest: HTTP ${resp.status}`);
    }
    return resp.text();
  }

  private async downloadHls(url: string, filepath: string, options: DownloadOptions): Promise<void> {
    const { parse } = await import("hls-parser");
    const headers = { ...options.headers };

    const manifestText = await this.fetchManifest(url, headers);
    const parsed = parse(manifestText) as HlsPlaylist;

    if (parsed.isMasterPlaylist) {
      const master = parsed as HlsMasterPlaylist;
      if (master.variants.length === 0) {
        throw new DownloadError("HLS master playlist has no variants");
      }
      const best = master.variants.reduce((a, b) =>
        (b.bandwidth ?? 0) > (a.bandwidth ?? 0) ? b : a,
      );
      const mediaUrl = resolveUrl(url, best.uri);
      logger.debug(`HLS: selected variant ${mediaUrl} (bandwidth: ${best.bandwidth ?? "unknown"})`);

      const mediaText = await this.fetchManifest(mediaUrl, headers);
      const mediaParsed = parse(mediaText) as HlsMediaPlaylist;
      await this.downloadMediaPlaylist(mediaParsed, mediaUrl, filepath, options);
    } else {
      await this.downloadMediaPlaylist(parsed as HlsMediaPlaylist, url, filepath, options);
    }
  }

  private async downloadMediaPlaylist(
    playlist: HlsMediaPlaylist,
    baseUrl: string,
    filepath: string,
    options: DownloadOptions,
  ): Promise<void> {
    const rawSegments = playlist.segments;
    if (!rawSegments || rawSegments.length === 0) {
      throw new DownloadError("HLS media playlist has no segments");
    }

    const segments: Segment[] = [];
    let idx = 0;

    for (const raw of rawSegments) {
      if (raw.map) {
        const mapUrl = resolveUrl(baseUrl, raw.map.uri);
        segments.push({
          url: mapUrl,
          index: idx++,
          isInit: true,
          byteRange: raw.map.byteRange
            ? { start: raw.map.byteRange.offset ?? 0, end: (raw.map.byteRange.offset ?? 0) + raw.map.byteRange.length - 1 }
            : undefined,
        });
      }

      const segUrl = resolveUrl(baseUrl, raw.uri);
      const seg: Segment = {
        url: segUrl,
        index: idx++,
      };

      if (raw.key) {
        seg.key = {
          method: raw.key.method,
          uri: resolveUrl(baseUrl, raw.key.uri),
          iv: raw.key.iv,
        };
      }

      if (raw.byteRange) {
        seg.byteRange = {
          start: raw.byteRange.offset ?? 0,
          end: (raw.byteRange.offset ?? 0) + raw.byteRange.length - 1,
        };
      }

      segments.push(seg);
    }

    const tempDir = `/tmp/dlpx-hls-${Date.now()}`;
    const fragmenter = new FragmentDownloader();
    await fragmenter.downloadSegments(segments, filepath, {
      ...options,
      concurrency: 8,
      tempDir,
    });
  }
}

function resolveUrl(base: string, relative: string): string {
  if (/^https?:\/\//i.test(relative)) return relative;
  return new URL(relative, base).toString();
}
