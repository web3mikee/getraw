import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const GQL_ENDPOINT = "https://gql.twitch.tv/gql";

interface GQLResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

interface PlaybackAccessToken {
  value: string;
  signature: string;
}

interface VideoNode {
  id: string;
  title: string;
  description?: string;
  publishedAt?: string;
  lengthSeconds?: number;
  viewCount?: number;
  owner?: { displayName?: string; login?: string; id?: string };
  previewThumbnailURL?: string;
  thumbnailURLs?: string[];
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

export class TwitchVODExtractor extends BaseExtractor {
  readonly _VALID_URL = /^https?:\/\/(?:www\.)?twitch\.tv\/videos\/(\d+)/;
  readonly _NAME = "twitch:vod";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = this._VALID_URL.exec(url);
    if (!match) throw new ExtractorError("Invalid Twitch VOD URL");
    const videoId = match[1];

    const [tokenData, metaData] = await Promise.all([
      gqlRequest<{ videoPlaybackAccessToken: PlaybackAccessToken }>({
        operationName: "PlaybackAccessToken",
        variables: {
          isLive: false,
          login: "",
          isVod: true,
          vodID: videoId,
          playerType: "site",
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712",
          },
        },
      }),
      gqlRequest<{ video: VideoNode }>({
        operationName: "VideoMetadata",
        variables: { channelLogin: "", videoID: videoId },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "49b5b8f268cdeb259d75b58dcb0c1a748e3b575003448a2333dc5cdafd49adad",
          },
        },
      }),
    ]);

    const token = tokenData.videoPlaybackAccessToken;
    if (!token) throw new ExtractorError("Could not get Twitch VOD access token");

    const hlsUrl =
      `https://usher.twitchapps.com/vod/${videoId}?` +
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

    const video = metaData?.video;

    const formats: Format[] = [
      {
        format_id: "hls",
        url: hlsUrl,
        ext: "mp4",
        protocol: "m3u8",
        http_headers: { "Client-ID": TWITCH_CLIENT_ID },
      },
    ];

    const thumbnails: Thumbnail[] = [];
    if (video?.previewThumbnailURL) {
      thumbnails.push({ url: video.previewThumbnailURL });
    }

    return {
      id: videoId,
      title: video?.title ?? `Twitch VOD ${videoId}`,
      description: video?.description,
      uploader: video?.owner?.displayName,
      uploader_id: video?.owner?.login,
      channel: video?.owner?.displayName,
      channel_id: video?.owner?.id,
      duration: video?.lengthSeconds,
      view_count: video?.viewCount,
      upload_date: video?.publishedAt?.replace(/-/g, "").slice(0, 8),
      webpage_url: url,
      formats,
      thumbnails,
    };
  }
}
