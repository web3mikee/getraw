import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict } from "../../core/types";

const VALID_URL = /https?:\/\/(?:www\.)?tiktok\.com\/@([\w.]+)(?:\/?(?:\?.*)?)?$/;

interface TikTokUserVideo {
  id?: string;
  desc?: string;
  createTime?: number;
  video?: { cover?: string };
}

interface TikTokUserListResponse {
  itemList?: TikTokUserVideo[];
  cursor?: string;
  hasMore?: boolean;
  minCursor?: number;
  maxCursor?: number;
}

interface TikTokUserRehydration {
  __DEFAULT_SCOPE__?: {
    "webapp.user-detail"?: {
      userInfo?: {
        user?: {
          id?: string;
          uniqueId?: string;
          nickname?: string;
          signature?: string;
        };
        stats?: {
          videoCount?: number;
        };
      };
    };
  };
}

export class TikTokUserExtractor extends BaseExtractor {
  readonly _VALID_URL = VALID_URL;
  readonly _NAME = "tiktok:user";

  private readonly _headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: "https://www.tiktok.com/",
  };

  private extractUserData(html: string): TikTokUserRehydration | null {
    const match = html.match(
      /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!match) return null;
    try {
      return JSON.parse(match[1]) as TikTokUserRehydration;
    } catch {
      return null;
    }
  }

  private async fetchUserVideos(
    userId: string,
    cursor: string = "0",
    count: number = 35,
  ): Promise<TikTokUserListResponse> {
    const params = new URLSearchParams({
      userId,
      count: String(count),
      cursor,
      cookie_enabled: "true",
      screen_width: "1920",
      screen_height: "1080",
      browser_language: "en-US",
      browser_platform: "Win32",
      browser_name: "Mozilla",
      browser_version: "5.0",
      browser_online: "true",
      timezone_name: "America/New_York",
      priority_region: "",
      referer: "",
    });

    const resp = await fetch(
      `https://www.tiktok.com/api/post/item_list/?${params.toString()}`,
      {
        headers: {
          ...this._headers,
          Accept: "application/json, text/plain, */*",
        },
      },
    );

    if (!resp.ok) {
      throw new ExtractorError(
        `tiktok:user: video list request failed: ${resp.status}`,
      );
    }

    return (await resp.json()) as TikTokUserListResponse;
  }

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = VALID_URL.exec(url);
    if (!match) throw new ExtractorError(`tiktok:user: invalid URL: ${url}`);
    const username = match[1];

    const resp = await fetch(url, { headers: this._headers });
    if (!resp.ok) {
      throw new ExtractorError(
        `tiktok:user: page fetch failed: ${resp.status}`,
      );
    }

    const html = await resp.text();
    const userData = this.extractUserData(html);

    const userInfo =
      userData?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
    const user = userInfo?.user;

    if (!user?.id) {
      throw new ExtractorError(
        `tiktok:user: could not find user data for @${username}`,
      );
    }

    const userId = user.id;
    const entries: InfoDict[] = [];
    let cursor = "0";
    let hasMore = true;
    let pageCount = 0;
    const maxPages = 20;

    while (hasMore && pageCount < maxPages) {
      const data = await this.fetchUserVideos(userId, cursor);
      const items = data.itemList ?? [];

      for (const item of items) {
        if (!item.id) continue;
        entries.push({
          id: item.id,
          title: item.desc ?? `TikTok video ${item.id}`,
          url: `https://www.tiktok.com/@${username}/video/${item.id}`,
          webpage_url: `https://www.tiktok.com/@${username}/video/${item.id}`,
          _type: "url",
          uploader: user.nickname,
          uploader_id: username,
          thumbnails: item.video?.cover ? [{ url: item.video.cover }] : [],
          timestamp: item.createTime,
        });
      }

      hasMore = data.hasMore ?? false;
      cursor = data.maxCursor?.toString() ?? String(Number(cursor) + items.length);
      pageCount++;

      if (items.length === 0) break;
    }

    return {
      id: userId,
      title: `${user.nickname ?? username}'s TikTok videos`,
      description: user.signature,
      uploader: user.nickname,
      uploader_id: username,
      uploader_url: url,
      webpage_url: url,
      _type: "playlist",
      entries,
      playlist_count: entries.length,
    };
  }
}
