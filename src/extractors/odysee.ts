import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict, Format, Thumbnail } from "../core/types";

interface OdyseeClaimValue {
  stream?: {
    source?: { media_type?: string; sd_hash?: string };
    video?: { width?: number; height?: number; duration?: number };
    audio?: { channel_count?: number };
  };
  title?: string;
  description?: string;
  thumbnail?: { url?: string };
  tags?: string[];
}

interface OdyseeClaim {
  claim_id?: string;
  name?: string;
  value?: OdyseeClaimValue;
  channel_name?: string;
  signing_channel?: { name?: string; claim_id?: string };
  value_type?: string;
}

interface OdyseeProxyResponse {
  result?: {
    items?: OdyseeClaim[];
    streaming_url?: string;
  };
  error?: { message?: string };
}

export class OdyseeExtractor extends BaseExtractor {
  readonly _VALID_URL = /https?:\/\/(?:www\.)?(?:odysee\.com|lbry\.tv)\/@[^/]+:[^/]+\/([^/?#]+)/;
  readonly _NAME = "odysee";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const urlObj = new URL(url);
    const claimUrl = `lbry:/${urlObj.pathname}`;

    const resolveResponse = await fetch("https://api.na-backend.odysee.com/api/v1/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        method: "resolve",
        params: { urls: [claimUrl] },
      }),
    });

    if (!resolveResponse.ok) {
      throw new ExtractorError(`Odysee resolve error: ${resolveResponse.status}`);
    }

    const resolveData = (await resolveResponse.json()) as { result?: Record<string, OdyseeClaim>; error?: { message?: string } };

    const claims = resolveData.result ?? {};
    const claim = Object.values(claims)[0];

    if (!claim || !claim.claim_id) {
      throw new ExtractorError("Odysee: could not resolve claim");
    }

    const streamResponse = await fetch("https://api.na-backend.odysee.com/api/v1/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        method: "get",
        params: { uri: claimUrl, save_file: false },
      }),
    });

    if (!streamResponse.ok) {
      throw new ExtractorError(`Odysee stream error: ${streamResponse.status}`);
    }

    const streamData = (await streamResponse.json()) as OdyseeProxyResponse;

    if (streamData.error?.message) {
      throw new ExtractorError(`Odysee: ${streamData.error.message}`);
    }

    const streamingUrl = streamData.result?.streaming_url;
    if (!streamingUrl) {
      throw new ExtractorError("Odysee: no streaming URL found");
    }

    const value = claim.value ?? {};
    const isHLS = streamingUrl.includes(".m3u8");

    const formats: Format[] = [
      {
        format_id: isHLS ? "hls" : "mp4",
        url: streamingUrl,
        ext: "mp4",
        protocol: isHLS ? "m3u8" : undefined,
        width: value.stream?.video?.width,
        height: value.stream?.video?.height,
      },
    ];

    const thumbnails: Thumbnail[] = value.thumbnail?.url
      ? [{ url: value.thumbnail.url }]
      : [];

    const channelName = claim.signing_channel?.name ?? claim.channel_name;

    return {
      id: claim.claim_id,
      title: value.title ?? claim.name ?? "Odysee Video",
      description: value.description,
      uploader: channelName,
      duration: value.stream?.video?.duration,
      thumbnails,
      formats,
      tags: value.tags,
      webpage_url: url,
      extractor: this._NAME,
    };
  }
}
