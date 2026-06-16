#!/usr/bin/env bun
import { watch } from "node:fs";
import { resolve } from "node:path";

const STATUS_PATH = resolve(import.meta.dir, "../STATUS.md");
const REFRESH_INTERVAL = 2000;

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  bgBlack: "\x1b[40m",
};

function statusEmoji(status: string): string {
  const s = status.trim().toUpperCase();
  if (s === "DONE") return `${COLORS.green}DONE${COLORS.reset}`;
  if (s === "IN PROGRESS" || s === "IN_PROGRESS") return `${COLORS.yellow}IN PROGRESS${COLORS.reset}`;
  if (s === "PENDING") return `${COLORS.dim}PENDING${COLORS.reset}`;
  if (s === "BLOCKED") return `${COLORS.red}BLOCKED${COLORS.reset}`;
  if (s === "ERROR" || s === "FAILED") return `${COLORS.red}FAILED${COLORS.reset}`;
  return status;
}

async function readStatus(): Promise<string> {
  const file = Bun.file(STATUS_PATH);
  if (!(await file.exists())) return "STATUS.md not found";
  return file.text();
}

function parseAndRender(content: string): string {
  const lines = content.split("\n");
  const output: string[] = [];

  output.push("");
  output.push(`${COLORS.bold}${COLORS.cyan}  dlpx — Agent Dashboard${COLORS.reset}`);
  output.push(`${COLORS.dim}  ${new Date().toLocaleTimeString()}${COLORS.reset}`);
  output.push("");

  let done = 0;
  let inProgress = 0;
  let pending = 0;
  let total = 0;

  for (const line of lines) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const cols = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cols.length < 4) continue;
    if (cols[0] === "#") continue;

    total++;
    const num = cols[0];
    const agent = cols[1];
    const scope = cols[2];
    const status = cols[3];
    const notes = cols[4] ?? "";

    const s = status.toUpperCase();
    if (s === "DONE") done++;
    else if (s === "IN PROGRESS" || s === "IN_PROGRESS") inProgress++;
    else pending++;

    const statusStr = statusEmoji(status);
    output.push(
      `  ${COLORS.dim}${num.padStart(2)}${COLORS.reset} ${agent.padEnd(22)} ${statusStr.padEnd(30)} ${COLORS.dim}${notes}${COLORS.reset}`,
    );
  }

  output.push("");
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const bar = renderBar(pct, 40);
  output.push(`  ${bar} ${pct}%`);
  output.push(
    `  ${COLORS.green}${done} done${COLORS.reset} / ${COLORS.yellow}${inProgress} active${COLORS.reset} / ${COLORS.dim}${pending} pending${COLORS.reset}`,
  );
  output.push("");

  return output.join("\n");
}

function renderBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `${COLORS.green}[${"█".repeat(filled)}${COLORS.dim}${"░".repeat(empty)}${COLORS.green}]${COLORS.reset}`;
}

async function render(): Promise<void> {
  const content = await readStatus();
  const display = parseAndRender(content);
  process.stdout.write("\x1b[2J\x1b[H");
  process.stdout.write(display);
}

async function main(): Promise<void> {
  await render();

  watch(STATUS_PATH, async () => {
    await render();
  });

  setInterval(render, REFRESH_INTERVAL);

  process.stdout.write(`${COLORS.dim}  Watching STATUS.md — Ctrl+C to exit${COLORS.reset}\n`);
}

main();
