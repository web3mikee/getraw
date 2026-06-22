import { PostProcessError } from "../core/types";
import { runCapture, spawnStderr } from "../utils/runtime";

export interface FFmpegProgress {
  frame?: number;
  fps?: number;
  time?: string;
  speed?: string;
  percent?: number;
}

export type ProgressCallback = (progress: FFmpegProgress) => void;

export class FFmpegRunner {
  private binary: string;

  constructor(binary: string = "ffmpeg") {
    this.binary = binary;
  }

  static async detect(ffmpegLocation?: string | null): Promise<FFmpegRunner> {
    const candidates = ffmpegLocation
      ? [ffmpegLocation, "ffmpeg"]
      : ["ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg", "/usr/bin/ffmpeg"];

    for (const candidate of candidates) {
      try {
        const result = await runCapture(candidate, ["-version"]);
        if (result.exitCode === 0) {
          return new FFmpegRunner(candidate);
        }
      } catch {
        continue;
      }
    }

    throw new PostProcessError(
      "FFmpeg not found. Install FFmpeg or pass --ffmpeg-location.",
    );
  }

  async checkCapabilities(): Promise<{ codecs: string[]; formats: string[] }> {
    const [codecResult, formatResult] = await Promise.all([
      runCapture(this.binary, ["-codecs", "-v", "quiet"]),
      runCapture(this.binary, ["-formats", "-v", "quiet"]),
    ]);

    const codecs = codecResult.stdout
      .split("\n")
      .filter((l) => /^\s*[D.][E.][VASD.][I.][L.][S.]/.test(l))
      .map((l) => l.trim().split(/\s+/)[1])
      .filter(Boolean) as string[];

    const formats = formatResult.stdout
      .split("\n")
      .filter((l) => /^\s*[D.][E.]/.test(l))
      .map((l) => l.trim().split(/\s+/)[1])
      .filter(Boolean) as string[];

    return { codecs, formats };
  }

  async run(
    args: string[],
    onProgress?: ProgressCallback,
    durationSeconds?: number,
  ): Promise<void> {
    const decoder = new TextDecoder();
    let partialLine = "";

    const { exitCode, stderr } = await spawnStderr(
      this.binary,
      ["-y", ...args],
      (value) => {
        if (!onProgress) return;
        partialLine += decoder.decode(value, { stream: true });
        const lines = partialLine.split("\r");
        partialLine = lines[lines.length - 1];
        for (const line of lines.slice(0, -1)) {
          const progress = parseFFmpegProgress(line, durationSeconds);
          if (progress) onProgress(progress);
        }
      },
    );

    if (exitCode !== 0) {
      const lastLines = stderr.split("\n").slice(-5).join("\n");
      throw new PostProcessError(`FFmpeg failed (exit ${exitCode}):\n${lastLines}`);
    }
  }

  getBinary(): string {
    return this.binary;
  }
}

function parseFFmpegProgress(line: string, durationSeconds?: number): FFmpegProgress | null {
  if (!line.includes("time=") && !line.includes("frame=")) return null;

  const progress: FFmpegProgress = {};

  const frameMatch = line.match(/frame=\s*(\d+)/);
  if (frameMatch) progress.frame = parseInt(frameMatch[1], 10);

  const fpsMatch = line.match(/fps=\s*([\d.]+)/);
  if (fpsMatch) progress.fps = parseFloat(fpsMatch[1]);

  const timeMatch = line.match(/time=\s*([\d:]+\.?\d*)/);
  if (timeMatch) {
    progress.time = timeMatch[1];
    if (durationSeconds && durationSeconds > 0) {
      const elapsed = parseTimeToSeconds(timeMatch[1]);
      progress.percent = Math.min(100, (elapsed / durationSeconds) * 100);
    }
  }

  const speedMatch = line.match(/speed=\s*([\d.]+x)/);
  if (speedMatch) progress.speed = speedMatch[1];

  return Object.keys(progress).length > 0 ? progress : null;
}

function parseTimeToSeconds(time: string): number {
  const parts = time.split(":").map(parseFloat);
  if (parts.length === 3) {
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  }
  if (parts.length === 2) {
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  }
  return parts[0] ?? 0;
}
