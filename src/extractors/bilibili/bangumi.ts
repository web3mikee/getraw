import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const VALID_URL = /https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/play\/(ep(\d+)|ss(\d+))/;

interface BangumiEpisode {
  id: number;
  ep_id?: number;
  aid: number;
  bvid: string;
  cid: number;
  title: string;
  long_title?: string;
  duration: number;
  pub_time: number;
  cover: string;
  badge?: string;
  index: number;
  index_title?: string;
}

interface BangumiData {
  code: number;
  message: string;
  result: {
    season_id: number;
    season_title: string;
    cover: string;
    evaluate?: string;
    total: number;
    media_id: number;
    type_name: string;
    episodes: BangumiEpisode[];
    up_info?: { mid: number; uname: string };
  };
}

interface PlayUrlData {
  code: number;
  message: string;
  result: {
    quality: number;
    accept_quality: number[];
    dash?: {
      video: Array<{
        id: number;
        baseUrl: string;
        bandwidth: number;
        mimeType: string;
        codecs: string;
        width?: number;
        height?: number;
        frameRate?: string;
      }>;
      audio: Array<{
        id: number;
        baseUrl: string;
        bandwidth: number;
        mimeType: string;
        codecs: string;
      }>;
    };
    durl?: Array<{ url: string; size: number; order: number }>;
  };
}

const QUALITY_MAP: Record<number, string> = {
  127: "8K", 126: "Dolby Vision", 125: "HDR", 120: "4K",
  116: "1080p60", 112: "1080p+", 80: "1080p", 64: "720p", 32: "480p", 16: "360p",
};

const BILIBILI_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
  Origin: "https://www.bilibili.com",
};

export class BilibiliBangumiExtractor extends BaseExtractor {
  readonly _VALID_URL = VALID_URL;
  readonly _NAME = "bilibili:bangumi";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = VALID_URL.exec(url);
    if (!match) throw new ExtractorError(`bilibili:bangumi: invalid URL: ${url}`);

    const epId = match[2];
    const ssId = match[3];

    const apiUrl = epId
      ? `https://api.bilibili.com/pgc/view/web/season?ep_id=${epId}`
      : `https://api.bilibili.com/pgc/view/web/season?season_id=${ssId}`;

    const resp = await fetch(apiUrl, { headers: BILIBILI_HEADERS });
    if (!resp.ok) throw new ExtractorError(`bilibili:bangumi: API failed: ${resp.status}`);

    const data = (await resp.json()) as BangumiData;
    if (data.code !== 0) throw new ExtractorError(`bilibili:bangumi: ${data.message}`);

    const season = data.result;

    if (epId) {
      const ep = season.episodes.find((e) => String(e.id) === epId || String(e.ep_id) === epId);
      if (!ep) throw new ExtractorError(`bilibili:bangumi: episode ${epId} not found`);
      return await this.extractEpisode(ep, season.season_title, url);
    }

    const entries: InfoDict[] = [];
    for (const ep of season.episodes) {
      entries.push({
        id: `ep${ep.id}`,
        title: `${season.season_title} - ${ep.long_title ?? ep.title}`,
        thumbnail: ep.cover,
        duration: ep.duration / 1000,
        webpage_url: `https://www.bilibili.com/bangumi/play/ep${ep.id}`,
        _type: "url",
      });
    }

    const thumbnails: Thumbnail[] = [{ url: season.cover }];

    return {
      id: `ss${season.season_id}`,
      title: season.season_title,
      description: season.evaluate,
      thumbnails,
      entries,
      playlist_count: season.total,
      _type: "playlist",
      webpage_url: url,
    };
  }

  private async extractEpisode(
    ep: BangumiEpisode,
    seasonTitle: string,
    url: string,
  ): Promise<InfoDict> {
    const playParams = new URLSearchParams({
      ep_id: String(ep.id),
      bvid: ep.bvid,
      cid: String(ep.cid),
      qn: "127",
      fnval: "4048",
      fnver: "0",
      fourk: "1",
    });

    const playResp = await fetch(
      `https://api.bilibili.com/pgc/player/web/playurl?${playParams}`,
      { headers: BILIBILI_HEADERS },
    );
    if (!playResp.ok)
      throw new ExtractorError(`bilibili:bangumi: playurl failed: ${playResp.status}`);

    const playData = (await playResp.json()) as PlayUrlData;
    if (playData.code !== 0)
      throw new ExtractorError(`bilibili:bangumi: playurl: ${playData.message}`);

    const formats: Format[] = [];

    if (playData.result.dash) {
      for (const vs of playData.result.dash.video) {
        formats.push({
          format_id: `dash-video-${vs.id}`,
          url: vs.baseUrl,
          ext: vs.mimeType.includes("mp4") ? "mp4" : "webm",
          vcodec: vs.codecs,
          acodec: "none",
          width: vs.width,
          height: vs.height,
          fps: vs.frameRate ? parseFloat(vs.frameRate) : undefined,
          tbr: Math.round(vs.bandwidth / 1000),
          format_note: QUALITY_MAP[vs.id] ?? `qn${vs.id}`,
          http_headers: BILIBILI_HEADERS,
        });
      }
      for (const as_ of playData.result.dash.audio) {
        formats.push({
          format_id: `dash-audio-${as_.id}`,
          url: as_.baseUrl,
          ext: as_.mimeType.includes("mp4") ? "m4a" : "ogg",
          vcodec: "none",
          acodec: as_.codecs,
          abr: Math.round(as_.bandwidth / 1000),
          format_note: "audio",
          http_headers: BILIBILI_HEADERS,
        });
      }
    }

    const uploadDate = new Date(ep.pub_time * 1000).toISOString().slice(0, 10).replace(/-/g, "");

    return {
      id: `ep${ep.id}`,
      title: `${seasonTitle} - ${ep.long_title ?? ep.title}`,
      thumbnail: ep.cover,
      duration: ep.duration / 1000,
      upload_date: uploadDate,
      timestamp: ep.pub_time,
      formats,
      webpage_url: url,
      _type: "video",
    };
  }
}
