import type { Format, Subtitle } from "../../core/types";

export interface ClientContext {
  clientName: string;
  clientVersion: string;
  userAgent: string;
  apiKey: string;
  clientId?: number;
}

export interface StreamingData {
  formats: RawFormat[];
  adaptiveFormats: RawFormat[];
  expiresInSeconds?: string;
  hlsManifestUrl?: string;
  dashManifestUrl?: string;
}

export interface RawFormat {
  itag: number;
  url?: string;
  signatureCipher?: string;
  mimeType: string;
  bitrate?: number;
  width?: number;
  height?: number;
  contentLength?: string;
  quality?: string;
  qualityLabel?: string;
  fps?: number;
  averageBitrate?: number;
  approxDurationMs?: string;
  audioQuality?: string;
  audioSampleRate?: string;
  audioChannels?: number;
  lastModified?: string;
  isDrc?: boolean;
}

export interface VideoDetails {
  videoId: string;
  title: string;
  lengthSeconds: string;
  channelId: string;
  shortDescription: string;
  thumbnail: { thumbnails: Array<{ url: string; width: number; height: number }> };
  viewCount: string;
  author: string;
  isLiveContent: boolean;
  isLive?: boolean;
  isUpcoming?: boolean;
}

export interface CaptionTrack {
  baseUrl: string;
  name: { simpleText?: string; runs?: Array<{ text: string }> };
  vssId: string;
  languageCode: string;
  kind?: string;
  isTranslatable: boolean;
}

export interface PlayerResponse {
  streamingData?: StreamingData;
  videoDetails?: VideoDetails;
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
      translationLanguages?: Array<{ languageCode: string; languageName: { simpleText: string } }>;
    };
  };
  playabilityStatus?: {
    status: string;
    reason?: string;
    liveStreamability?: Record<string, unknown>;
  };
  microformat?: {
    playerMicroformatRenderer?: {
      category?: string;
      publishDate?: string;
      uploadDate?: string;
      liveBroadcastDetails?: {
        startTimestamp?: string;
        endTimestamp?: string;
      };
      ownerChannelName?: string;
      ownerProfileUrl?: string;
      viewCount?: string;
      lengthSeconds?: string;
      title?: { simpleText?: string };
      description?: { simpleText?: string };
    };
  };
}

export interface BrowseResponse {
  contents?: Record<string, unknown>;
  onResponseReceivedActions?: Array<Record<string, unknown>>;
  header?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  alerts?: Array<{ alertRenderer?: { type: string; text: { simpleText?: string } } }>;
}

const CLIENTS: Record<string, ClientContext> = {
  WEB: {
    clientName: "WEB",
    clientVersion: "2.20240530.02.00",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  },
  ANDROID: {
    clientName: "ANDROID",
    clientVersion: "19.29.37",
    userAgent: "com.google.android.youtube/19.29.37 (Linux; U; Android 14) gzip",
    apiKey: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
    clientId: 3,
  },
  TVHTML5_EMBED: {
    clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    clientVersion: "2.0",
    userAgent: "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36",
    apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    clientId: 85,
  },
};

const PLAYER_ENDPOINT = "https://www.youtube.com/youtubei/v1/player";
const BROWSE_ENDPOINT = "https://www.youtube.com/youtubei/v1/browse";

export class InnerTubeClient {
  private clientName: string;
  private context: ClientContext;

  constructor(clientName: "WEB" | "ANDROID" | "TVHTML5_EMBED" = "WEB") {
    this.clientName = clientName;
    this.context = CLIENTS[clientName];
  }

  async getPlayerResponse(videoId: string, embedUrl?: string): Promise<PlayerResponse> {
    const body = this.buildPlayerBody(videoId, embedUrl);
    const response = await fetch(`${PLAYER_ENDPOINT}?key=${this.context.apiKey}&prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": this.context.userAgent,
        "X-YouTube-Client-Name": String(this.context.clientId ?? 1),
        "X-YouTube-Client-Version": this.context.clientVersion,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`InnerTube player request failed: ${response.status}`);
    }

    return response.json() as Promise<PlayerResponse>;
  }

  async browse(browseId: string, params?: string, continuation?: string): Promise<BrowseResponse> {
    const body: Record<string, unknown> = {
      context: {
        client: {
          clientName: this.context.clientName,
          clientVersion: this.context.clientVersion,
          hl: "en",
          gl: "US",
        },
      },
    };

    if (continuation) {
      body.continuation = continuation;
    } else {
      body.browseId = browseId;
      if (params) {
        body.params = params;
      }
    }

    const response = await fetch(`${BROWSE_ENDPOINT}?key=${this.context.apiKey}&prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": this.context.userAgent,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`InnerTube browse request failed: ${response.status}`);
    }

    return response.json() as Promise<BrowseResponse>;
  }

  private buildPlayerBody(videoId: string, embedUrl?: string): Record<string, unknown> {
    const body: Record<string, unknown> = {
      videoId,
      context: {
        client: {
          clientName: this.context.clientName,
          clientVersion: this.context.clientVersion,
          hl: "en",
          gl: "US",
        },
      },
      playbackContext: {
        contentPlaybackContext: {
          signatureTimestamp: 20073,
        },
      },
      contentCheckOk: true,
      racyCheckOk: true,
    };

    if (this.clientName === "TVHTML5_EMBED" && embedUrl) {
      (body.context as Record<string, unknown>).thirdParty = {
        embedUrl,
      };
    }

    return body;
  }

  parseFormats(streamingData: StreamingData): Format[] {
    const formats: Format[] = [];

    const allRawFormats = [
      ...(streamingData.formats ?? []),
      ...(streamingData.adaptiveFormats ?? []),
    ];

    for (const raw of allRawFormats) {
      const parsed = this.parseOneFormat(raw);
      if (parsed) {
        formats.push(parsed);
      }
    }

    return formats;
  }

  private parseOneFormat(raw: RawFormat): Format | null {
    const url = raw.url;
    if (!url && !raw.signatureCipher) return null;

    const mime = raw.mimeType;
    const { ext, vcodec, acodec } = parseMimeType(mime);

    const format: Format = {
      format_id: String(raw.itag),
      url: url ?? "",
      ext,
      vcodec: vcodec ?? undefined,
      acodec: acodec ?? undefined,
      width: raw.width,
      height: raw.height,
      fps: raw.fps,
      tbr: raw.bitrate ? Math.round(raw.bitrate / 1000) : undefined,
      abr: raw.averageBitrate && !raw.width ? Math.round(raw.averageBitrate / 1000) : undefined,
      vbr: raw.averageBitrate && raw.width ? Math.round(raw.averageBitrate / 1000) : undefined,
      filesize: raw.contentLength ? parseInt(raw.contentLength, 10) : undefined,
      format_note: raw.qualityLabel ?? raw.quality ?? undefined,
      quality: itagQuality(raw.itag),
      audio_channels: raw.audioChannels,
      dynamic_range: raw.isDrc ? "HDR" : "SDR",
      http_headers: {
        "User-Agent": this.context.userAgent,
      },
    };

    if (raw.width && raw.height) {
      format.resolution = `${raw.width}x${raw.height}`;
    }

    return format;
  }

  parseCaptions(
    captionTracks: CaptionTrack[],
  ): { subtitles: Record<string, Subtitle[]>; automatic_captions: Record<string, Subtitle[]> } {
    const subtitles: Record<string, Subtitle[]> = {};
    const automatic_captions: Record<string, Subtitle[]> = {};

    for (const track of captionTracks) {
      const lang = track.languageCode;
      const name = track.name?.simpleText ?? track.name?.runs?.[0]?.text ?? lang;
      const isAutoGenerated = track.kind === "asr";
      const target = isAutoGenerated ? automatic_captions : subtitles;

      target[lang] = [
        {
          url: track.baseUrl,
          ext: "json3",
          name,
        },
        {
          url: `${track.baseUrl}&fmt=vtt`,
          ext: "vtt",
          name,
        },
        {
          url: `${track.baseUrl}&fmt=srv1`,
          ext: "srv1",
          name,
        },
      ];
    }

    return { subtitles, automatic_captions };
  }

  static withClient(clientName: "WEB" | "ANDROID" | "TVHTML5_EMBED"): InnerTubeClient {
    return new InnerTubeClient(clientName);
  }
}

function parseMimeType(mime: string): { ext: string; vcodec: string | null; acodec: string | null } {
  const match = mime.match(/^(video|audio)\/(\w+);\s*codecs="([^"]+)"/);
  if (!match) {
    const simpleMatch = mime.match(/^(video|audio)\/(\w+)/);
    return {
      ext: simpleMatch?.[2] === "mp4" ? "mp4" : simpleMatch?.[2] ?? "unknown",
      vcodec: null,
      acodec: null,
    };
  }

  const type = match[1];
  const container = match[2];
  const codecs = match[3];

  const ext = container === "mp4" ? "mp4" : container === "webm" ? "webm" : container;

  if (type === "video") {
    const codecParts = codecs.split(",").map((c) => c.trim());
    return {
      ext,
      vcodec: codecParts[0] ?? null,
      acodec: codecParts[1] ?? null,
    };
  }

  return {
    ext: type === "audio" && container === "mp4" ? "m4a" : ext,
    vcodec: "none",
    acodec: codecs,
  };
}

function itagQuality(itag: number): number {
  const qualityMap: Record<number, number> = {
    18: 1, 22: 2,
    133: 1, 134: 2, 135: 3, 136: 4, 137: 5, 138: 6,
    160: 0, 242: 1, 243: 2, 244: 3, 247: 4, 248: 5,
    271: 6, 313: 7, 315: 7, 272: 8,
    298: 4, 299: 5, 302: 4, 303: 5, 308: 6, 315: 7,
    394: 0, 395: 1, 396: 2, 397: 3, 398: 4, 399: 5, 400: 6, 401: 7, 402: 8,
    139: 0, 140: 1, 141: 2,
    249: 0, 250: 1, 251: 2,
    256: 1, 258: 2,
  };
  return qualityMap[itag] ?? 0;
}
