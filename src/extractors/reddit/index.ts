import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

interface RedditVideoData {
  dash_url?: string;
  fallback_url?: string;
  width?: number;
  height?: number;
  duration?: number;
  is_gif?: boolean;
}

interface RedditPostData {
  id: string;
  title: string;
  author: string;
  url: string;
  thumbnail?: string;
  subreddit?: string;
  score?: number;
  created_utc?: number;
  is_video?: boolean;
  secure_media?: {
    reddit_video?: RedditVideoData;
  };
  media?: {
    reddit_video?: RedditVideoData;
  };
  preview?: {
    images?: Array<{
      source?: { url: string; width?: number; height?: number };
    }>;
  };
}

interface RedditApiResponse {
  data: {
    children: Array<{
      data: RedditPostData;
    }>;
  };
}

function normalizeRedditUrl(url: string): string {
  const urlObj = new URL(url);
  if (urlObj.hostname === "v.redd.it") {
    return url;
  }
  urlObj.hostname = "www.reddit.com";
  return urlObj.href;
}

async function fetchAudioUrlFromDash(dashUrl: string): Promise<string | null> {
  try {
    const response = await fetch(dashUrl);
    if (!response.ok) return null;
    const text = await response.text();
    const audioMatch = text.match(/<AdaptationSet[^>]*mimeType="audio[^"]*"[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/i);
    if (audioMatch) {
      const base = new URL(dashUrl);
      return new URL(audioMatch[1], base.origin + base.pathname.replace(/[^/]+$/, "")).href;
    }
    const audioInitMatch = text.match(/initialization="([^"]*audio[^"]*)"/i);
    if (audioInitMatch) {
      const base = new URL(dashUrl);
      return new URL(audioInitMatch[1], base.origin + base.pathname.replace(/[^/]+$/, "")).href;
    }
  } catch {
    return null;
  }
  return null;
}

export class RedditExtractor extends BaseExtractor {
  readonly _VALID_URL =
    /^https?:\/\/(?:www\.|old\.)?reddit\.com\/r\/[^/]+\/comments\/[^/]+|^https?:\/\/v\.redd\.it\/[^/]+/;
  readonly _NAME = "reddit";

  protected async _real_extract(url: string): Promise<InfoDict> {
    if (/^https?:\/\/v\.redd\.it\//.test(url)) {
      return this._extractVReddIt(url);
    }
    return this._extractRedditPost(url);
  }

  private async _extractVReddIt(url: string): Promise<InfoDict> {
    const jsonUrl = url.endsWith("/") ? url + ".json" : url + "/.json";
    const response = await fetch(jsonUrl, {
      headers: { "User-Agent": "dlpx/1.0" },
    });
    if (!response.ok) {
      throw new ExtractorError(`Reddit API returned ${response.status}`);
    }
    const data = (await response.json()) as RedditApiResponse | RedditApiResponse[];
    const apiData = Array.isArray(data) ? data[0] : data;
    const post = apiData?.data?.children?.[0]?.data;
    if (!post) {
      throw new ExtractorError("Could not parse Reddit API response");
    }
    return this._buildInfoFromPost(url, post);
  }

  private async _extractRedditPost(url: string): Promise<InfoDict> {
    const normalized = normalizeRedditUrl(url);
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
      throw new ExtractorError("Could not parse Reddit API response");
    }
    return this._buildInfoFromPost(url, post);
  }

  private async _buildInfoFromPost(url: string, post: RedditPostData): Promise<InfoDict> {
    const videoData = post.secure_media?.reddit_video ?? post.media?.reddit_video;

    if (!videoData) {
      throw new ExtractorError("No Reddit video found in this post");
    }

    const formats: Format[] = [];

    if (videoData.fallback_url) {
      formats.push({
        format_id: "mp4-video-only",
        url: videoData.fallback_url,
        ext: "mp4",
        vcodec: "h264",
        acodec: "none",
        width: videoData.width,
        height: videoData.height,
        format_note: "video only",
      });
    }

    if (videoData.dash_url) {
      let audioUrl: string | null = null;
      if (videoData.fallback_url) {
        audioUrl = videoData.fallback_url.replace(/DASH_\d+\.mp4/, "DASH_audio.mp4");
      }
      if (!audioUrl) {
        audioUrl = await fetchAudioUrlFromDash(videoData.dash_url);
      }

      formats.push({
        format_id: "dash",
        url: videoData.dash_url,
        ext: "mp4",
        protocol: "dash",
        width: videoData.width,
        height: videoData.height,
        format_note: "DASH manifest",
      });

      if (audioUrl && videoData.fallback_url) {
        formats.push({
          format_id: "mp4-with-audio",
          url: videoData.fallback_url,
          ext: "mp4",
          vcodec: "h264",
          acodec: "aac",
          width: videoData.width,
          height: videoData.height,
          format_note: "video+audio (merged)",
          http_headers: { "User-Agent": "dlpx/1.0" },
        });
      }
    }

    const thumbnails: Thumbnail[] = [];
    if (post.thumbnail && post.thumbnail !== "default" && post.thumbnail !== "self") {
      thumbnails.push({ url: post.thumbnail });
    }
    const previewSource = post.preview?.images?.[0]?.source;
    if (previewSource?.url) {
      thumbnails.push({
        url: previewSource.url.replace(/&amp;/g, "&"),
        width: previewSource.width,
        height: previewSource.height,
        preference: 1,
      });
    }

    return {
      id: post.id,
      title: post.title,
      webpage_url: url,
      uploader: post.author,
      duration: videoData.duration,
      timestamp: post.created_utc,
      like_count: post.score,
      formats,
      thumbnails,
      extractor: this._NAME,
    };
  }
}
