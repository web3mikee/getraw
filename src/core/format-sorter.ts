import type { Format } from "./types";

interface FormatSpec {
  type: "merge" | "single";
  video?: FormatFilter;
  audio?: FormatFilter;
  fallback?: FormatSpec;
}

interface FormatFilter {
  id?: string;
  best: boolean;
  worst: boolean;
  videoOnly: boolean;
  audioOnly: boolean;
  height?: number;
  ext?: string;
}

function parseFilter(token: string): FormatFilter {
  const filter: FormatFilter = {
    best: false,
    worst: false,
    videoOnly: false,
    audioOnly: false,
  };

  if (token === "best" || token === "b") {
    filter.best = true;
    return filter;
  }
  if (token === "worst" || token === "w") {
    filter.worst = true;
    return filter;
  }
  if (token === "bv" || token === "bestvideo") {
    filter.best = true;
    filter.videoOnly = true;
    return filter;
  }
  if (token === "ba" || token === "bestaudio") {
    filter.best = true;
    filter.audioOnly = true;
    return filter;
  }
  if (token === "wv" || token === "worstvideo") {
    filter.worst = true;
    filter.videoOnly = true;
    return filter;
  }
  if (token === "wa" || token === "worstaudio") {
    filter.worst = true;
    filter.audioOnly = true;
    return filter;
  }
  if (token.startsWith("bv*")) {
    filter.best = true;
    filter.videoOnly = false;
    return filter;
  }

  const heightMatch = token.match(/^(\d+)p$/);
  if (heightMatch) {
    filter.height = parseInt(heightMatch[1], 10);
    filter.best = true;
    return filter;
  }

  filter.id = token;
  return filter;
}

export function parseFormatString(formatStr: string): FormatSpec {
  const alternatives = formatStr.split("/");

  const specs: FormatSpec[] = alternatives.map((alt) => {
    const parts = alt.split("+");
    if (parts.length === 2) {
      return {
        type: "merge" as const,
        video: parseFilter(parts[0].trim()),
        audio: parseFilter(parts[1].trim()),
      };
    }
    return {
      type: "single" as const,
      video: parseFilter(parts[0].trim()),
    };
  });

  let result = specs[specs.length - 1];
  for (let i = specs.length - 2; i >= 0; i--) {
    specs[i].fallback = result;
    result = specs[i];
  }
  return result;
}

function formatQualityScore(f: Format): number {
  let score = 0;
  if (f.height) score += f.height;
  if (f.tbr) score += f.tbr / 100;
  if (f.vbr) score += f.vbr / 200;
  if (f.abr) score += f.abr / 200;
  if (f.fps && f.fps > 30) score += 10;
  if (f.source_preference) score += f.source_preference;
  if (f.quality) score += f.quality * 100;
  return score;
}

function hasVideo(f: Format): boolean {
  return f.vcodec !== undefined && f.vcodec !== "none";
}

function hasAudio(f: Format): boolean {
  return f.acodec !== undefined && f.acodec !== "none";
}

function filterMatches(f: Format, filter: FormatFilter): boolean {
  if (filter.id && f.format_id !== filter.id) return false;
  if (filter.videoOnly && !hasVideo(f)) return false;
  if (filter.audioOnly && !hasAudio(f)) return false;
  if (filter.height && f.height !== filter.height) return false;
  if (filter.ext && f.ext !== filter.ext) return false;
  return true;
}

function selectFromList(formats: Format[], filter: FormatFilter): Format | null {
  const candidates = formats.filter((f) => filterMatches(f, filter));
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort(
    (a, b) => formatQualityScore(b) - formatQualityScore(a),
  );

  return filter.worst ? sorted[sorted.length - 1] : sorted[0];
}

export function selectFormats(formats: Format[], formatStr: string): Format[] {
  const spec = parseFormatString(formatStr);
  return applySpec(formats, spec);
}

function applySpec(formats: Format[], spec: FormatSpec): Format[] {
  if (spec.type === "merge" && spec.video && spec.audio) {
    const video = selectFromList(formats, spec.video);
    const audio = selectFromList(formats, spec.audio);
    if (video && audio) return [video, audio];
  }

  if (spec.type === "single" && spec.video) {
    const result = selectFromList(formats, spec.video);
    if (result) return [result];
  }

  if (spec.fallback) {
    return applySpec(formats, spec.fallback);
  }

  return [];
}

export function sortFormats(formats: Format[]): Format[] {
  return [...formats].sort(
    (a, b) => formatQualityScore(a) - formatQualityScore(b),
  );
}

export function formatFormatTable(formats: Format[]): string {
  const header = "ID".padEnd(12) +
    "EXT".padEnd(6) +
    "RESOLUTION".padEnd(14) +
    "FPS".padEnd(6) +
    " VCODEC".padEnd(12) +
    "ACODEC".padEnd(12) +
    "SIZE".padEnd(12) +
    "NOTE";
  const separator = "-".repeat(80);

  const rows = sortFormats(formats).map((f) => {
    const res = f.width && f.height ? `${f.width}x${f.height}` : (f.resolution ?? "audio");
    const fps = f.fps ? String(f.fps) : "";
    const size = f.filesize
      ? formatSize(f.filesize)
      : f.filesize_approx
        ? `~${formatSize(f.filesize_approx)}`
        : "";
    return (
      f.format_id.padEnd(12) +
      (f.ext ?? "").padEnd(6) +
      res.padEnd(14) +
      fps.padEnd(6) +
      (f.vcodec ?? "none").padEnd(12) +
      (f.acodec ?? "none").padEnd(12) +
      size.padEnd(12) +
      (f.format_note ?? "")
    );
  });

  return [header, separator, ...rows].join("\n");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GiB`;
}
