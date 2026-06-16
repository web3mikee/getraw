import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format } from "../../core/types";

interface GalleryItem {
  media_id: string;
  id: number;
  caption?: string;
}

interface GalleryMedia {
  [mediaId: string]: {
    e: string;
    m?: string;
    p?: Array<{ u: string; x: number; y: number }>;
    s?: { u?: string; mp4?: string; gif?: string; x?: number; y?: number };
    id: string;
  };
}

interface RedditGalleryPost {
  id: string;
  title: string;
  author: string;
  url: string;
  score?: number;
  created_utc?: number;
  gallery_data?: { items?: GalleryItem[] };
  media_metadata?: GalleryMedia;
}

interface RedditApiResponse {
  data: {
    children: Array<{ data: RedditGalleryPost }>;
  };
}

export class RedditGalleryExtractor extends BaseExtractor {
  readonly _VALID_URL =
    /^https?:\/\/(?:www\.|old\.)?reddit\.com\/(?:r\/[^/]+\/comments\/[^/]+|gallery\/[^/]+)/;
  readonly _NAME = "reddit:gallery";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const normalized = url.replace(/(?:www\.|old\.)?reddit\.com/, "www.reddit.com");
    const jsonUrl = normalized.replace(/\?.*$/, "").replace(/\/$/, "") + ".json";

    const response = await fetch(jsonUrl, {
      headers: { "User-Agent": "dlpx/1.0" },
    });
    if (!response.ok) {
      throw new ExtractorError(`Reddit API returned ${response.status}`);
    }

    const data = (await response.json()) as RedditApiResponse[];
    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post) {
      throw new ExtractorError("Could not parse Reddit gallery response");
    }

    if (!post.gallery_data || !post.media_metadata) {
      throw new ExtractorError("No gallery data found in this post");
    }

    const items = post.gallery_data.items ?? [];
    const metadata = post.media_metadata;

    const entries: InfoDict[] = items.map((item, idx) => {
      const media = metadata[item.media_id];
      const formats: Format[] = [];

      if (media) {
        if (media.e === "AnimatedImage" && media.s?.mp4) {
          formats.push({
            format_id: "mp4",
            url: media.s.mp4.replace(/&amp;/g, "&"),
            ext: "mp4",
            width: media.s.x,
            height: media.s.y,
          });
        } else if (media.e === "Image" && media.s?.u) {
          formats.push({
            format_id: "image",
            url: media.s.u.replace(/&amp;/g, "&"),
            ext: media.m?.split("/")?.[1] ?? "jpg",
            width: media.s.x,
            height: media.s.y,
          });
        }

        if (media.p && media.p.length > 0) {
          for (const preview of media.p) {
            formats.push({
              format_id: `preview-${preview.x}x${preview.y}`,
              url: preview.u.replace(/&amp;/g, "&"),
              ext: "jpg",
              width: preview.x,
              height: preview.y,
            });
          }
        }
      }

      return {
        id: item.media_id,
        title: item.caption ?? `${post.title} [${idx + 1}/${items.length}]`,
        webpage_url: url,
        uploader: post.author,
        playlist_index: idx + 1,
        formats,
      };
    });

    return {
      id: post.id,
      title: post.title,
      webpage_url: url,
      uploader: post.author,
      timestamp: post.created_utc,
      like_count: post.score,
      _type: "playlist",
      entries,
      playlist_count: entries.length,
    };
  }
}
