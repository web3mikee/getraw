import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const VALID_URL = /https?:\/\/(?:www\.)?bilibili\.com\/video\/(BV[\w]+|av(\d+))/;

const QUALITY_MAP: Record<number, string> = {
  127: "8K",
  126: "Dolby Vision",
  125: "HDR",
  120: "4K",
  116: "1080p60",
  112: "1080p+",
  80: "1080p",
  64: "720p",
  32: "480p",
  16: "360p",
};

const QUALITY_PREFERENCE: Record<number, number> = {
  127: 10,
  126: 9,
  125: 8,
  120: 7,
  116: 6,
  112: 5,
  80: 4,
  64: 3,
  32: 2,
  16: 1,
};

interface VideoViewData {
  code: number;
  message: string;
  data: {
    bvid: string;
    aid: number;
    cid: number;
    title: string;
    desc: string;
    owner: { name: string; mid: number };
    stat: { view: number; like: number; coin: number; reply: number };
    pic: string;
    duration: number;
    pubdate: number;
    pages?: Array<{ cid: number; page: number; part: string; duration: number }>;
  };
}

interface DashStream {
  id: number;
  baseUrl: string;
  base_url: string;
  backupUrl?: string[];
  backup_url?: string[];
  bandwidth: number;
  mimeType: string;
  mime_type: string;
  codecs: string;
  width?: number;
  height?: number;
  frameRate?: string;
  frame_rate?: string;
  sar?: string;
}

interface PlayUrlData {
  code: number;
  message: string;
  data: {
    quality: number;
    accept_quality: number[];
    accept_description: string[];
    dash?: {
      video: DashStream[];
      audio: DashStream[];
    };
    durl?: Array<{ url: string; size: number; order: number }>;
  };
}

const BILIBILI_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
  Origin: "https://www.bilibili.com",
};

function bvToAv(bvid: string): number {
  const TABLE = "fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF";
  const tr: Record<string, number> = {};
  for (let i = 0; i < TABLE.length; i++) tr[TABLE[i]] = i;
  const s = [11, 10, 3, 8, 4, 6];
  const xor = 177451812;
  const add = 8728348608;
  let r = 0n;
  for (let i = 0; i < 6; i++) r += BigInt(tr[bvid[s[i]]]) * 58n ** BigInt(i);
  return Number((r - BigInt(add)) ^ BigInt(xor));
}

export class BilibiliExtractor extends BaseExtractor {
  readonly _VALID_URL = VALID_URL;
  readonly _NAME = "bilibili";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = VALID_URL.exec(url);
    if (!match) throw new ExtractorError(`bilibili: invalid URL: ${url}`);

    const idPart = match[1];
    let bvid: string;
    let aid: number;

    if (idPart.startsWith("BV")) {
      bvid = idPart;
      aid = bvToAv(bvid);
    } else {
      aid = parseInt(match[2], 10);
      bvid = `av${aid}`;
    }

    const viewUrl = `https://api.bilibili.com/x/web-interface/view?${idPart.startsWith("BV") ? "bvid=" + bvid : "aid=" + aid}`;
    const viewResp = await fetch(viewUrl, { headers: BILIBILI_HEADERS });
    if (!viewResp.ok) throw new ExtractorError(`bilibili: view API failed: ${viewResp.status}`);

    const viewData = (await viewResp.json()) as VideoViewData;
    if (viewData.code !== 0) throw new ExtractorError(`bilibili: ${viewData.message}`);

    const video = viewData.data;
    const cid = video.cid;

    const playParams = new URLSearchParams({
      bvid: video.bvid,
      cid: String(cid),
      qn: "127",
      fnval: "4048",
      fnver: "0",
      fourk: "1",
    });

    const playResp = await fetch(`https://api.bilibili.com/x/player/playurl?${playParams}`, {
      headers: BILIBILI_HEADERS,
    });
    if (!playResp.ok) throw new ExtractorError(`bilibili: playurl API failed: ${playResp.status}`);

    const playData = (await playResp.json()) as PlayUrlData;
    if (playData.code !== 0) throw new ExtractorError(`bilibili: playurl: ${playData.message}`);

    const formats: Format[] = [];

    if (playData.data.dash) {
      const { video: videoStreams, audio: audioStreams } = playData.data.dash;

      const bestAudio = audioStreams.reduce<DashStream | null>((best, a) => {
        if (!best || a.bandwidth > best.bandwidth) return a;
        return best;
      }, null);

      for (const vs of videoStreams) {
        const streamUrl = vs.baseUrl || vs.base_url;
        const qualityNote = QUALITY_MAP[vs.id] ?? `qn${vs.id}`;
        const mime = vs.mimeType || vs.mime_type;
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const fps = vs.frameRate || vs.frame_rate ? parseFloat(vs.frameRate ?? vs.frame_rate ?? "0") : undefined;

        formats.push({
          format_id: `dash-video-${vs.id}`,
          url: streamUrl,
          ext,
          vcodec: vs.codecs,
          acodec: "none",
          width: vs.width,
          height: vs.height,
          fps,
          tbr: Math.round(vs.bandwidth / 1000),
          format_note: qualityNote,
          quality: QUALITY_PREFERENCE[vs.id] ?? 0,
          protocol: "https",
          http_headers: BILIBILI_HEADERS,
        });
      }

      if (bestAudio) {
        const audioUrl = bestAudio.baseUrl || bestAudio.base_url;
        const mime = bestAudio.mimeType || bestAudio.mime_type;
        const ext = mime.includes("mp4") ? "m4a" : "ogg";
        formats.push({
          format_id: "dash-audio-best",
          url: audioUrl,
          ext,
          vcodec: "none",
          acodec: bestAudio.codecs,
          abr: Math.round(bestAudio.bandwidth / 1000),
          format_note: "audio",
          quality: 0,
          protocol: "https",
          http_headers: BILIBILI_HEADERS,
        });
      }
    } else if (playData.data.durl) {
      for (const [i, seg] of playData.data.durl.entries()) {
        formats.push({
          format_id: `flv-${i}`,
          url: seg.url,
          ext: "flv",
          filesize: seg.size,
          quality: QUALITY_PREFERENCE[playData.data.quality] ?? 0,
          format_note: QUALITY_MAP[playData.data.quality] ?? `qn${playData.data.quality}`,
          http_headers: BILIBILI_HEADERS,
        });
      }
    }

    const uploadDate = new Date(video.pubdate * 1000).toISOString().slice(0, 10).replace(/-/g, "");
    const thumbnails: Thumbnail[] = [{ url: video.pic }];

    return {
      id: video.bvid,
      title: video.title,
      description: video.desc,
      uploader: video.owner.name,
      uploader_id: String(video.owner.mid),
      uploader_url: `https://space.bilibili.com/${video.owner.mid}`,
      duration: video.duration,
      view_count: video.stat.view,
      like_count: video.stat.like,
      upload_date: uploadDate,
      timestamp: video.pubdate,
      thumbnails,
      formats,
      webpage_url: url,
      _type: "video",
    };
  }
}
