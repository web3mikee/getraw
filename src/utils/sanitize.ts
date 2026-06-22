const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const RESERVED_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

export function sanitizeFilename(filename: string): string {
  let sanitized = filename.replace(ILLEGAL_CHARS, "_");
  sanitized = sanitized.replace(/\.+$/, "");
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  if (sanitized.length === 0) {
    sanitized = "download";
  }

  const parts = sanitized.split(".");
  if (parts.length > 1) {
    const name = parts.slice(0, -1).join(".");
    const ext = parts[parts.length - 1];
    if (RESERVED_NAMES.has(name.toUpperCase())) {
      return `_${name}.${ext}`;
    }
    return `${name}.${ext}`;
  }

  if (RESERVED_NAMES.has(sanitized.toUpperCase())) {
    return `_${sanitized}`;
  }

  return sanitized;
}

export function sanitizePath(path: string): string {
  return path
    .split("/")
    .map((part) => (part === "" ? "" : sanitizeFilename(part)))
    .join("/");
}

export function sanitizeFieldValue(value: string): string {
  return value.replace(ILLEGAL_CHARS, "_");
}
