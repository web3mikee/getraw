import type { Subtitle } from "../../core/types";
import type { CaptionTrack } from "./innertube";

export interface TimedTextEvent {
  tStartMs: number;
  dDurationMs: number;
  segs?: Array<{ utf8: string }>;
  wWinId?: number;
}

export interface TimedTextResponse {
  events: TimedTextEvent[];
}

export function parseCaptionTracks(
  tracks: CaptionTrack[],
): { subtitles: Record<string, Subtitle[]>; automatic_captions: Record<string, Subtitle[]> } {
  const subtitles: Record<string, Subtitle[]> = {};
  const automatic_captions: Record<string, Subtitle[]> = {};

  for (const track of tracks) {
    const lang = track.languageCode;
    const name = track.name?.simpleText ?? track.name?.runs?.[0]?.text ?? lang;
    const isAuto = track.kind === "asr";
    const target = isAuto ? automatic_captions : subtitles;

    target[lang] = [
      { url: track.baseUrl, ext: "json3", name },
      { url: `${track.baseUrl}&fmt=vtt`, ext: "vtt", name },
      { url: `${track.baseUrl}&fmt=srv1`, ext: "srv1", name },
    ];
  }

  return { subtitles, automatic_captions };
}

export async function fetchCaptionData(url: string): Promise<TimedTextEvent[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch captions: ${response.status}`);
  }

  const data = (await response.json()) as TimedTextResponse;
  return data.events ?? [];
}

export function convertToSrt(events: TimedTextEvent[]): string {
  const lines: string[] = [];
  let index = 1;

  for (const event of events) {
    if (!event.segs || event.segs.length === 0) continue;

    const text = event.segs.map((s) => s.utf8).join("").trim();
    if (!text) continue;

    const startMs = event.tStartMs;
    const endMs = startMs + event.dDurationMs;

    lines.push(String(index));
    lines.push(`${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}`);
    lines.push(text);
    lines.push("");

    index++;
  }

  return lines.join("\n");
}

export function convertToVtt(events: TimedTextEvent[]): string {
  const lines: string[] = ["WEBVTT", ""];

  for (const event of events) {
    if (!event.segs || event.segs.length === 0) continue;

    const text = event.segs.map((s) => s.utf8).join("").trim();
    if (!text) continue;

    const startMs = event.tStartMs;
    const endMs = startMs + event.dDurationMs;

    lines.push(`${formatVttTime(startMs)} --> ${formatVttTime(endMs)}`);
    lines.push(text);
    lines.push("");
  }

  return lines.join("\n");
}

function formatSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

function formatVttTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
}

function pad(num: number, size: number): string {
  return String(num).padStart(size, "0");
}
