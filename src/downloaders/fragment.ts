import { DownloadError } from "../core/types";
import type { DownloadOptions, DownloadProgress } from "../core/types";
import { logger } from "../core/logger";

export interface Segment {
  url: string;
  index: number;
  byteRange?: { start: number; end: number };
  key?: { method: string; uri: string; iv?: string };
  isInit?: boolean;
}

export interface FragmentDownloadOptions extends DownloadOptions {
  concurrency?: number;
  tempDir?: string;
}

export class FragmentDownloader {
  private completedSegments = new Set<number>();

  async downloadSegments(
    segments: Segment[],
    outputPath: string,
    options: FragmentDownloadOptions,
  ): Promise<void> {
    const concurrency = options.concurrency ?? 8;
    const tempDir = options.tempDir ?? "/tmp/dlpx-fragments";

    await Bun.$`mkdir -p ${tempDir}`.quiet();

    const stateFile = `${tempDir}/completed.json`;
    try {
      const stateData = await Bun.file(stateFile).text();
      const state = JSON.parse(stateData) as { completed: number[] };
      this.completedSegments = new Set(state.completed);
    } catch {
      this.completedSegments = new Set();
    }

    const pending = segments.filter((s) => !this.completedSegments.has(s.index));
    const total = segments.length;
    let done = this.completedSegments.size;

    const keyCache = new Map<string, Uint8Array>();

    const downloadSegment = async (seg: Segment): Promise<void> => {
      const segPath = `${tempDir}/seg-${seg.index.toString().padStart(6, "0")}`;
      const retries = options.retries ?? 3;

      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const headers: Record<string, string> = { ...options.headers };
          if (seg.byteRange) {
            headers["Range"] = `bytes=${seg.byteRange.start}-${seg.byteRange.end}`;
          }

          const resp = await fetch(seg.url, { headers });
          if (!resp.ok) {
            throw new DownloadError(`HTTP ${resp.status} on segment ${seg.index}`);
          }

          let data = new Uint8Array(await resp.arrayBuffer());

          if (seg.key && seg.key.method === "AES-128") {
            data = await this.decryptAes128(data, seg.key, seg.index, keyCache, options.headers);
          }

          await Bun.write(segPath, data);
          this.completedSegments.add(seg.index);
          await Bun.write(
            stateFile,
            JSON.stringify({ completed: Array.from(this.completedSegments) }),
          );

          done++;
          const percent = (done / total) * 100;
          if (options.onProgress) {
            const progress: DownloadProgress = {
              downloaded_bytes: done,
              total_bytes: total,
              speed: null,
              eta: null,
              percent,
              status: "downloading",
              filename: outputPath,
            };
            options.onProgress(progress);
          }

          return;
        } catch (err) {
          if (attempt === retries) throw err;
          const delay = 1000 * Math.pow(2, attempt - 1);
          logger.warn(`Segment ${seg.index} attempt ${attempt} failed, retrying in ${delay}ms`);
          await sleep(delay);
        }
      }
    };

    await runConcurrent(pending, concurrency, downloadSegment);

    await this.concatenateSegments(segments, tempDir, outputPath);

    try {
      await Bun.$`rm -rf ${tempDir}`.quiet();
    } catch {
      // ignore cleanup errors
    }

    if (options.onProgress) {
      options.onProgress({
        downloaded_bytes: total,
        total_bytes: total,
        speed: null,
        eta: null,
        percent: 100,
        status: "finished",
        filename: outputPath,
      });
    }
  }

  private async concatenateSegments(
    segments: Segment[],
    tempDir: string,
    outputPath: string,
  ): Promise<void> {
    const writer = Bun.file(outputPath).writer();
    const ordered = segments.slice().sort((a, b) => a.index - b.index);

    for (const seg of ordered) {
      const segPath = `${tempDir}/seg-${seg.index.toString().padStart(6, "0")}`;
      try {
        const data = await Bun.file(segPath).arrayBuffer();
        writer.write(new Uint8Array(data));
      } catch (err) {
        throw new DownloadError(`Missing segment ${seg.index}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await writer.end();
  }

  private async decryptAes128(
    data: Uint8Array,
    key: { method: string; uri: string; iv?: string },
    segmentIndex: number,
    keyCache: Map<string, Uint8Array>,
    headers?: Record<string, string>,
  ): Promise<Uint8Array> {
    let keyBytes = keyCache.get(key.uri);
    if (!keyBytes) {
      const resp = await fetch(key.uri, { headers: headers ?? {} });
      if (!resp.ok) {
        throw new DownloadError(`Failed to fetch AES key: HTTP ${resp.status}`);
      }
      keyBytes = new Uint8Array(await resp.arrayBuffer());
      keyCache.set(key.uri, keyBytes);
    }

    const iv = key.iv
      ? hexToBytes(key.iv.replace("0x", "").replace("0X", ""))
      : segmentIndexToIv(segmentIndex);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-CBC" },
      false,
      ["decrypt"],
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      cryptoKey,
      data,
    );

    return new Uint8Array(decrypted);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function segmentIndexToIv(index: number): Uint8Array {
  const iv = new Uint8Array(16);
  const view = new DataView(iv.buffer);
  view.setUint32(12, index, false);
  return iv;
}

async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers: Promise<void>[] = [];

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) {
        await fn(item);
      }
    }
  };

  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { runConcurrent, sleep };
