import { PostProcessor, PostProcessError } from "../core/types";
import type { InfoDict, PostProcessResult } from "../core/types";
import { FFmpegRunner } from "./ffmpeg";
import { dirname, basename, extname, join } from "node:path";

export type AudioFormat = "mp3" | "flac" | "wav" | "aac" | "opus" | "vorbis" | "m4a";

const FORMAT_CODEC: Record<AudioFormat, string> = {
  mp3: "libmp3lame",
  flac: "flac",
  wav: "pcm_s16le",
  aac: "aac",
  opus: "libopus",
  vorbis: "libvorbis",
  m4a: "aac",
};

const FORMAT_EXT: Record<AudioFormat, string> = {
  mp3: "mp3",
  flac: "flac",
  wav: "wav",
  aac: "aac",
  opus: "opus",
  vorbis: "ogg",
  m4a: "m4a",
};

export interface ExtractAudioOptions {
  format?: AudioFormat;
  quality?: number;
  preserveMetadata?: boolean;
  ffmpegLocation?: string | null;
  onProgress?: (percent: number) => void;
}

export class ExtractAudioPostProcessor extends PostProcessor {
  readonly _NAME = "ExtractAudio";

  private opts: ExtractAudioOptions;

  constructor(opts: ExtractAudioOptions = {}) {
    super();
    this.opts = opts;
  }

  async run(info: InfoDict, filepath: string): Promise<PostProcessResult> {
    const format: AudioFormat = this.opts.format ?? "mp3";
    const codec = FORMAT_CODEC[format];
    const ext = FORMAT_EXT[format];

    const dir = dirname(filepath);
    const stem = basename(filepath, extname(filepath));
    const outputPath = join(dir, `${stem}.${ext}`);

    const runner = await FFmpegRunner.detect(this.opts.ffmpegLocation);

    const args: string[] = ["-i", filepath, "-vn", "-acodec", codec];

    const quality = this.opts.quality ?? 5;

    if (format === "mp3") {
      args.push("-q:a", String(quality));
    } else if (format === "opus") {
      const bitrate = qualityToBitrate(quality, 32, 320);
      args.push("-b:a", `${bitrate}k`);
    } else if (format === "vorbis") {
      args.push("-q:a", String(quality));
    } else if (format === "aac" || format === "m4a") {
      const bitrate = qualityToBitrate(quality, 32, 320);
      args.push("-b:a", `${bitrate}k`);
    }

    if (this.opts.preserveMetadata !== false) {
      args.push("-map_metadata", "0");
    }

    args.push(outputPath);

    await runner.run(
      args,
      this.opts.onProgress
        ? (p) => { if (p.percent !== undefined) this.opts.onProgress!(p.percent); }
        : undefined,
      info.duration,
    );

    return {
      filepath: outputPath,
      info,
      files_to_delete: outputPath !== filepath ? [filepath] : [],
    };
  }
}

function qualityToBitrate(quality: number, min: number, max: number): number {
  const clamped = Math.max(0, Math.min(10, quality));
  return Math.round(min + ((10 - clamped) / 10) * (max - min));
}
