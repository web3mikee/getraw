import type { Options } from "../core/types";
import { DEFAULT_OPTIONS } from "../core/types";

interface FlagDef {
  long: string;
  short?: string;
  description: string;
  type: "boolean" | "string" | "number";
  key: keyof Options;
}

export const FLAG_DEFS: FlagDef[] = [
  { long: "--format", short: "-f", description: "Format selection string", type: "string", key: "format" },
  { long: "--output", short: "-o", description: "Output filename template", type: "string", key: "output" },
  { long: "--extract-audio", short: "-x", description: "Extract audio only", type: "boolean", key: "extractAudio" },
  { long: "--audio-format", description: "Audio format (mp3, aac, flac, etc.)", type: "string", key: "audioFormat" },
  { long: "--audio-quality", description: "Audio quality (0-10 or bitrate)", type: "string", key: "audioQuality" },
  { long: "--write-subs", description: "Write subtitles to file", type: "boolean", key: "writeSubs" },
  { long: "--sub-langs", description: "Subtitle languages", type: "string", key: "subLangs" },
  { long: "--list-formats", short: "-F", description: "List available formats", type: "boolean", key: "listFormats" },
  { long: "--dump-json", short: "-j", description: "Dump info JSON to stdout", type: "boolean", key: "dumpJson" },
  { long: "--quiet", short: "-q", description: "Suppress output", type: "boolean", key: "quiet" },
  { long: "--verbose", description: "Verbose output", type: "boolean", key: "verbose" },
  { long: "--no-progress", description: "Disable progress bar", type: "boolean", key: "noProgress" },
  { long: "--retries", short: "-R", description: "Number of retries", type: "number", key: "retries" },
  { long: "--rate-limit", short: "-r", description: "Rate limit in bytes/sec", type: "number", key: "rateLimit" },
  { long: "--proxy", description: "Proxy URL", type: "string", key: "proxy" },
  { long: "--cookies", description: "Cookie file path", type: "string", key: "cookies" },
  { long: "--user-agent", description: "Custom User-Agent", type: "string", key: "userAgent" },
  { long: "--referer", description: "Custom Referer", type: "string", key: "referer" },
  { long: "--embed-thumbnail", description: "Embed thumbnail in output", type: "boolean", key: "embedThumbnail" },
  { long: "--embed-subs", description: "Embed subtitles in output", type: "boolean", key: "embedSubs" },
  { long: "--merge-output-format", description: "Output container for merging", type: "string", key: "mergeOutputFormat" },
  { long: "--ffmpeg-location", description: "Path to ffmpeg binary", type: "string", key: "ffmpegLocation" },
  { long: "--version", short: "-v", description: "Print version", type: "boolean", key: "version" },
  { long: "--help", short: "-h", description: "Show help", type: "boolean", key: "help" },
];

export function parseArgs(args: string[]): Options {
  const options: Options = { ...DEFAULT_OPTIONS, paths: { ...DEFAULT_OPTIONS.paths }, urls: [] };
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (!arg.startsWith("-")) {
      options.urls.push(arg);
      i++;
      continue;
    }

    const def = FLAG_DEFS.find((d) => d.long === arg || d.short === arg);

    if (!def) {
      options.urls.push(arg);
      i++;
      continue;
    }

    if (def.type === "boolean") {
      (options as Record<string, unknown>)[def.key] = true;
      i++;
      continue;
    }

    const value = args[i + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (def.type === "number") {
      (options as Record<string, unknown>)[def.key] = Number(value);
    } else {
      (options as Record<string, unknown>)[def.key] = value;
    }
    i += 2;
  }

  return options;
}

export function printHelp(): void {
  const lines = [
    "getraw — Fast media downloader",
    "",
    "Usage: getraw [OPTIONS] URL [URL...]",
    "",
    "Options:",
  ];

  for (const def of FLAG_DEFS) {
    const flags = def.short ? `${def.short}, ${def.long}` : `    ${def.long}`;
    lines.push(`  ${flags.padEnd(28)} ${def.description}`);
  }

  process.stdout.write(lines.join("\n") + "\n");
}
