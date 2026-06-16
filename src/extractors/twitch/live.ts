import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const GQL_ENDPOINT = "https://gql.twitch.tv/gql";

interface StreamAccessToken {
  value: string;
  signature: string;
}

interface StreamNode {
  id?: string;
  title?: string;
  viewersCount?: number;
  previewImageURL?: string;
  broadcaster?: { displayName?: string; login?: string; id?: string };
  game?: { name?: string };
}

interface GQLResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

async function gqlRequest<T>(query: object): Promise<T> {
  const response = await fetch(GQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(query),
  });
  if (!response.ok) {
    throw new ExtractorError(`Twitch GQL request failed: ${response.status}`);
  }
  const result = (await response.json()) as GQLResponse<T>;
  if (result.errors?.length) {
    throw new ExtractorError(`Twitch GQL error: ${result.errors[0].message}`);
  }
  return result.data;
}

export class TwitchLiveExtractor extends BaseExtractor {
  readonly _VALID_URL =
    /^https?:\/\/(?:www\.)?twitch\.tv\/([a-zA-Z0-9_]+)(?:\/)?(?:\?.*)?$/;
  readonly _NAME = "twitch:live";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = this._VALID_URL.exec(url);
    if (!match) throw new ExtractorError("Invalid Twitch channel URL");
    const login = match[1].toLowerCase();

    const [tokenData, streamData] = await Promise.all([
      gqlRequest<{ streamPlaybackAccessToken: StreamAccessToken }>({
        operationName: "PlaybackAccessToken",
        variables: {
          isLive: true,
          login,
          isVod: false,
          vodID: "",
          playerType: "site",
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712",
          },
        },
      }),
      gqlRequest<{ user?: { stream?: StreamNode } }>({
        operationName: "StreamMetadata",
        variables: { channelLogin: login },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "1c719a40e481453e5c48d9bb585d971b8b372f8ebb105b17076722264dfa5b3e",
          },
        },
      }),
    ]);

    const token = tokenData.streamPlaybackAccessToken;
    if (!token) throw new ExtractorError("Could not get stream access token — channel may be offline");

    const hlsUrl =
      `https://usher.twitchapps.com/api/channel/hls/${login}.m3u8?` +
      new URLSearchParams({
        sig: token.signature,
        token: token.value,
        allow_source: "true",
        allow_audio_only: "true",
        allow_spectre: "true",
        p: String(Math.floor(Math.random() * 999999)),
        platform: "web",
        play_session_id: crypto.randomUUID().replace(/-/g, ""),
        supported_codecs: "avc1",
      });

    const stream = streamData?.user?.stream;

    const formats: Format[] = [
      {
        format_id: "hls-live",
        url: hlsUrl,
        ext: "mp4",
        protocol: "m3u8",
        http_headers: { "Client-ID": TWITCH_CLIENT_ID },
        format_note: "live stream",
      },
    ];

    const thumbnails: Thumbnail[] = [];
    if (stream?.previewImageURL) {
      thumbnails.push({ url: stream.previewImageURL });
    }

    return {
      id: login,
      title: stream?.title ?? `${login} live stream`,
      webpage_url: url,
      uploader: login,
      uploader_id: login,
      view_count: stream?.viewersCount,
      live_status: "is_live",
      categories: stream?.game?.name ? [stream.game.name] : undefined,
      formats,
      thumbnails,
    };
  }
}
