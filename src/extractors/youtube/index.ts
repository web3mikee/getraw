import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";
import { InnerTubeClient } from "./innertube";
import type { PlayerResponse, VideoDetails, StreamingData } from "./innertube";
import { fetchPlayerJs, decipherSignatureUrl, clearCache as clearSigCache } from "./signature";
import { transformNsig, clearNsigCache } from "./nsig";
import { parseCaptionTracks } from "./captions";
import { PlaylistExtractor } from "./playlist";

const VALID_URL = /^https?:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const PLAYLIST_URL = /^https?:\/\/(?:(?:www|m|music)\.)?youtube\.com\/playlist\?.*list=([a-zA-Z0-9_-]+)/;
const CHANNEL_URL = /^https?:\/\/(?:(?:www|m|music)\.)?youtube\.com\/(?:channel\/|@)([a-zA-Z0-9_-]+)/;

const PLAYER_URL_RE = /"jsUrl"\s*:\s*"(\/s\/player\/[^"]+\/base\.js)"/;

export class YouTubeExtractor extends BaseExtractor {
  readonly _VALID_URL = new RegExp(
    `(?:${VALID_URL.source})|(?:${PLAYLIST_URL.source})|(?:${CHANNEL_URL.source})`
  );
  readonly _NAME = "youtube";

  private playlistExtractor = new PlaylistExtractor();

  protected async _real_extract(url: string): Promise<InfoDict> {
    const playlistMatch = url.match(PLAYLIST_URL);
    if (playlistMatch) {
      return this.playlistExtractor.extractPlaylist(playlistMatch[1]);
    }

    const channelMatch = url.match(CHANNEL_URL);
    if (channelMatch && !url.match(VALID_URL)) {
      return this.playlistExtractor.extractChannelVideos(channelMatch[1]);
    }

    const videoMatch = url.match(VALID_URL);
    if (!videoMatch) {
      throw new ExtractorError(`Could not extract video ID from URL: ${url}`);
    }

    return this.extractVideo(videoMatch[1]);
  }

  private async extractVideo(videoId: string): Promise<InfoDict> {
    const webClient = InnerTubeClient.withClient("WEB");
    let playerResponse = await webClient.getPlayerResponse(videoId);

    const status = playerResponse.playabilityStatus?.status;
    if (status === "LOGIN_REQUIRED" || status === "CONTENT_CHECK_REQUIRED") {
      playerResponse = await this.tryAgeGateBypass(videoId, playerResponse);
    }

    if (playerResponse.playabilityStatus?.status === "ERROR") {
      throw new ExtractorError(
        playerResponse.playabilityStatus.reason ?? "Video unavailable"
      );
    }

    const videoDetails = playerResponse.videoDetails;
    if (!videoDetails) {
      throw new ExtractorError("No video details in player response");
    }

    // Try ANDROID client first — more reliable direct URLs without signature issues
    const androidClient = InnerTubeClient.withClient("ANDROID");
    const androidResponse = await androidClient.getPlayerResponse(videoId);
    let formats: Format[] = [];

    if (androidResponse.streamingData) {
      formats = androidClient.parseFormats(androidResponse.streamingData);
      // Filter out formats with empty URLs
      formats = formats.filter((f) => f.url && f.url.startsWith("http"));
    }

    // Fall back to WEB client with signature deciphering if ANDROID fails
    if (formats.length === 0) {
      formats = await this.extractFormats(playerResponse, webClient, videoId);
    }

    const info = this.buildInfoDict(videoId, videoDetails, playerResponse, formats);
    return info;
  }

  private async tryAgeGateBypass(
    videoId: string,
    originalResponse: PlayerResponse,
  ): Promise<PlayerResponse> {
    const tvClient = InnerTubeClient.withClient("TVHTML5_EMBED");
    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    const tvResponse = await tvClient.getPlayerResponse(videoId, embedUrl);

    if (tvResponse.playabilityStatus?.status === "OK" && tvResponse.streamingData) {
      return {
        ...tvResponse,
        videoDetails: originalResponse.videoDetails ?? tvResponse.videoDetails,
        captions: originalResponse.captions ?? tvResponse.captions,
        microformat: originalResponse.microformat ?? tvResponse.microformat,
      };
    }

    return originalResponse;
  }

  private async extractFormats(
    playerResponse: PlayerResponse,
    client: InnerTubeClient,
    videoId: string,
  ): Promise<Format[]> {
    const streamingData = playerResponse.streamingData;
    if (!streamingData) return [];

    let formats = client.parseFormats(streamingData);

    const needsDecipher = this.formatsNeedDecipher(streamingData);
    if (needsDecipher) {
      formats = await this.decipherFormats(formats, streamingData, videoId);
    }

    // Always apply nsig transform to prevent throttling
    const hasUrlFormats = formats.some((f) => f.url && f.url.includes("&n="));
    if (hasUrlFormats && !needsDecipher) {
      try {
        const playerJsUrl = await this.getPlayerJsUrl(videoId);
        if (playerJsUrl) {
          const playerJs = await fetchPlayerJs(playerJsUrl);
          for (let i = 0; i < formats.length; i++) {
            if (formats[i].url) {
              try {
                formats[i].url = transformNsig(formats[i].url, playerJs);
              } catch {
                // nsig transform failed, URL may be throttled
              }
            }
          }
        }
      } catch {
        // player JS fetch failed, proceed with original URLs
      }
    }

    return formats;
  }

  private formatsNeedDecipher(streamingData: StreamingData): boolean {
    const allFormats = [
      ...(streamingData.formats ?? []),
      ...(streamingData.adaptiveFormats ?? []),
    ];
    return allFormats.some((f) => f.signatureCipher && !f.url);
  }

  private async decipherFormats(
    formats: Format[],
    streamingData: StreamingData,
    videoId: string,
  ): Promise<Format[]> {
    const playerJsUrl = await this.getPlayerJsUrl(videoId);
    if (!playerJsUrl) return formats;

    const playerJs = await fetchPlayerJs(playerJsUrl);

    const allRaw = [
      ...(streamingData.formats ?? []),
      ...(streamingData.adaptiveFormats ?? []),
    ];

    for (let i = 0; i < formats.length; i++) {
      const raw = allRaw[i];
      if (!raw) continue;

      if (raw.signatureCipher && !raw.url) {
        try {
          formats[i].url = decipherSignatureUrl(raw.signatureCipher, playerJs);
        } catch {
          continue;
        }
      }

      if (formats[i].url) {
        try {
          formats[i].url = transformNsig(formats[i].url, playerJs);
        } catch {
          continue;
        }
      }
    }

    return formats;
  }

  private async getPlayerJsUrl(videoId: string): Promise<string | null> {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      const response = await fetch(watchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        },
      });
      const html = await response.text();
      const match = html.match(PLAYER_URL_RE);
      return match ? `https://www.youtube.com${match[1]}` : null;
    } catch {
      return null;
    }
  }

  private buildInfoDict(
    videoId: string,
    details: VideoDetails,
    response: PlayerResponse,
    formats: Format[],
  ): InfoDict {
    const microformat = response.microformat?.playerMicroformatRenderer;

    const thumbnails: Thumbnail[] = (details.thumbnail?.thumbnails ?? []).map((t) => ({
      url: t.url,
      width: t.width,
      height: t.height,
    }));

    const liveStatus = this.getLiveStatus(details, response);

    const info: InfoDict = {
      id: videoId,
      title: details.title,
      formats,
      thumbnails,
      description: details.shortDescription ?? microformat?.description?.simpleText,
      channel: details.author,
      channel_id: details.channelId,
      channel_url: `https://www.youtube.com/channel/${details.channelId}`,
      uploader: details.author,
      uploader_id: details.channelId,
      uploader_url: microformat?.ownerProfileUrl,
      duration: parseInt(details.lengthSeconds, 10) || undefined,
      view_count: parseInt(details.viewCount, 10) || undefined,
      upload_date: microformat?.uploadDate?.replace(/-/g, ""),
      live_status: liveStatus,
      webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
      age_limit: 0,
      categories: microformat?.category ? [microformat.category] : undefined,
    };

    if (microformat?.liveBroadcastDetails?.startTimestamp) {
      info.release_timestamp = Math.floor(
        new Date(microformat.liveBroadcastDetails.startTimestamp).getTime() / 1000
      );
    }

    const captionTracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (captionTracks?.length) {
      const { subtitles, automatic_captions } = parseCaptionTracks(captionTracks);
      info.subtitles = subtitles;
      info.automatic_captions = automatic_captions;
    }

    return info;
  }

  private getLiveStatus(
    details: VideoDetails,
    response: PlayerResponse,
  ): InfoDict["live_status"] {
    if (details.isLive) return "is_live";
    if (details.isUpcoming) return "is_upcoming";
    if (details.isLiveContent) return "was_live";
    if (response.playabilityStatus?.liveStreamability) return "is_live";
    return "not_live";
  }

  static clearCaches(): void {
    clearSigCache();
    clearNsigCache();
  }
}

export { InnerTubeClient } from "./innertube";
export { PlaylistExtractor } from "./playlist";
export { parseCaptionTracks, convertToSrt, convertToVtt } from "./captions";
export { decipherSignatureUrl, fetchPlayerJs } from "./signature";
export { transformNsig } from "./nsig";
