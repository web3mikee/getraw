import type { InfoDict } from "./types";
import { sanitizeFieldValue, sanitizePath } from "../utils/sanitize";

const TEMPLATE_RE = /%\((\w+)\)([#0\- +]*)(\d*)(?:\.(\d+))?([sdiouxXeEfFgGcr%])/g;

export function renderTemplate(template: string, info: InfoDict): string {
  return template.replace(TEMPLATE_RE, (_match, key: string, _flags: string, _width: string, _precision: string, conversion: string) => {
    const value = getField(info, key);

    if (value === undefined || value === null) {
      return conversion === "d" ? "NA" : "NA";
    }

    if (conversion === "d" || conversion === "i") {
      return String(Math.floor(Number(value)));
    }

    if (conversion === "f" || conversion === "F") {
      return String(Number(value));
    }

    return sanitizeFieldValue(String(value));
  });
}

function getField(info: InfoDict, key: string): string | number | undefined {
  const fieldMap: Record<string, unknown> = {
    id: info.id,
    title: info.title,
    ext: info.ext ?? info.formats?.[0]?.ext ?? "unknown",
    uploader: info.uploader,
    uploader_id: info.uploader_id,
    channel: info.channel,
    channel_id: info.channel_id,
    upload_date: info.upload_date,
    duration: info.duration,
    view_count: info.view_count,
    like_count: info.like_count,
    description: info.description,
    webpage_url: info.webpage_url,
    playlist: info.playlist,
    playlist_index: info.playlist_index,
    playlist_count: info.playlist_count,
    timestamp: info.timestamp,
    age_limit: info.age_limit,
    extractor: info.extractor,
  };

  const val = fieldMap[key];
  if (val === undefined || val === null) return undefined;
  if (typeof val === "number") return val;
  return String(val);
}

export function buildFilename(template: string, info: InfoDict): string {
  const rendered = renderTemplate(template, info);
  return sanitizePath(rendered);
}
