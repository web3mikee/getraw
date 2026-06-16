import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const GQL_ENDPOINT = "https://gql.twitch.tv/gql";

interface ClipAccessToken {
  value: string;
  signature: string;
}

interface ClipVideoQuality {
  frameRate: number;
  quality: string;
  sourceURL: string;
}

interface ClipNode {
  id: string;
  slug: string;
  title: string;
  durationSeconds?: number;
  viewCount?: number;
  createdAt?: string;
  broadcaster?: { displayName?: string; login?: string; id?: string };
  curator?: { displayName?: string; login?: string };
  thumbnailURL?: string;
  videoQualities?: ClipVideoQuality[];
  playbackAccessToken?: ClipAccessToken;
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

export class TwitchClipExtractor extends BaseExtractor {
  readonly _VALID_URL =
    /^https?:\/\/(?:www\.)?twitch\.tv\/(?:[^/]+)\/clip\/([^/?#]+)|^https?:\/\/clips\.twitch\.tv\/([^/?#]+)/;
  readonly _NAME = "twitch:clip";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = this._VALID_URL.exec(url);
    if (!match) throw new ExtractorError("Invalid Twitch clip URL");
    const slug = match[1] ?? match[2];

    const data = await gqlRequest<{ clip: ClipNode }>({
      operationName: "VideoAccessToken_Clip",
      variables: { slug },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "36b89d2507fce29e5ca551df756d27c1cfe079e2609642b4390aa4c35796eb11",
        },
      },
    });

    const clip = data?.clip;
    if (!clip) throw new ExtractorError("Could not find Twitch clip");

    const token = clip.playbackAccessToken;
    const qualities = clip.videoQualities ?? [];

    const formats: Format[] = qualities.map((q) => {
      const qualityParams = token
        ? `?sig=${encodeURIComponent(token.signature)}&token=${encodeURIComponent(token.value)}`
        : "";
      const heightMap: Record<string, number> = {
        "1080": 1080,
        "720": 720,
        "480": 480,
        "360": 360,
        "160": 160,
      };
      return {
        format_id: `clip-${q.quality}`,
        url: q.sourceURL + qualityParams,
        ext: "mp4",
        fps: q.frameRate,
        height: heightMap[q.quality],
        format_note: `${q.quality}p`,
        http_headers: { "Client-ID": TWITCH_CLIENT_ID },
      };
    });

    const thumbnails: Thumbnail[] = [];
    if (clip.thumbnailURL) {
      thumbnails.push({ url: clip.thumbnailURL });
    }

    return {
      id: clip.id,
      title: clip.title,
      webpage_url: url,
      uploader: clip.broadcaster?.displayName,
      uploader_id: clip.broadcaster?.login,
      channel: clip.broadcaster?.displayName,
      channel_id: clip.broadcaster?.id,
      duration: clip.durationSeconds,
      view_count: clip.viewCount,
      upload_date: clip.createdAt?.replace(/-/g, "").slice(0, 8),
      formats,
      thumbnails,
    };
  }
}
