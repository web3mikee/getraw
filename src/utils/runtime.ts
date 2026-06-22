import { readFile, writeFile as nodeWriteFile, mkdir, rm } from "node:fs/promises";
import { createWriteStream, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";

interface BunFileSink {
  write(chunk: Uint8Array): void;
  end(): Promise<number> | void;
}

interface BunFile {
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  readonly size: number;
  writer(): BunFileSink;
}

interface BunSubprocess {
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  exited: Promise<number>;
}

interface BunRuntime {
  file(path: string): BunFile;
  write(path: string, data: Uint8Array | string): Promise<number>;
  spawn(
    cmd: string[],
    opts: { stdout?: "pipe" | "ignore"; stderr?: "pipe" | "ignore" },
  ): BunSubprocess;
}

const bun = (globalThis as { Bun?: BunRuntime }).Bun;

export interface FileWriter {
  write(chunk: Uint8Array): void;
  end(): Promise<void>;
}

export async function readText(path: string): Promise<string> {
  if (bun) return bun.file(path).text();
  return readFile(path, "utf8");
}

export async function readBytes(path: string): Promise<Uint8Array> {
  if (bun) return new Uint8Array(await bun.file(path).arrayBuffer());
  return new Uint8Array(await readFile(path));
}

export async function writeFile(
  path: string,
  data: Uint8Array | string,
): Promise<void> {
  if (bun) {
    await bun.write(path, data);
    return;
  }
  await nodeWriteFile(path, data);
}

export function fileSize(path: string): number {
  if (bun) return bun.file(path).size;
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

export function createWriter(path: string): FileWriter {
  if (bun) {
    const sink = bun.file(path).writer();
    return {
      write: (chunk) => sink.write(chunk),
      end: async () => {
        await sink.end();
      },
    };
  }

  const stream = createWriteStream(path);
  return {
    write: (chunk) => {
      stream.write(chunk);
    },
    end: () =>
      new Promise<void>((resolve, reject) => {
        stream.once("error", reject);
        stream.end(() => resolve());
      }),
  };
}

let tempCounter = 0;

export function siblingTempDir(outputPath: string, tag: string): string {
  const dir = dirname(outputPath) || ".";
  tempCounter += 1;
  return join(dir, `.getraw-${tag}-${process.pid}-${tempCounter}`);
}

export async function mkdirp(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function rmrf(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export async function runCapture(
  cmd: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string }> {
  if (bun) {
    const proc = bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "ignore" });
    const stdout = proc.stdout
      ? await new Response(proc.stdout).text()
      : "";
    const exitCode = await proc.exited;
    return { exitCode, stdout };
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    proc.stdout?.on("data", (c: Buffer) => chunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) =>
      resolve({ exitCode: code ?? 0, stdout: Buffer.concat(chunks).toString() }),
    );
  });
}

export async function spawnStderr(
  cmd: string,
  args: string[],
  onChunk: (chunk: Uint8Array) => void,
): Promise<{ exitCode: number; stderr: string }> {
  const decoder = new TextDecoder();
  const stderrChunks: Uint8Array[] = [];
  const collect = (chunk: Uint8Array): void => {
    stderrChunks.push(chunk);
    onChunk(chunk);
  };

  if (bun) {
    const proc = bun.spawn([cmd, ...args], { stdout: "ignore", stderr: "pipe" });
    if (proc.stderr) {
      const reader = proc.stderr.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        collect(value);
      }
    }
    const exitCode = await proc.exited;
    const stderr = stderrChunks.map((c) => decoder.decode(c)).join("");
    return { exitCode, stderr };
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    proc.stderr?.on("data", (c: Buffer) => collect(new Uint8Array(c)));
    proc.on("error", reject);
    proc.on("close", (code) =>
      resolve({
        exitCode: code ?? 0,
        stderr: stderrChunks.map((c) => decoder.decode(c)).join(""),
      }),
    );
  });
}
