import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const VALID_URL = /https?:\/\/(?:www\.)?instagram\.com\/reels?\/?(?:\?.*)?$/;

const REELS_DOC_ID = "8845758582119845";

interface ReelsEdgeNode {
  id?: string;
  shortcode?: string;
  is_video?: boolean;
  video_url?: string;
  display_url?: string;
  dimensions?: { width?: number; height?: number };
  video_view_count?: number;
  video_duration?: number;
  taken_at_timestamp?: number;
  edge_liked_by?: { count?: number };
  edge_media_to_comment?: { count?: number };
  edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> };
  owner?: {
    id?: string;
    username?: string;
    full_name?: string;
  };
}

interface ReelsResponse {
  data?: {
    xdt_api__v1__clips__home__connection_v2?: {
      edges?: Array<{ node?: { media?: ReelsEdgeNode } }>;
      page_info?: { end_cursor?: string; has_next_page?: boolean };
    };
  };
}

export class InstagramReelsExtractor extends BaseExtractor {
  readonly _VALID_URL = VALID_URL;
  readonly _NAME = "instagram:reels";

  private readonly _headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.5",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-FB-Friendly-Name": "PolarisClipsHomePageQuery",
    "X-IG-App-ID": "936619743392459",
    Origin: "https://www.instagram.com",
    Referer: "https://www.instagram.com/reels/",
  };

  private buildEntryFromNode(node: ReelsEdgeNode): InfoDict | null {
    if (!node.is_video || !node.video_url) return null;

    const shortcode = node.shortcode ?? node.id ?? "unknown";
    const description = node.edge_media_to_caption?.edges?.[0]?.node?.text;
    const formats: Format[] = [
      {
        format_id: "mp4",
        url: node.video_url,
        ext: "mp4",
        width: node.dimensions?.width,
        height: node.dimensions?.height,
      },
    ];
    const thumbnails: Thumbnail[] = node.display_url
      ? [{ url: node.display_url }]
      : [];
    const uploadDate = node.taken_at_timestamp
      ? new Date(node.taken_at_timestamp * 1000)
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, "")
      : undefined;

    return {
      id: node.id ?? shortcode,
      title: description?.slice(0, 100) ?? `Instagram Reel ${shortcode}`,
      description,
      url: `https://www.instagram.com/reel/${shortcode}/`,
      webpage_url: `https://www.instagram.com/reel/${shortcode}/`,
      uploader: node.owner?.full_name ?? node.owner?.username,
      uploader_id: node.owner?.username,
      uploader_url: node.owner?.username
        ? `https://www.instagram.com/${node.owner.username}/`
        : undefined,
      channel_id: node.owner?.id,
      timestamp: node.taken_at_timestamp,
      upload_date: uploadDate,
      view_count: node.video_view_count,
      like_count: node.edge_liked_by?.count,
      comment_count: node.edge_media_to_comment?.count,
      duration: node.video_duration,
      formats,
      thumbnails,
      _type: "video",
    };
  }

  private async fetchReelsPage(cursor?: string): Promise<ReelsResponse> {
    const variables: Record<string, unknown> = {
      surface: "REELS_TAB",
      has_threaded_comments: true,
    };
    if (cursor) variables["after"] = cursor;

    const body = new URLSearchParams({
      doc_id: REELS_DOC_ID,
      variables: JSON.stringify(variables),
      server_timestamps: "true",
    });

    const resp = await fetch("https://www.instagram.com/graphql/query", {
      method: "POST",
      headers: this._headers,
      body: body.toString(),
    });

    if (!resp.ok) {
      throw new ExtractorError(
        `instagram:reels: GraphQL request failed: ${resp.status}`,
      );
    }

    return (await resp.json()) as ReelsResponse;
  }

  protected async _real_extract(url: string): Promise<InfoDict> {
    const entries: InfoDict[] = [];
    let cursor: string | undefined = undefined;
    let hasNextPage = true;
    let pageCount = 0;
    const maxPages = 5;

    while (hasNextPage && pageCount < maxPages) {
      const data = await this.fetchReelsPage(cursor);
      const connection =
        data?.data?.xdt_api__v1__clips__home__connection_v2;
      const edges = connection?.edges ?? [];

      for (const edge of edges) {
        const media = edge.node?.media;
        if (!media) continue;
        const entry = this.buildEntryFromNode(media);
        if (entry) entries.push(entry);
      }

      const pageInfo = connection?.page_info;
      hasNextPage = pageInfo?.has_next_page ?? false;
      cursor = pageInfo?.end_cursor;
      pageCount++;

      if (edges.length === 0) break;
    }

    return {
      id: "instagram-reels",
      title: "Instagram Reels",
      webpage_url: url,
      _type: "playlist",
      entries,
      playlist_count: entries.length,
    };
  }
}
