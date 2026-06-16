import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";
import { parseCaptionTracks } from "./captions";

const VALID_URL = /^https?:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const PLAYLIST_URL = /^https?:\/\/(?:(?:www|m|music)\.)?youtube\.com\/playlist\?.*list=([a-zA-Z0-9_-]+)/;
const CHANNEL_URL = /^https?:\/\/(?:(?:www|m|music)\.)?youtube\.com\/(?:channel\/|@)([a-zA-Z0-9_-]+)/;

function generateCpn(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * 64)]).join("");
}

let _innertube: Awaited<ReturnType<typeof createInnertube>> | null = null;

async function createInnertube() {
  const { Innertube } = await import("youtubei.js");
  return Innertube.create({ generate_session_locally: true });
}

async function getInnertube() {
  if (!_innertube) {
    _innertube = await createInnertube();
  }
  return _innertube;
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
    const yt = await getInnertube();
    const info = await yt.getInfo(videoId);

    if (!info.basic_info.title) {
      throw new ExtractorError("Could not extract video info");
    }

    const formats = await this.extractFormats(info, yt);

    const thumbnails: Thumbnail[] = (info.basic_info.thumbnail ?? []).map((t: { url: string; width: number; height: number }) => ({
      url: t.url,
      width: t.width,
      height: t.height,
    }));

    const result: InfoDict = {
      id: videoId,
      title: info.basic_info.title,
      formats,
      thumbnails,
      description: info.basic_info.short_description,
      channel: info.basic_info.author,
      channel_id: info.basic_info.channel_id,
      duration: info.basic_info.duration,
      view_count: info.basic_info.view_count,
      webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
      live_status: info.basic_info.is_live ? "is_live" : "not_live",
    };

    // Extract captions from page response
    const pageResponse = await this.fetchPagePlayerResponse(videoId);
    if (pageResponse) {
      const captionTracks = pageResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (captionTracks?.length) {
        const { subtitles, automatic_captions } = parseCaptionTracks(captionTracks);
        result.subtitles = subtitles;
        result.automatic_captions = automatic_captions;
      }
    }

    return result;
  }

  private async extractFormats(info: { streaming_data?: { formats?: unknown[]; adaptive_formats?: unknown[] }; chooseFormat: (opts: { type: string; quality: string }) => unknown }, yt: { session: { player: unknown } }): Promise<Format[]> {
    const formats: Format[] = [];
    const player = yt.session.player;
    const cpn = generateCpn();

    const allFormats = [
      ...(info.streaming_data?.formats ?? []),
      ...(info.streaming_data?.adaptive_formats ?? []),
    ];

    for (const raw of allFormats) {
      const f = raw as Record<string, unknown>;
      try {
        let url: string | undefined;

        if (typeof (f as { decipher?: unknown }).decipher === "function") {
          const deciphered = await (f as { decipher: (p: unknown) => Promise<unknown> }).decipher(player);
          if (typeof deciphered === "string") {
            const parsed = new URL(deciphered);
            parsed.searchParams.set("cpn", cpn);
            url = parsed.toString();
          }
        }

        if (!url) continue;

        const mime = String(f.mime_type ?? "");
        const mimeMatch = mime.match(/^(video|audio)\/(\w+);\s*codecs="([^"]+)"/);
        const ext = mimeMatch?.[2] ?? "mp4";
        const codecs = mimeMatch?.[3] ?? "";
        const isVideo = mime.startsWith("video");
        const isAudio = mime.startsWith("audio");

        formats.push({
          format_id: String(f.itag ?? ""),
          url,
          ext,
          vcodec: isVideo ? codecs.split(",")[0]?.trim() : "none",
          acodec: isAudio ? codecs : (isVideo && codecs.includes(",") ? codecs.split(",")[1]?.trim() : undefined),
          width: (f.width as number) ?? undefined,
          height: (f.height as number) ?? undefined,
          fps: (f.fps as number) ?? undefined,
          tbr: f.bitrate ? Math.round((f.bitrate as number) / 1000) : undefined,
          filesize: f.content_length ? parseInt(String(f.content_length), 10) : undefined,
          format_note: String(f.quality_label ?? f.quality ?? ""),
          audio_channels: (f.audio_channels as number) ?? undefined,
          http_headers: {
            "Origin": "https://www.youtube.com",
            "Referer": "https://www.youtube.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
          },
        });
      } catch {
        continue;
      }
    }

    return formats;
  }

  private async fetchPagePlayerResponse(videoId: string): Promise<Record<string, unknown> | null> {
    try {
      const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        },
      });
      const html = await resp.text();
      const match = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      return match ? JSON.parse(match[1]) : null;
    } catch {
      return null;
    }
  }
}
