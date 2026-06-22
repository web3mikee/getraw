import { PostProcessor, PostProcessError } from "../core/types";
import type { InfoDict, PostProcessResult } from "../core/types";
import { FFmpegRunner } from "./ffmpeg";
import { writeFile } from "../utils/runtime";
import { dirname, basename, extname, join } from "node:path";

export type ThumbnailFormat = "jpg" | "png" | "webp";

export interface ThumbnailOptions {
  format?: ThumbnailFormat;
  embedInAudio?: boolean;
  embedInVideo?: boolean;
  ffmpegLocation?: string | null;
}

export class ThumbnailPostProcessor extends PostProcessor {
  readonly _NAME = "EmbedThumbnail";

  private opts: ThumbnailOptions;

  constructor(opts: ThumbnailOptions = {}) {
    super();
    this.opts = opts;
  }

  async run(info: InfoDict, filepath: string): Promise<PostProcessResult> {
    const thumbnails = info.thumbnails;
    if (!thumbnails || thumbnails.length === 0) {
      return { filepath, info, files_to_delete: [] };
    }

    const best = thumbnails
      .slice()
      .sort((a, b) => (b.preference ?? 0) - (a.preference ?? 0))[0];

    if (!best?.url) {
      return { filepath, info, files_to_delete: [] };
    }

    const runner = await FFmpegRunner.detect(this.opts.ffmpegLocation);
    const dir = dirname(filepath);
    const ext = extname(filepath).slice(1).toLowerCase();

    const thumbExt = this.opts.format ?? "jpg";
    const thumbPath = join(dir, `${basename(filepath, extname(filepath))}.${thumbExt}`);
    const filesToDelete: string[] = [];

    await downloadThumbnail(best.url, thumbPath);
    filesToDelete.push(thumbPath);

    if (this.opts.embedInAudio && isAudio(ext)) {
      const result = await embedInAudio(runner, filepath, thumbPath, ext, info);
      return { ...result, files_to_delete: [...result.files_to_delete, ...filesToDelete] };
    }

    if (this.opts.embedInVideo !== false && isVideo(ext)) {
      const result = await embedInVideo(runner, filepath, thumbPath, ext, info);
      return { ...result, files_to_delete: [...result.files_to_delete, ...filesToDelete] };
    }

    return { filepath, info, files_to_delete: filesToDelete };
  }
}

async function downloadThumbnail(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new PostProcessError(`Failed to download thumbnail: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  await writeFile(dest, new Uint8Array(buffer));
}

async function embedInAudio(
  runner: FFmpegRunner,
  audioPath: string,
  thumbPath: string,
  ext: string,
  info: InfoDict,
): Promise<PostProcessResult> {
  const dir = dirname(audioPath);
  const stem = basename(audioPath, extname(audioPath));
  const tmpPath = join(dir, `${stem}.thumb_tmp.${ext}`);

  let args: string[];

  if (ext === "mp3") {
    args = [
      "-i", audioPath,
      "-i", thumbPath,
      "-map", "0:a",
      "-map", "1:v",
      "-c:a", "copy",
      "-c:v", "mjpeg",
      "-id3v2_version", "3",
      "-metadata:s:v", "title=Album cover",
      "-metadata:s:v", "comment=Cover (front)",
      tmpPath,
    ];
  } else if (ext === "m4a") {
    args = [
      "-i", audioPath,
      "-i", thumbPath,
      "-map", "0:a",
      "-map", "1:v",
      "-c:a", "copy",
      "-c:v", "copy",
      "-disposition:v:0", "attached_pic",
      tmpPath,
    ];
  } else if (ext === "flac") {
    args = [
      "-i", audioPath,
      "-i", thumbPath,
      "-map", "0",
      "-map", "1:v",
      "-c", "copy",
      "-metadata:s:v:0", "comment=Cover (front)",
      tmpPath,
    ];
  } else {
    args = [
      "-i", audioPath,
      "-i", thumbPath,
      "-map", "0:a",
      "-map", "1:v",
      "-c", "copy",
      tmpPath,
    ];
  }

  await runner.run(args, undefined, info.duration);

  const { rename } = await import("node:fs/promises");
  await rename(tmpPath, audioPath);

  return { filepath: audioPath, info, files_to_delete: [] };
}

async function embedInVideo(
  runner: FFmpegRunner,
  videoPath: string,
  thumbPath: string,
  ext: string,
  info: InfoDict,
): Promise<PostProcessResult> {
  const dir = dirname(videoPath);
  const stem = basename(videoPath, extname(videoPath));
  const tmpPath = join(dir, `${stem}.thumb_tmp.${ext}`);

  let args: string[];

  if (ext === "mkv" || ext === "webm") {
    args = [
      "-i", videoPath,
      "-attach", thumbPath,
      "-metadata:s:t", "mimetype=image/jpeg",
      "-c", "copy",
      tmpPath,
    ];
  } else if (ext === "mp4") {
    args = [
      "-i", videoPath,
      "-i", thumbPath,
      "-map", "0",
      "-map", "1",
      "-c", "copy",
      "-c:v:1", "png",
      "-disposition:v:1", "attached_pic",
      tmpPath,
    ];
  } else {
    args = [
      "-i", videoPath,
      "-i", thumbPath,
      "-map", "0",
      "-map", "1:v",
      "-c", "copy",
      tmpPath,
    ];
  }

  await runner.run(args, undefined, info.duration);

  const { rename } = await import("node:fs/promises");
  await rename(tmpPath, videoPath);

  return { filepath: videoPath, info, files_to_delete: [] };
}

function isAudio(ext: string): boolean {
  return ["mp3", "m4a", "flac", "ogg", "wav", "aac", "opus"].includes(ext);
}

function isVideo(ext: string): boolean {
  return ["mp4", "mkv", "webm", "avi", "mov"].includes(ext);
}
