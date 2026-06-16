export interface Thumbnail {
  url: string;
  width?: number;
  height?: number;
  id?: string;
  preference?: number;
}

export interface Subtitle {
  url: string;
  ext: string;
  name?: string;
  data?: string;
}

export interface Chapter {
  title: string;
  start_time: number;
  end_time: number;
}

export interface Format {
  format_id: string;
  url: string;
  ext: string;
  protocol?: string;
  width?: number;
  height?: number;
  resolution?: string;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  vbr?: number;
  abr?: number;
  tbr?: number;
  filesize?: number;
  filesize_approx?: number;
  format_note?: string;
  quality?: number;
  language?: string;
  audio_channels?: number;
  dynamic_range?: string;
  has_drm?: boolean;
  http_headers?: Record<string, string>;
  source_preference?: number;
  container?: string;
}

export interface InfoDict {
  id: string;
  title: string;
  url?: string;
  ext?: string;
  formats?: Format[];
  thumbnails?: Thumbnail[];
  subtitles?: Record<string, Subtitle[]>;
  automatic_captions?: Record<string, Subtitle[]>;
  chapters?: Chapter[];
  description?: string;
  uploader?: string;
  uploader_id?: string;
  uploader_url?: string;
  channel?: string;
  channel_id?: string;
  channel_url?: string;
  duration?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  upload_date?: string;
  timestamp?: number;
  age_limit?: number;
  webpage_url?: string;
  categories?: string[];
  tags?: string[];
  live_status?: "is_live" | "was_live" | "is_upcoming" | "not_live";
  release_timestamp?: number;
  playlist?: string;
  playlist_index?: number;
  playlist_count?: number;
  entries?: InfoDict[];
  requested_formats?: Format[];
  filename?: string;
  _type?: "video" | "playlist" | "url" | "url_transparent";
  extractor?: string;
  extractor_key?: string;
  http_headers?: Record<string, string>;
}

export interface DownloadProgress {
  downloaded_bytes: number;
  total_bytes: number | null;
  speed: number | null;
  eta: number | null;
  percent: number | null;
  status: "downloading" | "finished" | "error";
  filename: string;
}

export interface Options {
  format: string;
  output: string;
  extractAudio: boolean;
  audioFormat: string;
  audioQuality: string;
  writeSubs: boolean;
  subLangs: string;
  listFormats: boolean;
  dumpJson: boolean;
  quiet: boolean;
  verbose: boolean;
  noProgress: boolean;
  retries: number;
  rateLimit: number | null;
  proxy: string | null;
  cookies: string | null;
  userAgent: string;
  referer: string | null;
  embedThumbnail: boolean;
  embedSubs: boolean;
  mergeOutputFormat: string | null;
  paths: { home: string; temp: string };
  ffmpegLocation: string | null;
  version: boolean;
  help: boolean;
  urls: string[];
}

export abstract class BaseExtractor {
  abstract readonly _VALID_URL: RegExp;
  abstract readonly _NAME: string;

  canHandle(url: string): boolean {
    return this._VALID_URL.test(url);
  }

  async extract(url: string): Promise<InfoDict> {
    if (!this.canHandle(url)) {
      throw new ExtractorError(`URL not supported by ${this._NAME}: ${url}`);
    }
    try {
      const info = await this._real_extract(url);
      info.extractor = this._NAME;
      info.extractor_key = this.constructor.name;
      return info;
    } catch (err) {
      if (err instanceof ExtractorError) throw err;
      throw new ExtractorError(
        `${this._NAME}: extraction failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  protected abstract _real_extract(url: string): Promise<InfoDict>;
}

export abstract class Downloader {
  abstract readonly protocol: string;

  abstract download(
    url: string,
    filepath: string,
    options: DownloadOptions,
  ): Promise<void>;

  abstract canHandle(protocol: string): boolean;
}

export interface DownloadOptions {
  headers?: Record<string, string>;
  rateLimit?: number | null;
  retries?: number;
  onProgress?: (progress: DownloadProgress) => void;
}

export abstract class PostProcessor {
  abstract readonly _NAME: string;

  abstract run(info: InfoDict, filepath: string): Promise<PostProcessResult>;
}

export interface PostProcessResult {
  filepath: string;
  info: InfoDict;
  files_to_delete: string[];
}

export class ExtractorError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ExtractorError";
  }
}

export class DownloadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DownloadError";
  }
}

export class PostProcessError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PostProcessError";
  }
}

export const DEFAULT_OPTIONS: Options = {
  format: "bv*+ba/b",
  output: "%(title)s [%(id)s].%(ext)s",
  extractAudio: false,
  audioFormat: "mp3",
  audioQuality: "5",
  writeSubs: false,
  subLangs: "en",
  listFormats: false,
  dumpJson: false,
  quiet: false,
  verbose: false,
  noProgress: false,
  retries: 3,
  rateLimit: null,
  proxy: null,
  cookies: null,
  userAgent: "dlpx/0.0.0",
  referer: null,
  embedThumbnail: false,
  embedSubs: false,
  mergeOutputFormat: null,
  paths: { home: ".", temp: "" },
  ffmpegLocation: null,
  version: false,
  help: false,
  urls: [],
};
