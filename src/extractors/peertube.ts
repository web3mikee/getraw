import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict, Format, Thumbnail, Subtitle } from "../core/types";

interface PeerTubeFile {
  fileUrl?: string;
  fileDownloadUrl?: string;
  torrentUrl?: string;
  resolution?: { id?: number; label?: string };
  size?: number;
  fps?: number;
  width?: number;
  height?: number;
}

interface PeerTubeStreamingPlaylist {
  playlistUrl?: string;
  type?: number;
}

interface PeerTubeVideo {
  uuid?: string;
  name?: string;
  description?: string;
  duration?: number;
  views?: number;
  likes?: number;
  dislikes?: number;
  publishedAt?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  isLive?: boolean;
  account?: { displayName?: string; name?: string; url?: string };
  channel?: { displayName?: string; name?: string; url?: string };
  files?: PeerTubeFile[];
  streamingPlaylists?: PeerTubeStreamingPlaylist[];
  captions?: Array<{ language?: { id?: string; label?: string }; captionPath?: string; fileUrl?: string }>;
}

const PEERTUBE_INSTANCE_REGEX = /https?:\/\/([^/]+)\/(?:videos\/watch|w)\/([a-zA-Z0-9-]+)/;
const PEERTUBE_EMBED_REGEX = /https?:\/\/([^/]+)\/videos\/embed\/([a-zA-Z0-9-]+)/;

export class PeerTubeExtractor extends BaseExtractor {
  readonly _VALID_URL = /https?:\/\/[^/]+\/(?:videos\/(?:watch|embed)|w)\/[a-zA-Z0-9-]+/;
  readonly _NAME = "peertube";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = url.match(PEERTUBE_INSTANCE_REGEX) ?? url.match(PEERTUBE_EMBED_REGEX);
    if (!match) throw new ExtractorError(`Invalid PeerTube URL: ${url}`);

    const instance = match[1];
    const videoId = match[2];
    const apiUrl = `https://${instance}/api/v1/videos/${videoId}`;

    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      throw new ExtractorError(`PeerTube API error: ${response.status} for ${apiUrl}`);
    }

    const data = (await response.json()) as PeerTubeVideo;

    const formats: Format[] = [];

    for (const file of data.files ?? []) {
      const fileUrl = file.fileUrl ?? file.fileDownloadUrl;
      if (!fileUrl) continue;

      const height = file.resolution?.id;
      formats.push({
        format_id: `mp4-${file.resolution?.label ?? height ?? "unknown"}`,
        url: fileUrl,
        ext: "mp4",
        height,
        fps: file.fps,
        filesize: file.size,
        resolution: file.resolution?.label,
        quality: height ?? 0,
      });
    }

    for (const playlist of data.streamingPlaylists ?? []) {
      if (playlist.playlistUrl) {
        formats.push({
          format_id: "hls",
          url: playlist.playlistUrl,
          ext: "mp4",
          protocol: "m3u8",
          quality: -1,
        });
      }
    }

    const thumbnails: Thumbnail[] = [];
    if (data.thumbnailUrl) {
      thumbnails.push({
        url: data.thumbnailUrl.startsWith("http")
          ? data.thumbnailUrl
          : `https://${instance}${data.thumbnailUrl}`,
      });
    }
    if (data.previewUrl) {
      thumbnails.push({
        url: data.previewUrl.startsWith("http")
          ? data.previewUrl
          : `https://${instance}${data.previewUrl}`,
        preference: 1,
      });
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const caption of data.captions ?? []) {
      const lang = caption.language?.id ?? "und";
      const captionUrl = caption.fileUrl ?? (caption.captionPath
        ? `https://${instance}${caption.captionPath}`
        : undefined);
      if (captionUrl) {
        subtitles[lang] = [{ url: captionUrl, ext: "vtt", name: caption.language?.label }];
      }
    }

    return {
      id: data.uuid ?? videoId,
      title: data.name ?? videoId,
      description: data.description,
      duration: data.duration,
      view_count: data.views,
      like_count: data.likes,
      uploader: data.account?.displayName ?? data.account?.name,
      uploader_url: data.account?.url,
      channel: data.channel?.displayName ?? data.channel?.name,
      channel_url: data.channel?.url,
      upload_date: data.publishedAt?.slice(0, 10).replace(/-/g, ""),
      thumbnails,
      formats,
      subtitles,
      live_status: data.isLive ? "is_live" : "not_live",
      webpage_url: url,
      extractor: this._NAME,
    };
  }
}
