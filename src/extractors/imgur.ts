import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict, Format, Thumbnail } from "../core/types";

interface ImgurImage {
  id?: string;
  title?: string;
  description?: string;
  type?: string;
  mp4?: string;
  link?: string;
  width?: number;
  height?: number;
  size?: number;
  animated?: boolean;
}

interface ImgurApiResponse {
  data?: ImgurImage | ImgurImage[] | { images?: ImgurImage[]; title?: string; description?: string; id?: string };
  success?: boolean;
  status?: number;
}

const IMGUR_VALID_URL = /https?:\/\/(?:i\.)?imgur\.com\/(?:a\/|gallery\/)?([a-zA-Z0-9]+)(?:\.[a-zA-Z]+)?/;

export class ImgurExtractor extends BaseExtractor {
  readonly _VALID_URL = IMGUR_VALID_URL;
  readonly _NAME = "imgur";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = url.match(this._VALID_URL);
    if (!match) throw new ExtractorError(`Invalid Imgur URL: ${url}`);
    const itemId = match[1];

    if (url.includes("i.imgur.com") && /\.(gif|gifv|mp4|webm)$/i.test(url)) {
      return this.extractDirectMedia(url, itemId);
    }

    const isAlbum = url.includes("/a/") || url.includes("/gallery/");
    return isAlbum
      ? this.extractAlbum(url, itemId)
      : this.extractSingle(url, itemId);
  }

  private extractDirectMedia(url: string, id: string): InfoDict {
    const mp4Url = url.replace(/\.gifv?$/i, ".mp4");
    return {
      id,
      title: id,
      url: mp4Url,
      ext: "mp4",
      formats: [{ format_id: "mp4", url: mp4Url, ext: "mp4" }],
      webpage_url: url,
      extractor: this._NAME,
    };
  }

  private async extractSingle(url: string, id: string): Promise<InfoDict> {
    const apiUrl = `https://api.imgur.com/3/image/${id}`;
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: "Client-ID 546c25a59c58ad7",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      return this.extractDirectMedia(`https://i.imgur.com/${id}.mp4`, id);
    }

    const data = (await response.json()) as ImgurApiResponse;
    const image = data.data as ImgurImage | undefined;

    if (!image) throw new ExtractorError("Imgur: no image data in response");

    return this.buildImageInfo(image, url);
  }

  private async extractAlbum(url: string, id: string): Promise<InfoDict> {
    const apiUrl = `https://api.imgur.com/3/album/${id}/images`;
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: "Client-ID 546c25a59c58ad7",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      throw new ExtractorError(`Imgur album API error: ${response.status}`);
    }

    const data = (await response.json()) as ImgurApiResponse;
    const images = data.data as ImgurImage[] | undefined;

    if (!images || !Array.isArray(images)) {
      throw new ExtractorError("Imgur: no album images in response");
    }

    const videoImages = images.filter((img) => img.animated || img.type?.includes("video") || img.mp4);

    if (videoImages.length === 0) {
      throw new ExtractorError("Imgur: album contains no video/animated content");
    }

    if (videoImages.length === 1) {
      return this.buildImageInfo(videoImages[0], url);
    }

    const entries = videoImages.map((img, i) => ({
      ...this.buildImageInfo(img, `https://imgur.com/${img.id ?? ""}`),
      playlist_index: i + 1,
    }));

    return {
      id,
      title: `Imgur Album ${id}`,
      entries,
      _type: "playlist" as const,
      playlist_count: entries.length,
      webpage_url: url,
      extractor: this._NAME,
    };
  }

  private buildImageInfo(image: ImgurImage, url: string): InfoDict {
    const id = image.id ?? "unknown";
    const formats: Format[] = [];
    const thumbnails: Thumbnail[] = [];

    const mp4Url = image.mp4 ?? `https://i.imgur.com/${id}.mp4`;

    if (image.animated || image.type?.includes("gif") || image.mp4) {
      formats.push({
        format_id: "mp4",
        url: mp4Url,
        ext: "mp4",
        width: image.width,
        height: image.height,
        filesize: image.size,
      });
    }

    if (image.link) {
      thumbnails.push({ url: image.link, width: image.width, height: image.height });
    }

    return {
      id,
      title: image.title ?? id,
      description: image.description,
      thumbnails,
      formats,
      webpage_url: url,
      extractor: this._NAME,
    };
  }
}
