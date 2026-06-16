import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict } from "../core/types";

export class DropboxExtractor extends BaseExtractor {
  readonly _VALID_URL = /https?:\/\/(?:www\.)?dropbox\.com\/(?:s|sh|scl\/fo)\/[^?#]+/;
  readonly _NAME = "dropbox";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const urlObj = new URL(url);

    urlObj.searchParams.set("dl", "1");
    urlObj.searchParams.delete("rlkey");

    const directUrl = urlObj.toString();

    const headResponse = await fetch(directUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!headResponse.ok && headResponse.status !== 302 && headResponse.status !== 301) {
      throw new ExtractorError(`Dropbox: could not access file (status ${headResponse.status})`);
    }

    const finalUrl = headResponse.url || directUrl;
    const pathname = urlObj.pathname;
    const filename = pathname.split("/").pop() ?? "file";
    const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "mp4";
    const title = filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

    const contentLength = headResponse.headers.get("content-length");
    const filesize = contentLength ? parseInt(contentLength) : undefined;

    return {
      id: urlObj.searchParams.get("id") ?? pathname.split("/").slice(-2, -1)[0] ?? "dropbox",
      title,
      url: finalUrl,
      ext,
      formats: [
        {
          format_id: "direct",
          url: finalUrl,
          ext,
          filesize,
        },
      ],
      webpage_url: url,
      extractor: this._NAME,
    };
  }
}
