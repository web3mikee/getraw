import { Downloader, DownloadError } from "../core/types";
import type { DownloadOptions, DownloadProgress } from "../core/types";
import { logger } from "../core/logger";

const CHUNK_SIZE = 8 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;

export class HttpDownloader extends Downloader {
  readonly protocol = "https";

  canHandle(protocol: string): boolean {
    return protocol === "http" || protocol === "https";
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
        await this.downloadAttempt(url, filepath, options, attempt > 1);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < retries) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          logger.warn(`Download failed (attempt ${attempt}/${retries}): ${lastError.message}, retrying in ${delay}ms`);
          await sleep(delay);
        }
      }
    }

    throw new DownloadError(
      `Download failed after ${retries} attempts: ${lastError?.message}`,
    );
  }

  private buildHeaders(options: DownloadOptions): Record<string, string> {
    return { ...options.headers };
  }

  private async getContentLength(url: string, headers: Record<string, string>): Promise<number | null> {
    try {
      const resp = await fetch(url, { method: "HEAD", headers });
      if (resp.ok) {
        const cl = resp.headers.get("content-length");
        const acceptRanges = resp.headers.get("accept-ranges");
        if (cl && acceptRanges === "bytes") {
          return parseInt(cl, 10);
        }
      }
    } catch {
      // fall through
    }
    return null;
  }

  private async downloadAttempt(
    url: string,
    filepath: string,
    options: DownloadOptions,
    isResume: boolean,
  ): Promise<void> {
    const headers = this.buildHeaders(options);

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

    const headHeaders = this.buildHeaders(options);
    const contentLength = isResume ? null : await this.getContentLength(url, headHeaders);

    if (contentLength && contentLength > CHUNK_SIZE * 2 && !isResume) {
      await this.downloadConcurrent(url, filepath, contentLength, options);
      return;
    }

    const response = await fetch(url, { headers });
    if (!response.ok && response.status !== 206) {
      throw new DownloadError(`HTTP ${response.status}: ${response.statusText}`);
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
    const startTime = Date.now();
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
          const remaining = totalBytes ? (totalBytes - downloadedBytes) / (speed || 1) : null;
          const percent = totalBytes ? (downloadedBytes / totalBytes) * 100 : null;

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

  private async downloadConcurrent(
    url: string,
    filepath: string,
    totalBytes: number,
    options: DownloadOptions,
  ): Promise<void> {
    const concurrency = DEFAULT_CONCURRENCY;
    const chunks: Array<{ start: number; end: number; index: number }> = [];

    for (let i = 0, idx = 0; i < totalBytes; i += CHUNK_SIZE, idx++) {
      chunks.push({ start: i, end: Math.min(i + CHUNK_SIZE - 1, totalBytes - 1), index: idx });
    }

    const tempDir = `/tmp/getraw-http-${Date.now()}`;
    await Bun.$`mkdir -p ${tempDir}`.quiet();

    const baseHeaders = this.buildHeaders(options);
    let downloadedBytes = 0;
    const startTime = Date.now();

    const downloadChunk = async (chunk: { start: number; end: number; index: number }): Promise<void> => {
      const headers = { ...baseHeaders, Range: `bytes=${chunk.start}-${chunk.end}` };
      const retries = options.retries ?? 3;

      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const resp = await fetch(url, { headers });
          if (!resp.ok && resp.status !== 206) {
            throw new DownloadError(`HTTP ${resp.status} on chunk ${chunk.index}`);
          }
          const data = new Uint8Array(await resp.arrayBuffer());
          await Bun.write(`${tempDir}/chunk-${chunk.index.toString().padStart(6, "0")}`, data);

          downloadedBytes += data.byteLength;

          if (options.onProgress) {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? downloadedBytes / elapsed : 0;
            const remaining = speed > 0 ? (totalBytes - downloadedBytes) / speed : null;

            options.onProgress({
              downloaded_bytes: downloadedBytes,
              total_bytes: totalBytes,
              speed,
              eta: remaining,
              percent: (downloadedBytes / totalBytes) * 100,
              status: "downloading",
              filename: filepath,
            });
          }
          return;
        } catch (err) {
          if (attempt === retries) throw err;
          await sleep(1000 * Math.pow(2, attempt - 1));
        }
      }
    };

    const queue = [...chunks];
    const workers: Promise<void>[] = [];
    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const chunk = queue.shift();
        if (chunk !== undefined) await downloadChunk(chunk);
      }
    };
    for (let i = 0; i < Math.min(concurrency, chunks.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    const writer = Bun.file(filepath).writer();
    for (const chunk of chunks) {
      const data = await Bun.file(`${tempDir}/chunk-${chunk.index.toString().padStart(6, "0")}`).arrayBuffer();
      writer.write(new Uint8Array(data));
    }
    await writer.end();

    await Bun.$`rm -rf ${tempDir}`.quiet();

    if (options.onProgress) {
      options.onProgress({
        downloaded_bytes: totalBytes,
        total_bytes: totalBytes,
        speed: null,
        eta: null,
        percent: 100,
        status: "finished",
        filename: filepath,
      });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
