import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict, Format, Thumbnail } from "../core/types";

interface ArchiveFile {
  name?: string;
  format?: string;
  size?: string;
  length?: string;
  width?: string;
  height?: string;
  bitrate?: string;
  source?: string;
}

interface ArchiveMetadata {
  metadata?: {
    identifier?: string | string[];
    title?: string | string[];
    description?: string | string[];
    creator?: string | string[];
    date?: string | string[];
    subject?: string | string[];
  };
  files?: ArchiveFile[];
  d1?: string;
  dir?: string;
  server?: string;
}

const VIDEO_FORMATS = new Set(["h.264", "h.264 ia", "mpeg4", "mp4", "512kb mpeg4", "avi", "mov", "wmv", "webm", "ogg video", "ogv"]);
const AUDIO_FORMATS = new Set(["mp3", "flac", "ogg vorbis", "vbr mp3", "64kbps mp3", "128kbps mp3", "256kbps mp3", "aiff", "wav"]);

export class ArchiveOrgExtractor extends BaseExtractor {
  readonly _VALID_URL = /https?:\/\/(?:www\.)?archive\.org\/(?:details|download)\/([^/?#]+)/;
  readonly _NAME = "archive.org";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = url.match(this._VALID_URL);
    if (!match) throw new ExtractorError(`Invalid Archive.org URL: ${url}`);
    const itemId = match[1];

    const apiUrl = `https://archive.org/metadata/${itemId}`;
    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      throw new ExtractorError(`Archive.org API error: ${response.status}`);
    }

    const data = (await response.json()) as ArchiveMetadata;

    if (!data.metadata) {
      throw new ExtractorError("Archive.org: no metadata found");
    }

    const pick = (v: string | string[] | undefined): string | undefined =>
      Array.isArray(v) ? v[0] : v;

    const identifier = pick(data.metadata.identifier) ?? itemId;
    const title = pick(data.metadata.title) ?? itemId;
    const description = pick(data.metadata.description);
    const creator = pick(data.metadata.creator);
    const date = pick(data.metadata.date);

    const server = data.server ?? "ia800100.us.archive.org";
    const dir = data.dir ?? `/0/items/${itemId}`;
    const baseUrl = `https://${server}${dir}`;

    const files = data.files ?? [];
    const formats: Format[] = [];
    const thumbnails: Thumbnail[] = [];

    for (const file of files) {
      if (!file.name) continue;

      const fmt = (file.format ?? "").toLowerCase();
      const fileUrl = `${baseUrl}/${encodeURIComponent(file.name)}`;

      if (VIDEO_FORMATS.has(fmt)) {
        formats.push({
          format_id: file.name,
          url: fileUrl,
          ext: this.extFromName(file.name),
          width: file.width ? parseInt(file.width) : undefined,
          height: file.height ? parseInt(file.height) : undefined,
          tbr: file.bitrate ? parseFloat(file.bitrate) : undefined,
          filesize: file.size ? parseInt(file.size) : undefined,
          format_note: file.format,
          quality: file.source === "original" ? 2 : 1,
        });
      } else if (AUDIO_FORMATS.has(fmt)) {
        formats.push({
          format_id: file.name,
          url: fileUrl,
          ext: this.extFromName(file.name),
          vcodec: "none",
          filesize: file.size ? parseInt(file.size) : undefined,
          format_note: file.format,
          quality: file.source === "original" ? 2 : 1,
        });
      } else if (file.name.match(/\.(jpg|jpeg|png|gif)$/i) && file.name.includes("thumb")) {
        thumbnails.push({ url: fileUrl });
      }
    }

    const uploadDate = date ? date.slice(0, 10).replace(/-/g, "") : undefined;

    return {
      id: identifier,
      title,
      description,
      uploader: creator,
      upload_date: uploadDate,
      thumbnails,
      formats,
      webpage_url: url,
      extractor: this._NAME,
    };
  }

  private extFromName(name: string): string {
    const parts = name.split(".");
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "mp4";
  }
}
