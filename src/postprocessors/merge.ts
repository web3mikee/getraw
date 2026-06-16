import { PostProcessor, PostProcessError } from "../core/types";
import type { InfoDict, PostProcessResult } from "../core/types";
import { FFmpegRunner } from "./ffmpeg";
import { join, dirname, extname, basename } from "node:path";

type MergeContainer = "mkv" | "mp4" | "webm";

const COPY_COMPATIBLE: Record<MergeContainer, { video: string[]; audio: string[] }> = {
  mkv: {
    video: ["h264", "hevc", "vp8", "vp9", "av1", "mpeg4", "theora"],
    audio: ["aac", "mp3", "opus", "vorbis", "flac", "ac3", "eac3", "truehd", "dts"],
  },
  mp4: {
    video: ["h264", "hevc", "av1"],
    audio: ["aac", "mp3", "ac3", "eac3"],
  },
  webm: {
    video: ["vp8", "vp9", "av1"],
    audio: ["opus", "vorbis"],
  },
};

export interface MergeOptions {
  outputContainer?: MergeContainer;
  audioFilepath?: string;
  ffmpegLocation?: string | null;
  onProgress?: (percent: number) => void;
}

export class MergePostProcessor extends PostProcessor {
  readonly _NAME = "Merger";

  private opts: MergeOptions;

  constructor(opts: MergeOptions = {}) {
    super();
    this.opts = opts;
  }

  async run(info: InfoDict, filepath: string): Promise<PostProcessResult> {
    const audioPath = this.opts.audioFilepath;
    if (!audioPath) {
      return { filepath, info, files_to_delete: [] };
    }

    const container = this.opts.outputContainer ?? inferContainer(filepath);
    const dir = dirname(filepath);
    const stem = basename(filepath, extname(filepath));
    const outputPath = join(dir, `${stem}.${container}`);

    const runner = await FFmpegRunner.detect(this.opts.ffmpegLocation);

    const vcodec = info.requested_formats?.[0]?.vcodec?.split(".")[0] ?? "";
    const acodec = info.requested_formats?.[1]?.acodec?.split(".")[0] ?? "";

    const compatible = COPY_COMPATIBLE[container];
    const canCopyVideo = compatible.video.includes(vcodec);
    const canCopyAudio = compatible.audio.includes(acodec);

    const args: string[] = [
      "-i", filepath,
      "-i", audioPath,
    ];

    if (canCopyVideo && canCopyAudio) {
      args.push("-c", "copy");
    } else {
      args.push(
        "-c:v", canCopyVideo ? "copy" : "libx264",
        "-c:a", canCopyAudio ? "copy" : "aac",
      );
    }

    if (container === "mp4") {
      args.push("-movflags", "+faststart");
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
      files_to_delete: outputPath !== filepath ? [filepath, audioPath] : [],
    };
  }
}

function inferContainer(filepath: string): MergeContainer {
  const ext = extname(filepath).slice(1).toLowerCase();
  if (ext === "mkv" || ext === "mp4" || ext === "webm") {
    return ext as MergeContainer;
  }
  return "mkv";
}
