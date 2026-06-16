import { Downloader, DownloadError } from "../core/types";
import type { DownloadOptions, DownloadProgress } from "../core/types";
import { logger } from "../core/logger";

export class HttpDownloader extends Downloader {
  readonly protocol = "https";

  canHandle(protocol: string): boolean {
    return protocol === "http" || protocol === "https";
  }

  async download(
    filepath: string,
    url: string,
    options: DownloadOptions,
  ): Promise<void> {
    const retries = options.retries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.downloadAttempt(filepath, url, options, attempt > 1);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < retries) {
          logger.warn(
            `Download failed (attempt ${attempt}/${retries}): ${lastError.message}`,
          );
          await sleep(1000 * attempt);
        }
      }
    }

    throw new DownloadError(
      `Download failed after ${retries} attempts: ${lastError?.message}`,
    );
  }

  private async downloadAttempt(
    filepath: string,
    url: string,
    options: DownloadOptions,
    isResume: boolean,
  ): Promise<void> {
    const headers: Record<string, string> = {
      ...options.headers,
    };

    let existingBytes = 0;
    if (isResume) {
      try {
        const file = Bun.file(filepath);
        existingBytes = file.size;
        if (existingBytes > 0) {
          headers["Range"] = `bytes=${existingBytes}-`;
        }
      } catch {
        existingBytes = 0;
      }
    }

    const response = await fetch(url, { headers });
    if (!response.ok && response.status !== 206) {
      throw new DownloadError(
        `HTTP ${response.status}: ${response.statusText}`,
      );
    }

    const totalStr = response.headers.get("content-length");
    const totalBytes = totalStr ? parseInt(totalStr, 10) + existingBytes : null;

    const body = response.body;
    if (!body) {
      throw new DownloadError("Empty response body");
    }

    const writer = Bun.file(filepath).writer();
    const reader = body.getReader();
    let downloadedBytes = existingBytes;
    let startTime = Date.now();
    const rateLimit = options.rateLimit ?? null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        writer.write(value);
        downloadedBytes += value.byteLength;

        if (rateLimit && rateLimit > 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const expectedTime = (downloadedBytes - existingBytes) / rateLimit;
          if (elapsed < expectedTime) {
            await sleep((expectedTime - elapsed) * 1000);
          }
        }

        if (options.onProgress) {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? (downloadedBytes - existingBytes) / elapsed : 0;
          const remaining = totalBytes
            ? (totalBytes - downloadedBytes) / (speed || 1)
            : null;
          const percent = totalBytes
            ? (downloadedBytes / totalBytes) * 100
            : null;

          const progress: DownloadProgress = {
            downloaded_bytes: downloadedBytes,
            total_bytes: totalBytes,
            speed,
            eta: remaining,
            percent,
            status: "downloading",
            filename: filepath,
          };
          options.onProgress(progress);
        }
      }

      await writer.end();

      if (options.onProgress) {
        options.onProgress({
          downloaded_bytes: downloadedBytes,
          total_bytes: totalBytes,
          speed: null,
          eta: null,
          percent: 100,
          status: "finished",
          filename: filepath,
        });
      }
    } catch (err) {
      await writer.end();
      throw err;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
