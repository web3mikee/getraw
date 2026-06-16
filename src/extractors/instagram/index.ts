import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const VALID_URL =
  /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/;

interface IGMediaNode {
  __typename?: string;
  id?: string;
  shortcode?: string;
  video_url?: string;
  display_url?: string;
  is_video?: boolean;
  dimensions?: { width?: number; height?: number };
  accessibility_caption?: string;
  edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> };
  owner?: {
    id?: string;
    username?: string;
    full_name?: string;
    profile_pic_url?: string;
  };
  taken_at_timestamp?: number;
  video_view_count?: number;
  edge_liked_by?: { count?: number };
  edge_media_to_comment?: { count?: number };
  video_duration?: number;
  edge_sidecar_to_children?: {
    edges?: Array<{ node?: IGMediaNode }>;
  };
  thumbnail_src?: string;
  thumbnail_resources?: Array<{
    src?: string;
    config_width?: number;
    config_height?: number;
  }>;
}

interface IGSharedData {
  entry_data?: {
    PostPage?: Array<{
      graphql?: { shortcode_media?: IGMediaNode };
    }>;
  };
  config?: { viewer?: { id?: string } };
}

interface IGAdditionalData {
  graphql?: { shortcode_media?: IGMediaNode };
}

export class InstagramExtractor extends BaseExtractor {
  readonly _VALID_URL = VALID_URL;
  readonly _NAME = "instagram";

  private readonly _headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
  };

  private extractSharedData(html: string): IGMediaNode | null {
    const sharedDataMatch = html.match(
      /window\._sharedData\s*=\s*(\{[\s\S]*?\});(?:\s*<\/script>|\s*window\.)/,
    );
    if (sharedDataMatch) {
      try {
        const sharedData = JSON.parse(sharedDataMatch[1]) as IGSharedData;
        const media =
          sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
        if (media) return media;
      } catch {
      }
    }

    const additionalDataMatch = html.match(
      /window\.__additionalDataLoaded\s*\(\s*['"][^'"]+['"]\s*,\s*(\{[\s\S]*?\})\s*\)\s*;/,
    );
    if (additionalDataMatch) {
      try {
        const additionalData = JSON.parse(
          additionalDataMatch[1],
        ) as IGAdditionalData;
        const media = additionalData?.graphql?.shortcode_media;
        if (media) return media;
      } catch {
      }
    }

    const scriptMatches = html.matchAll(
      /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g,
    );
    for (const scriptMatch of scriptMatches) {
      try {
        const data = JSON.parse(scriptMatch[1]) as Record<string, unknown>;
        if (data && typeof data === "object" && "shortcode_media" in data) {
          return (data as { shortcode_media: IGMediaNode }).shortcode_media;
        }
      } catch {
      }
    }

    return null;
  }

  private buildInfoFromMedia(
    media: IGMediaNode,
    shortcode: string,
    url: string,
  ): InfoDict {
    const formats: Format[] = [];
    const thumbnails: Thumbnail[] = [];
    const entries: InfoDict[] = [];

    const description =
      media.edge_media_to_caption?.edges?.[0]?.node?.text ?? undefined;

    const uploadDate = media.taken_at_timestamp
      ? new Date(media.taken_at_timestamp * 1000)
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, "")
      : undefined;

    if (media.thumbnail_resources) {
      for (const thumb of media.thumbnail_resources) {
        if (thumb.src) {
          thumbnails.push({
            url: thumb.src,
            width: thumb.config_width,
            height: thumb.config_height,
          });
        }
      }
    }
    if (media.thumbnail_src) {
      thumbnails.push({ url: media.thumbnail_src });
    }
    if (media.display_url) {
      thumbnails.push({ url: media.display_url, preference: 1 });
    }

    if (media.edge_sidecar_to_children?.edges) {
      for (const edge of media.edge_sidecar_to_children.edges) {
        const node = edge.node;
        if (!node) continue;
        const entryFormats: Format[] = [];
        const entryThumbs: Thumbnail[] = [];

        if (node.is_video && node.video_url) {
          entryFormats.push({
            format_id: "mp4",
            url: node.video_url,
            ext: "mp4",
            width: node.dimensions?.width,
            height: node.dimensions?.height,
          });
        }
        if (node.display_url) {
          entryThumbs.push({ url: node.display_url });
        }

        entries.push({
          id: node.id ?? node.shortcode ?? "unknown",
          title: description?.slice(0, 100) ?? `Instagram media`,
          description,
          formats: entryFormats,
          thumbnails: entryThumbs,
          _type: node.is_video ? "video" : "url",
          url: node.is_video ? node.video_url : node.display_url,
        });
      }
    }

    if (entries.length === 0 && media.is_video && media.video_url) {
      formats.push({
        format_id: "mp4",
        url: media.video_url,
        ext: "mp4",
        width: media.dimensions?.width,
        height: media.dimensions?.height,
      });
    }

    const base: InfoDict = {
      id: media.id ?? shortcode,
      title: description?.slice(0, 100) ?? `Instagram post ${shortcode}`,
      description,
      uploader: media.owner?.full_name ?? media.owner?.username,
      uploader_id: media.owner?.username,
      uploader_url: media.owner?.username
        ? `https://www.instagram.com/${media.owner.username}/`
        : undefined,
      channel_id: media.owner?.id,
      upload_date: uploadDate,
      timestamp: media.taken_at_timestamp,
      view_count: media.video_view_count,
      like_count: media.edge_liked_by?.count,
      comment_count: media.edge_media_to_comment?.count,
      duration: media.video_duration,
      thumbnails,
      webpage_url: url,
    };

    if (entries.length > 1) {
      return { ...base, _type: "playlist", entries, playlist_count: entries.length };
    }

    return { ...base, formats, _type: "video" };
  }

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = VALID_URL.exec(url);
    if (!match) throw new ExtractorError(`instagram: invalid URL: ${url}`);
    const shortcode = match[1];

    const apiUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
    const apiResp = await fetch(apiUrl, {
      headers: {
        ...this._headers,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    if (apiResp.ok) {
      try {
        const data = (await apiResp.json()) as IGAdditionalData;
        const media = data?.graphql?.shortcode_media;
        if (media) {
          return this.buildInfoFromMedia(media, shortcode, url);
        }
      } catch {
      }
    }

    const pageResp = await fetch(`https://www.instagram.com/p/${shortcode}/`, {
      headers: this._headers,
    });

    if (!pageResp.ok) {
      throw new ExtractorError(
        `instagram: page fetch failed: ${pageResp.status} ${pageResp.statusText}`,
      );
    }

    const html = await pageResp.text();
    const media = this.extractSharedData(html);

    if (!media) {
      throw new ExtractorError(
        `instagram: could not extract media data for post ${shortcode}`,
      );
    }

    return this.buildInfoFromMedia(media, shortcode, url);
  }
}
