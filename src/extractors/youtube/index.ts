import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";
import { parseCaptionTracks } from "./captions";
import type { RawFormat, PlayerResponse, StreamingData } from "./innertube";
import { decipherStreamUrl, setPageHtmlForPlayerExtraction } from "./player";

const VALID_URL = /^https?:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const PLAYLIST_URL = /^https?:\/\/(?:(?:www|m|music)\.)?youtube\.com\/playlist\?.*list=([a-zA-Z0-9_-]+)/;
const CHANNEL_URL = /^https?:\/\/(?:(?:www|m|music)\.)?youtube\.com\/(?:channel\/|@)([a-zA-Z0-9_-]+)/;

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

function generateCpn(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * 64)]).join("");
}

interface PageData {
  playerResponse: PlayerResponse;
  html: string;
}

async function fetchPageData(videoId: string): Promise<PageData> {
  const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!resp.ok) {
    throw new ExtractorError(`Failed to fetch YouTube page: ${resp.status}`);
  }

  const html = await resp.text();
  setPageHtmlForPlayerExtraction(html);

  const prMatch = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  if (!prMatch) {
    throw new ExtractorError("Could not extract player response from page");
  }

  return {
    playerResponse: JSON.parse(prMatch[1]) as PlayerResponse,
    html,
  };
}

export class YouTubeExtractor extends BaseExtractor {
  readonly _VALID_URL = new RegExp(
    `(?:${VALID_URL.source})|(?:${PLAYLIST_URL.source})|(?:${CHANNEL_URL.source})`
  );
  readonly _NAME = "youtube";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const videoMatch = url.match(VALID_URL);
    if (!videoMatch) {
      throw new ExtractorError(`Unsupported YouTube URL: ${url}`);
    }

    return this.extractVideo(videoMatch[1]);
  }

  private async extractVideo(videoId: string): Promise<InfoDict> {
    const pageData = await fetchPageData(videoId);
    const playerResponse = pageData.playerResponse;

    const status = playerResponse.playabilityStatus;
    if (status?.status !== "OK") {
      throw new ExtractorError(status?.reason ?? "Video unavailable");
    }

    const details = playerResponse.videoDetails;
    if (!details?.title) {
      throw new ExtractorError("Could not extract video info");
    }

    const formats = await this.extractFormats(playerResponse.streamingData, pageData.html, videoId);

    const thumbnails: Thumbnail[] = (details.thumbnail?.thumbnails ?? []).map((t) => ({
      url: t.url,
      width: t.width,
      height: t.height,
    }));

    const result: InfoDict = {
      id: videoId,
      title: details.title,
      formats,
      thumbnails,
      description: details.shortDescription,
      channel: details.author,
      channel_id: details.channelId,
      duration: parseInt(details.lengthSeconds, 10) || undefined,
      view_count: parseInt(details.viewCount, 10) || undefined,
      webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
      live_status: details.isLive ? "is_live" : "not_live",
    };

    const captionTracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (captionTracks?.length) {
      const { subtitles, automatic_captions } = parseCaptionTracks(captionTracks);
      result.subtitles = subtitles;
      result.automatic_captions = automatic_captions;
    }

    return result;
  }

  private async extractFormats(streamingData: StreamingData | undefined, pageHtml: string, videoId?: string): Promise<Format[]> {
    const cpn = generateCpn();
    const formats: Format[] = [];

    // First: get formats from page response (muxed formats with signatureCipher)
    if (streamingData) {
      const pageFormats: RawFormat[] = [
        ...(streamingData.formats ?? []),
        ...(streamingData.adaptiveFormats ?? []),
      ];

      for (const raw of pageFormats) {
        if (!raw.url && !raw.signatureCipher) continue;
        try {
          const url = await decipherStreamUrl(raw.url, raw.signatureCipher, pageHtml);
          if (!url) continue;
          const parsed = new URL(url);
          parsed.searchParams.set("cpn", cpn);
          formats.push(this.buildFormat(raw, parsed.toString()));
        } catch {
          continue;
        }
      }
    }

    // Second: get adaptive formats from MWEB client (returns direct URLs for all resolutions)
    if (videoId) {
      try {
        const mwebFormats = await this.fetchMwebFormats(videoId, pageHtml, cpn);
        // Add MWEB formats that we don't already have from the page response
        const existingItags = new Set(formats.map((f) => f.format_id));
        for (const f of mwebFormats) {
          if (!existingItags.has(f.format_id)) {
            formats.push(f);
          }
        }
      } catch {
        // MWEB failed, continue with what we have
      }
    }

    return formats;
  }

  private async fetchMwebFormats(videoId: string, pageHtml: string, cpn: string): Promise<Format[]> {
    // Extract visitor data from page
    const vdMatch = pageHtml.match(/"visitorData":"([^"]+)"/);
    const visitorData = vdMatch?.[1];

    const body = {
      videoId,
      context: {
        client: {
          clientName: "MWEB",
          clientVersion: "2.20250615.01.00",
          hl: "en",
          gl: "US",
          visitorData,
        },
      },
      contentCheckOk: true,
      racyCheckOk: true,
      playbackContext: {
        contentPlaybackContext: { signatureTimestamp: 20619 },
      },
    };

    const resp = await fetch(
      "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
          "X-YouTube-Client-Name": "2",
          "X-YouTube-Client-Version": "2.20250615.01.00",
        },
        body: JSON.stringify(body),
      },
    );

    if (!resp.ok) return [];
    const data = await resp.json() as PlayerResponse;
    if (data.playabilityStatus?.status !== "OK") return [];

    const allRaw: RawFormat[] = [
      ...(data.streamingData?.formats ?? []),
      ...(data.streamingData?.adaptiveFormats ?? []),
    ];

    const formats: Format[] = [];
    for (const raw of allRaw) {
      if (!raw.url && !raw.signatureCipher) continue;
      try {
        const url = await decipherStreamUrl(raw.url, raw.signatureCipher, pageHtml);
        if (!url) continue;
        const parsed = new URL(url);
        parsed.searchParams.set("cpn", cpn);
        formats.push(this.buildFormat(raw, parsed.toString()));
      } catch {
        continue;
      }
    }

    return formats;
  }

  private buildFormat(raw: RawFormat, url: string): Format {
    const mime = raw.mimeType;
    const mimeMatch = mime.match(/^(video|audio)\/(\w+);\s*codecs="([^"]+)"/);
    const ext = mimeMatch?.[2] ?? "mp4";
    const codecs = mimeMatch?.[3] ?? "";
    const isVideo = mime.startsWith("video");
    const isAudio = mime.startsWith("audio");

    const format: Format = {
      format_id: String(raw.itag),
      url,
      ext: isAudio && ext === "mp4" ? "m4a" : ext,
      vcodec: isVideo ? codecs.split(",")[0]?.trim() : "none",
      acodec: isAudio ? codecs : (isVideo && codecs.includes(",") ? codecs.split(",")[1]?.trim() : undefined),
      width: raw.width,
      height: raw.height,
      fps: raw.fps,
      tbr: raw.bitrate ? Math.round(raw.bitrate / 1000) : undefined,
      filesize: raw.contentLength ? parseInt(raw.contentLength, 10) : undefined,
      format_note: raw.qualityLabel ?? raw.quality ?? undefined,
      audio_channels: raw.audioChannels,
      http_headers: {
        "Origin": "https://www.youtube.com",
        "Referer": "https://www.youtube.com/",
        "User-Agent": USER_AGENT,
      },
    };

    if (raw.width && raw.height) {
      format.resolution = `${raw.width}x${raw.height}`;
    }

    return format;
  }
}
