import { PostProcessor } from "../core/types";
import type { InfoDict, PostProcessResult } from "../core/types";
import { FFmpegRunner } from "./ffmpeg";
import { dirname, basename, extname, join } from "node:path";

export interface MetadataOptions {
  title?: string;
  artist?: string;
  date?: string;
  description?: string;
  comment?: string;
  ffmpegLocation?: string | null;
}

export class MetadataPostProcessor extends PostProcessor {
  readonly _NAME = "EmbedMetadata";

  private opts: MetadataOptions;

  constructor(opts: MetadataOptions = {}) {
    super();
    this.opts = opts;
  }

  async run(info: InfoDict, filepath: string): Promise<PostProcessResult> {
    const ext = extname(filepath).slice(1).toLowerCase();
    const dir = dirname(filepath);
    const stem = basename(filepath, extname(filepath));
    const tmpPath = join(dir, `${stem}.meta_tmp.${ext}`);

    const runner = await FFmpegRunner.detect(this.opts.ffmpegLocation);

    const title = this.opts.title ?? info.title;
    const artist = this.opts.artist ?? info.uploader ?? info.channel;
    const date = this.opts.date ?? info.upload_date;
    const description = this.opts.description ?? info.description;
    const comment = this.opts.comment;

    const args: string[] = ["-i", filepath, "-map", "0", "-c", "copy", "-map_metadata", "0"];

    const isMp4 = ext === "mp4" || ext === "m4a" || ext === "mov";
    const isMkv = ext === "mkv" || ext === "mka" || ext === "webm";

    if (isMp4) {
      if (title) args.push("-metadata", `title=${title}`);
      if (artist) args.push("-metadata", `artist=${artist}`);
      if (date) args.push("-metadata", `date=${date}`);
      if (description) args.push("-metadata", `description=${description}`);
      if (comment) args.push("-metadata", `comment=${comment}`);
    } else if (isMkv) {
      if (title) args.push("-metadata", `TITLE=${title}`);
      if (artist) args.push("-metadata", `ARTIST=${artist}`);
      if (date) args.push("-metadata", `DATE=${date}`);
      if (description) args.push("-metadata", `DESCRIPTION=${description}`);
      if (comment) args.push("-metadata", `COMMENT=${comment}`);
    } else {
      if (title) args.push("-metadata", `title=${title}`);
      if (artist) args.push("-metadata", `artist=${artist}`);
      if (date) args.push("-metadata", `date=${date}`);
      if (description) args.push("-metadata", `description=${description}`);
      if (comment) args.push("-metadata", `comment=${comment}`);
    }

    args.push(tmpPath);

    await runner.run(args);

    const { rename } = await import("node:fs/promises");
    await rename(tmpPath, filepath);

    return { filepath, info, files_to_delete: [] };
  }
}
