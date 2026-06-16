import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict, Format } from "../core/types";

const GDRIVE_VALID_URL = /https?:\/\/(?:docs\.google\.com\/(?:file\/d\/|open\?id=)|drive\.google\.com\/(?:file\/d\/|open\?id=)|drive\.google\.com\/uc\?(?:.*&)?id=)([a-zA-Z0-9_-]+)/;

export class GoogleDriveExtractor extends BaseExtractor {
  readonly _VALID_URL = GDRIVE_VALID_URL;
  readonly _NAME = "google-drive";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = url.match(this._VALID_URL);
    if (!match) throw new ExtractorError(`Invalid Google Drive URL: ${url}`);
    const fileId = match[1];

    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    const response = await fetch(downloadUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new ExtractorError(`Google Drive: fetch error ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("text/html")) {
      const html = await response.text();
      return this.handleVirusScanPage(html, fileId, url);
    }

    const contentDisposition = response.headers.get("content-disposition") ?? "";
    const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
    const filename = filenameMatch?.[1]
      ? decodeURIComponent(filenameMatch[1].trim())
      : `gdrive_${fileId}`;
    const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "mp4";
    const title = filename.replace(/\.[^.]+$/, "");

    const contentLength = response.headers.get("content-length");
    const filesize = contentLength ? parseInt(contentLength) : undefined;

    const resolvedUrl = response.url || downloadUrl;
    return this.buildInfo(fileId, title, ext, resolvedUrl, filesize, url);
  }

  private async handleVirusScanPage(html: string, fileId: string, originalUrl: string): Promise<InfoDict> {
    const confirmMatch = html.match(/[?&]confirm=([0-9A-Za-z_-]+)/);
    if (!confirmMatch) {
      const idMatch = html.match(/id=([a-zA-Z0-9_-]+)/);
      const foundId = idMatch?.[1] ?? fileId;
      const directUrl = `https://drive.google.com/uc?export=download&id=${foundId}`;
      return this.buildInfo(fileId, `gdrive_${fileId}`, "mp4", directUrl, undefined, originalUrl);
    }

    const confirmToken = confirmMatch[1];
    const confirmedUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirmToken}`;

    const confirmedResponse = await fetch(confirmedUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });

    if (!confirmedResponse.ok) {
      throw new ExtractorError(`Google Drive: confirmed download failed with status ${confirmedResponse.status}`);
    }

    const contentDisposition = confirmedResponse.headers.get("content-disposition") ?? "";
    const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
    const filename = filenameMatch?.[1]
      ? decodeURIComponent(filenameMatch[1].trim())
      : `gdrive_${fileId}`;
    const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "mp4";
    const title = filename.replace(/\.[^.]+$/, "");

    const contentLength = confirmedResponse.headers.get("content-length");
    const filesize = contentLength ? parseInt(contentLength) : undefined;

    return this.buildInfo(fileId, title, ext, confirmedUrl, filesize, originalUrl);
  }

  private buildInfo(id: string, title: string, ext: string, directUrl: string, filesize: number | undefined, webpageUrl: string): InfoDict {
    const formats: Format[] = [
      {
        format_id: "direct",
        url: directUrl,
        ext,
        filesize,
        http_headers: {
          "User-Agent": "Mozilla/5.0",
        },
      },
    ];

    return {
      id,
      title,
      url: directUrl,
      ext,
      formats,
      webpage_url: webpageUrl,
      extractor: this._NAME,
    };
  }
}
