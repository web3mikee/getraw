import { PostProcessor, PostProcessError } from "../core/types";
import type { InfoDict, PostProcessResult, Chapter } from "../core/types";
import { FFmpegRunner } from "./ffmpeg";
import { dirname, basename, extname, join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";

const SPONSORBLOCK_API = "https://sponsor.ajay.app/api/skipSegments?videoID=";

export type SponsorCategory =
  | "sponsor"
  | "selfpromo"
  | "interaction"
  | "intro"
  | "outro"
  | "preview"
  | "filler"
  | "music_offtopic";

interface SponsorSegment {
  segment: [number, number];
  category: SponsorCategory;
  UUID: string;
  videoDuration: number;
}

export interface SponsorBlockOptions {
  categories?: SponsorCategory[];
  ffmpegLocation?: string | null;
  onProgress?: (percent: number) => void;
}

export class SponsorBlockPostProcessor extends PostProcessor {
  readonly _NAME = "SponsorBlock";

  private opts: SponsorBlockOptions;

  constructor(opts: SponsorBlockOptions = {}) {
    super();
    this.opts = opts;
  }

  async run(info: InfoDict, filepath: string): Promise<PostProcessResult> {
    const videoId = info.id;
    if (!videoId) return { filepath, info, files_to_delete: [] };

    const categories = this.opts.categories ?? ["sponsor"];
    const segments = await fetchSegments(videoId, categories);

    if (segments.length === 0) {
      return { filepath, info, files_to_delete: [] };
    }

    const duration = info.duration ?? segments[0]?.videoDuration ?? 0;
    const keepSegments = invertSegments(segments.map((s) => s.segment), duration);

    if (keepSegments.length === 0) {
      return { filepath, info, files_to_delete: [] };
    }

    const runner = await FFmpegRunner.detect(this.opts.ffmpegLocation);
    const dir = dirname(filepath);
    const ext = extname(filepath).slice(1).toLowerCase();
    const stem = basename(filepath, extname(filepath));
    const tmpPath = join(dir, `${stem}.sb_tmp.${ext}`);

    const segmentListPath = join(dir, `${stem}.segments.txt`);
    const segmentListContent = keepSegments
      .map(([s, e]) => `inpoint ${s}\noutpoint ${e}`)
      .join("\n");

    await writeFile(segmentListPath, segmentListContent, "utf8");

    const args = [
      "-i", filepath,
      "-f", "concat",
      "-safe", "0",
      "-i", segmentListPath,
      "-c", "copy",
      tmpPath,
    ];

    try {
      await runner.run(
        args,
        this.opts.onProgress
          ? (p) => { if (p.percent !== undefined) this.opts.onProgress!(p.percent); }
          : undefined,
        duration,
      );
    } finally {
      await unlink(segmentListPath).catch(() => undefined);
    }

    const updatedChapters = rewriteChapters(info.chapters ?? [], segments.map((s) => s.segment));
    const updatedInfo: InfoDict = { ...info, chapters: updatedChapters };

    const { rename } = await import("node:fs/promises");
    await rename(tmpPath, filepath);

    return { filepath, info: updatedInfo, files_to_delete: [] };
  }
}

async function fetchSegments(
  videoId: string,
  categories: SponsorCategory[],
): Promise<SponsorSegment[]> {
  const catParam = categories.map((c) => `categories[]=${encodeURIComponent(c)}`).join("&");
  const url = `${SPONSORBLOCK_API}${encodeURIComponent(videoId)}&${catParam}`;

  const res = await fetch(url);
  if (res.status === 404) return [];
  if (!res.ok) throw new PostProcessError(`SponsorBlock API error: HTTP ${res.status}`);

  return (await res.json()) as SponsorSegment[];
}

function invertSegments(
  skipSegments: [number, number][],
  duration: number,
): [number, number][] {
  const sorted = skipSegments.slice().sort((a, b) => a[0] - b[0]);
  const keep: [number, number][] = [];
  let cursor = 0;

  for (const [start, end] of sorted) {
    if (cursor < start) keep.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }

  if (cursor < duration) keep.push([cursor, duration]);

  return keep.filter(([s, e]) => e - s > 0.1);
}

function rewriteChapters(
  chapters: Chapter[],
  removedSegments: [number, number][],
): Chapter[] {
  if (chapters.length === 0) return chapters;

  const kept = chapters.filter((ch) => {
    for (const [s, e] of removedSegments) {
      if (ch.start_time >= s && ch.end_time <= e) return false;
    }
    return true;
  });

  const removedSorted = removedSegments.slice().sort((a, b) => a[0] - b[0]);

  return kept.map((ch) => {
    let removedBefore = 0;
    for (const [s, e] of removedSorted) {
      if (e <= ch.start_time) removedBefore += e - s;
    }
    return {
      ...ch,
      start_time: ch.start_time - removedBefore,
      end_time: ch.end_time - removedBefore,
    };
  });
}
