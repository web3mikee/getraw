type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

const RESET = "\x1b[0m";

class Logger {
  private level: LogLevel = "info";
  private quiet = false;
  private progressLine = "";

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setQuiet(quiet: boolean): void {
    this.quiet = quiet;
  }

  debug(msg: string): void {
    this.log("debug", msg);
  }

  info(msg: string): void {
    this.log("info", msg);
  }

  warn(msg: string): void {
    this.log("warn", msg);
  }

  error(msg: string): void {
    this.log("error", msg);
  }

  progress(percent: number | null, speed: number | null, eta: number | null, filename: string): void {
    if (this.quiet) return;

    const pct = percent !== null ? `${percent.toFixed(1)}%` : "???%";
    const spd = speed !== null ? formatBytes(speed) + "/s" : "N/A";
    const etaStr = eta !== null ? formatEta(eta) : "N/A";
    const bar = percent !== null ? renderBar(percent, 30) : "[" + " ".repeat(30) + "]";

    this.progressLine = `\r${bar} ${pct} of ${filename} at ${spd} ETA ${etaStr}`;
    process.stderr.write(this.progressLine);
  }

  clearProgress(): void {
    if (this.progressLine) {
      process.stderr.write("\r" + " ".repeat(this.progressLine.length) + "\r");
      this.progressLine = "";
    }
  }

  private log(level: LogLevel, msg: string): void {
    if (this.quiet && level !== "error") return;
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;

    if (this.progressLine) {
      this.clearProgress();
    }

    const color = LEVEL_COLORS[level];
    const prefix = level === "info" ? "" : `${color}[${level}]${RESET} `;
    process.stderr.write(`${prefix}${msg}\n`);
  }
}

function renderBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${" ".repeat(empty)}]`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GiB`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`;
}

export const logger = new Logger();
export { Logger, formatBytes, formatEta };
