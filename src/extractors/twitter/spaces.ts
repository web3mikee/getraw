import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format } from "../../core/types";

const VALID_URL = /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/i\/spaces\/([A-Za-z0-9]+)/;

const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=";

interface GuestTokenResponse {
  guest_token: string;
}

interface AudioSpaceMetadata {
  rest_id?: string;
  metadata?: {
    title?: string;
    creator_results?: {
      result?: {
        legacy?: { name?: string; screen_name?: string };
        rest_id?: string;
      };
    };
    started_at?: number;
    state?: string;
  };
  sharings?: unknown;
}

interface AudioSpaceResponse {
  data?: {
    audioSpace?: AudioSpaceMetadata;
  };
}

interface LiveVideoStreamStatus {
  source?: { location?: string; noRedirectPlaybackUrl?: string };
  sessionId?: string;
}

export class TwitterSpacesExtractor extends BaseExtractor {
  readonly _VALID_URL = VALID_URL;
  readonly _NAME = "twitter:spaces";

  private async getGuestToken(): Promise<string> {
    const resp = await fetch("https://api.x.com/1.1/guest/activate.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "TwitterAndroid/9.99.0-release.0",
      },
    });

    if (!resp.ok) {
      throw new ExtractorError(
        `twitter:spaces: failed to get guest token: ${resp.status}`,
      );
    }

    const data = (await resp.json()) as GuestTokenResponse;
    if (!data.guest_token) {
      throw new ExtractorError("twitter:spaces: no guest token in response");
    }
    return data.guest_token;
  }

  private async getSpaceMetadata(
    spaceId: string,
    guestToken: string,
  ): Promise<AudioSpaceMetadata> {
    const variables = JSON.stringify({
      id: spaceId,
      isMetatagsQuery: false,
      withReplays: true,
      withListeners: true,
    });

    const features = JSON.stringify({
      spaces_2022_h2_spaces_communities: true,
      spaces_2022_h2_clipping: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
    });

    const url =
      `https://api.x.com/graphql/kY7JFQmAeBaVp4UBdrK-wA/AudioSpaceById?` +
      `variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(features)}`;

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
        "x-guest-token": guestToken,
        "User-Agent": "TwitterAndroid/9.99.0-release.0",
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      throw new ExtractorError(
        `twitter:spaces: GraphQL request failed: ${resp.status}`,
      );
    }

    const data = (await resp.json()) as AudioSpaceResponse;
    const space = data?.data?.audioSpace;
    if (!space) {
      throw new ExtractorError(
        `twitter:spaces: space not found or unavailable: ${spaceId}`,
      );
    }
    return space;
  }

  private async getStreamUrl(
    mediaKey: string,
    guestToken: string,
  ): Promise<string> {
    const resp = await fetch(
      `https://twitter.com/i/api/1.1/live_video_stream/status/${mediaKey}`,
      {
        headers: {
          Authorization: `Bearer ${BEARER_TOKEN}`,
          "x-guest-token": guestToken,
          "User-Agent": "TwitterAndroid/9.99.0-release.0",
        },
      },
    );

    if (!resp.ok) {
      throw new ExtractorError(
        `twitter:spaces: stream status request failed: ${resp.status}`,
      );
    }

    const data = (await resp.json()) as LiveVideoStreamStatus;
    const location =
      data?.source?.noRedirectPlaybackUrl ?? data?.source?.location;
    if (!location) {
      throw new ExtractorError(
        "twitter:spaces: no stream location in response",
      );
    }
    return location;
  }

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = VALID_URL.exec(url);
    if (!match) throw new ExtractorError(`twitter:spaces: invalid URL: ${url}`);
    const spaceId = match[1];

    const guestToken = await this.getGuestToken();
    const space = await this.getSpaceMetadata(spaceId, guestToken);

    const metadata = space.metadata;
    const creatorLegacy = metadata?.creator_results?.result?.legacy;
    const creatorId = metadata?.creator_results?.result?.rest_id;

    const formats: Format[] = [];

    if (space.rest_id) {
      try {
        const streamUrl = await this.getStreamUrl(space.rest_id, guestToken);
        formats.push({
          format_id: "hls-audio",
          url: streamUrl,
          ext: "m4a",
          protocol: "m3u8",
          acodec: "aac",
          vcodec: "none",
        });
      } catch {
      }
    }

    const startedAt = metadata?.started_at;

    return {
      id: spaceId,
      title: metadata?.title ?? `Twitter Space ${spaceId}`,
      uploader: creatorLegacy?.name,
      uploader_id: creatorLegacy?.screen_name,
      uploader_url: creatorLegacy?.screen_name
        ? `https://twitter.com/${creatorLegacy.screen_name}`
        : undefined,
      channel_id: creatorId,
      timestamp: startedAt,
      upload_date: startedAt
        ? new Date(startedAt).toISOString().slice(0, 10).replace(/-/g, "")
        : undefined,
      live_status:
        metadata?.state === "Running"
          ? "is_live"
          : metadata?.state === "Ended"
            ? "was_live"
            : "not_live",
      formats,
      webpage_url: url,
      _type: "video",
    };
  }
}
