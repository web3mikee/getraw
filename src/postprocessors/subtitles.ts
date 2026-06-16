import { PostProcessor, PostProcessError } from "../core/types";
import type { InfoDict, PostProcessResult, Subtitle } from "../core/types";
import { FFmpegRunner } from "./ffmpeg";
import { dirname, basename, extname, join } from "node:path";

export type SubtitleFormat = "srt" | "ass" | "vtt" | "json3" | "lrc";
export type EmbedMode = "soft" | "burn";

export interface SubtitleOptions {
  convertTo?: SubtitleFormat;
  embed?: EmbedMode;
  language?: string;
  ffmpegLocation?: string | null;
  onProgress?: (percent: number) => void;
}

export class SubtitlePostProcessor extends PostProcessor {
  readonly _NAME = "Subtitles";

  private opts: SubtitleOptions;

  constructor(opts: SubtitleOptions = {}) {
    super();
    this.opts = opts;
  }

  async run(info: InfoDict, filepath: string): Promise<PostProcessResult> {
    const lang = this.opts.language ?? "en";
    const subsMap = info.subtitles ?? info.automatic_captions ?? {};
    const subs: Subtitle[] | undefined = subsMap[lang] ?? Object.values(subsMap)[0];

    if (!subs || subs.length === 0) {
      return { filepath, info, files_to_delete: [] };
    }

    const filesToDelete: string[] = [];
    const runner = await FFmpegRunner.detect(this.opts.ffmpegLocation);
    const dir = dirname(filepath);
    const stem = basename(filepath, extname(filepath));
    const videoExt = extname(filepath).slice(1).toLowerCase();

    let subPath: string | null = null;
    let subData: string | null = null;

    for (const sub of subs) {
      if (sub.data) {
        subData = sub.data;
        break;
      }
      if (sub.url) {
        const res = await fetch(sub.url);
        if (res.ok) {
          subData = await res.text();
          break;
        }
      }
    }

    if (!subData) {
      return { filepath, info, files_to_delete: [] };
    }

    const sourceSub = subs[0];
    const sourceExt = (sourceSub?.ext ?? "vtt") as SubtitleFormat;

    if (this.opts.convertTo && this.opts.convertTo !== sourceExt) {
      const convertedPath = join(dir, `${stem}.${lang}.${this.opts.convertTo}`);
      await convertSubtitle(runner, subData, sourceExt, this.opts.convertTo, convertedPath);
      subPath = convertedPath;
      filesToDelete.push(convertedPath);
    } else {
      subPath = join(dir, `${stem}.${lang}.${sourceExt}`);
      await Bun.write(subPath, subData);
      filesToDelete.push(subPath);
    }

    if (!subPath) {
      return { filepath, info, files_to_delete: filesToDelete };
    }

    const embed = this.opts.embed;

    if (embed === "soft") {
      const outputPath = await softEmbed(runner, filepath, subPath, lang, videoExt, info);
      return {
        filepath: outputPath,
        info,
        files_to_delete: outputPath !== filepath
          ? [filepath, ...filesToDelete]
          : filesToDelete,
      };
    }

    if (embed === "burn") {
      const outputPath = await burnInSubtitle(runner, filepath, subPath, videoExt, info, this.opts.onProgress);
      return {
        filepath: outputPath,
        info,
        files_to_delete: outputPath !== filepath
          ? [filepath, ...filesToDelete]
          : filesToDelete,
      };
    }

    return { filepath, info, files_to_delete: filesToDelete };
  }
}

async function convertSubtitle(
  runner: FFmpegRunner,
  data: string,
  fromExt: SubtitleFormat,
  toExt: SubtitleFormat,
  outputPath: string,
): Promise<void> {
  if ((fromExt === "json3" || toExt === "json3") || fromExt === "lrc" || toExt === "lrc") {
    const converted = convertNative(data, fromExt, toExt);
    await Bun.write(outputPath, converted);
    return;
  }

  const tmpInput = outputPath + ".tmp_in." + fromExt;
  await Bun.write(tmpInput, data);

  await runner.run(["-i", tmpInput, outputPath]);

  const { unlink } = await import("node:fs/promises");
  await unlink(tmpInput);
}

function convertNative(data: string, from: SubtitleFormat, to: SubtitleFormat): string {
  if (from === "json3") {
    const srtData = json3ToSrt(data);
    if (to === "srt") return srtData;
    if (to === "vtt") return srtToVtt(srtData);
    if (to === "lrc") return srtToLrc(srtData);
    return srtData;
  }
  if (from === "vtt" && to === "srt") return vttToSrt(data);
  if (from === "srt" && to === "vtt") return srtToVtt(data);
  if (from === "srt" && to === "lrc") return srtToLrc(data);
  return data;
}

function json3ToSrt(json: string): string {
  interface Json3Event {
    tStartMs: number;
    dDurationMs: number;
    segs?: Array<{ utf8: string }>;
  }
  const parsed = JSON.parse(json) as { events?: Json3Event[] };
  const events = parsed.events ?? [];
  const lines: string[] = [];
  let index = 1;

  for (const ev of events) {
    if (!ev.segs) continue;
    const text = ev.segs.map((s) => s.utf8).join("").replace(/\n$/, "");
    if (!text.trim()) continue;
    const start = msToSrtTime(ev.tStartMs);
    const end = msToSrtTime(ev.tStartMs + ev.dDurationMs);
    lines.push(`${index}\n${start} --> ${end}\n${text}\n`);
    index++;
  }

  return lines.join("\n");
}

function msToSrtTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msPart = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msPart, 3)}`;
}

function vttToSrt(vtt: string): string {
  return vtt
    .replace(/^WEBVTT.*\n?/m, "")
    .replace(/^\d+:\d+:\d+\.\d+ --> \d+:\d+:\d+\.\d+.*$/gm, (m) =>
      m.replace(/\./g, ","),
    )
    .trim();
}

function srtToVtt(srt: string): string {
  return "WEBVTT\n\n" + srt.replace(/,(\d{3})/g, ".$1");
}

function srtToLrc(srt: string): string {
  const lines: string[] = [];
  const blocks = srt.split(/\n\n+/);
  for (const block of blocks) {
    const blockLines = block.trim().split("\n");
    if (blockLines.length < 3) continue;
    const timeLine = blockLines[1] ?? "";
    const startMatch = timeLine.match(/^(\d{2}:\d{2}:\d{2}),(\d{3})/);
    if (!startMatch) continue;
    const [, time, ms] = startMatch;
    const [h, m, s] = (time ?? "").split(":").map(Number);
    const totalMin = (h ?? 0) * 60 + (m ?? 0);
    const sec = s ?? 0;
    const text = blockLines.slice(2).join(" ");
    lines.push(`[${pad(totalMin)}:${pad(sec)}.${(ms ?? "00").slice(0, 2)}]${text}`);
  }
  return lines.join("\n");
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

async function softEmbed(
  runner: FFmpegRunner,
  videoPath: string,
  subPath: string,
  lang: string,
  ext: string,
  info: InfoDict,
): Promise<string> {
  const dir = dirname(videoPath);
  const stem = basename(videoPath, extname(videoPath));
  const outPath = join(dir, `${stem}.${ext}`);
  const tmpPath = join(dir, `${stem}.sub_tmp.${ext}`);

  let args: string[];

  if (ext === "mkv") {
    args = [
      "-i", videoPath,
      "-i", subPath,
      "-c", "copy",
      "-metadata:s:s:0", `language=${lang}`,
      tmpPath,
    ];
  } else if (ext === "mp4") {
    args = [
      "-i", videoPath,
      "-i", subPath,
      "-c", "copy",
      "-c:s", "mov_text",
      "-metadata:s:s:0", `language=${lang}`,
      tmpPath,
    ];
  } else {
    return videoPath;
  }

  await runner.run(args, undefined, info.duration);

  const { rename } = await import("node:fs/promises");
  await rename(tmpPath, outPath);
  return outPath;
}

async function burnInSubtitle(
  runner: FFmpegRunner,
  videoPath: string,
  subPath: string,
  ext: string,
  info: InfoDict,
  onProgress?: (p: number) => void,
): Promise<string> {
  const dir = dirname(videoPath);
  const stem = basename(videoPath, extname(videoPath));
  const outPath = join(dir, `${stem}_hardsub.${ext}`);

  const subExt = extname(subPath).slice(1).toLowerCase();
  const filter = subExt === "ass" ? `ass=${subPath}` : `subtitles=${subPath}`;

  const args = [
    "-i", videoPath,
    "-vf", filter,
    "-c:a", "copy",
    outPath,
  ];

  await runner.run(
    args,
    onProgress ? (p) => { if (p.percent !== undefined) onProgress(p.percent); } : undefined,
    info.duration,
  );

  return outPath;
}
