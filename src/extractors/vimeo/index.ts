import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

interface VimeoHLSCDN {
  url: string;
  avc_url?: string;
}

interface VimeoDashCDN {
  url: string;
}

interface VimeoProgressiveFile {
  quality: string;
  mime: string;
  width?: number;
  height?: number;
  fps?: number;
  url: string;
  size?: number;
}

interface VimeoConfig {
  video: {
    id: number;
    title: string;
    description?: string;
    duration?: number;
    owner?: {
      name?: string;
      url?: string;
      account_type?: string;
    };
    thumbs?: Record<string, string>;
    embed_code?: string;
    width?: number;
    height?: number;
    live_event?: { status?: string };
  };
  request: {
    files: {
      hls?: { cdns?: Record<string, VimeoHLSCDN>; default_cdn?: string };
      dash?: { cdns?: Record<string, VimeoDashCDN>; default_cdn?: string };
      progressive?: VimeoProgressiveFile[];
    };
    cookie?: Record<string, string>;
  };
}

function extractVimeoId(url: string): string | null {
  const patterns = [
    /vimeo\.com\/(\d+)/,
    /player\.vimeo\.com\/video\/(\d+)/,
    /vimeo\.com\/channels\/[^/]+\/(\d+)/,
    /vimeo\.com\/groups\/[^/]+\/videos\/(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(url);
    if (match) return match[1];
  }
  return null;
}

function extractUnlistedHash(url: string): string | null {
  const match = /[?&]h=([0-9a-f]+)/.exec(url);
  return match ? match[1] : null;
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchConfigFromPlayerPage(
  videoId: string,
  hash: string | null,
): Promise<VimeoConfig> {
  const playerUrl = hash
    ? `https://player.vimeo.com/video/${videoId}?h=${hash}`
    : `https://player.vimeo.com/video/${videoId}`;
  const response = await fetch(playerUrl, {
    headers: { Referer: "https://vimeo.com/", "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new ExtractorError(`Vimeo player page request failed: ${response.status}`);
  }
  const html = await response.text();
  const match = /window\.playerConfig\s*=\s*(\{.+?\})\s*;?\s*<\/script>/s.exec(html);
  if (!match) {
    throw new ExtractorError("Could not find playerConfig in Vimeo player page");
  }
  return JSON.parse(match[1]) as VimeoConfig;
}

export class VimeoExtractor extends BaseExtractor {
  readonly _VALID_URL =
    /^https?:\/\/(?:(?:www|player)\.)?vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)/;
  readonly _NAME = "vimeo";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const videoId = extractVimeoId(url);
    if (!videoId) throw new ExtractorError("Could not extract Vimeo video ID");

    const hash = extractUnlistedHash(url);

    let config: VimeoConfig;
    const configUrl = `https://player.vimeo.com/video/${videoId}/config`;
    const response = await fetch(configUrl, {
      headers: {
        Referer: `https://vimeo.com/${videoId}`,
        "User-Agent": USER_AGENT,
      },
    });

    if (response.ok) {
      config = (await response.json()) as VimeoConfig;
    } else {
      // Unlisted/private videos reject the config endpoint; the player page
      // (which accepts the privacy hash) embeds the same config inline.
      config = await fetchConfigFromPlayerPage(videoId, hash);
    }
    const video = config.video;
    const files = config.request?.files;

    if (!files) throw new ExtractorError("No media files found in Vimeo config");

    const formats: Format[] = [];

    if (files.progressive && files.progressive.length > 0) {
      for (const prog of files.progressive) {
        formats.push({
          format_id: `http-${prog.quality}`,
          url: prog.url,
          ext: prog.mime?.split("/")?.[1] ?? "mp4",
          width: prog.width,
          height: prog.height,
          fps: prog.fps,
          filesize: prog.size,
          format_note: prog.quality,
          vcodec: "h264",
          acodec: "aac",
          quality: prog.height ?? 0,
        });
      }
    }

    if (files.hls?.cdns) {
      const cdns = files.hls.cdns;
      const defaultCdn = files.hls.default_cdn;
      const cdnNames = defaultCdn
        ? [defaultCdn, ...Object.keys(cdns).filter((k) => k !== defaultCdn)]
        : Object.keys(cdns);

      for (const cdnName of cdnNames) {
        const cdn = cdns[cdnName];
        const hlsUrl = cdn.avc_url ?? cdn.url;
        if (hlsUrl) {
          formats.push({
            format_id: `hls-${cdnName}`,
            url: hlsUrl,
            ext: "mp4",
            protocol: "m3u8",
            format_note: `HLS (${cdnName})`,
            source_preference: cdnName === defaultCdn ? 1 : 0,
          });
        }
      }
    }

    if (files.dash?.cdns) {
      const cdns = files.dash.cdns;
      const defaultCdn = files.dash.default_cdn;
      const cdnNames = defaultCdn
        ? [defaultCdn, ...Object.keys(cdns).filter((k) => k !== defaultCdn)]
        : Object.keys(cdns);

      for (const cdnName of cdnNames) {
        const cdn = cdns[cdnName];
        if (cdn.url) {
          formats.push({
            format_id: `dash-${cdnName}`,
            url: cdn.url,
            ext: "mp4",
            protocol: "dash",
            format_note: `DASH (${cdnName})`,
            source_preference: cdnName === defaultCdn ? 1 : 0,
          });
        }
      }
    }

    if (formats.length === 0) {
      throw new ExtractorError("No playable formats found for this Vimeo video");
    }

    const thumbnails: Thumbnail[] = [];
    if (video.thumbs) {
      for (const [size, thumbUrl] of Object.entries(video.thumbs)) {
        const dim = parseInt(size, 10);
        thumbnails.push({
          url: thumbUrl,
          width: isNaN(dim) ? undefined : dim,
          id: size,
        });
      }
    }

    return {
      id: videoId,
      title: video.title,
      description: video.description,
      uploader: video.owner?.name,
      uploader_url: video.owner?.url,
      duration: video.duration,
      webpage_url: `https://vimeo.com/${videoId}`,
      thumbnails,
      formats,
    };
  }
}
