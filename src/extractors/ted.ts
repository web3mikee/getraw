import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict, Format, Thumbnail, Subtitle } from "../core/types";

interface TEDVideoResource {
  bitrate?: number;
  file?: string;
  quality?: string;
  height?: number;
  width?: number;
}

interface TEDPlayerData {
  resources?: {
    h264?: TEDVideoResource[];
    hls?: { stream?: string };
  };
  duration?: number;
  thumb?: string;
}

interface TEDTalkData {
  id?: number;
  slug?: string;
  title?: string;
  description?: string;
  duration?: number;
  viewedCount?: number;
  publishedAt?: string;
  speakers?: Array<{ firstname?: string; lastname?: string }>;
  playerData?: TEDPlayerData | string;
  subtitledDownloads?: Record<string, { high?: string; low?: string; name?: string }>;
  image?: { url?: string };
  canonicalUrl?: string;
}

interface TEDNextData {
  props?: {
    pageProps?: {
      talkData?: TEDTalkData;
      videoData?: TEDTalkData;
    };
  };
}

export class TEDExtractor extends BaseExtractor {
  readonly _VALID_URL = /https?:\/\/(?:www\.)?ted\.com\/talks\/([a-zA-Z0-9_]+)/;
  readonly _NAME = "ted";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = url.match(this._VALID_URL);
    if (!match) throw new ExtractorError(`Invalid TED URL: ${url}`);
    const talkSlug = match[1];

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      throw new ExtractorError(`TED fetch error: ${response.status}`);
    }

    const html = await response.text();

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!nextDataMatch) {
      throw new ExtractorError("TED: could not find __NEXT_DATA__");
    }

    let nextData: TEDNextData;
    try {
      nextData = JSON.parse(nextDataMatch[1]) as TEDNextData;
    } catch {
      throw new ExtractorError("TED: failed to parse __NEXT_DATA__");
    }

    const talkData = nextData.props?.pageProps?.talkData ?? nextData.props?.pageProps?.videoData;
    if (!talkData) throw new ExtractorError("TED: no talk data found");

    let playerData: TEDPlayerData | undefined;
    if (typeof talkData.playerData === "string") {
      try {
        playerData = JSON.parse(talkData.playerData) as TEDPlayerData;
      } catch {
      }
    } else if (talkData.playerData && typeof talkData.playerData === "object") {
      playerData = talkData.playerData;
    }

    const formats: Format[] = [];

    const h264Resources = playerData?.resources?.h264 ?? [];
    for (const resource of h264Resources) {
      if (!resource.file) continue;
      formats.push({
        format_id: `mp4-${resource.bitrate ?? resource.quality ?? "unknown"}`,
        url: resource.file,
        ext: "mp4",
        vcodec: "h264",
        tbr: resource.bitrate,
        height: resource.height,
        width: resource.width,
        quality: resource.height ?? resource.bitrate ?? 0,
        resolution: resource.height ? `${resource.height}p` : undefined,
      });
    }

    const hlsStream = playerData?.resources?.hls?.stream;
    if (hlsStream) {
      formats.push({
        format_id: "hls",
        url: hlsStream,
        ext: "mp4",
        protocol: "m3u8",
        quality: -1,
      });
    }

    const subtitles: Record<string, Subtitle[]> = {};
    const subtitledDownloads = talkData.subtitledDownloads ?? {};
    for (const [lang, subtitleData] of Object.entries(subtitledDownloads)) {
      const subUrl = subtitleData.high ?? subtitleData.low;
      if (subUrl) {
        subtitles[lang] = [{ url: subUrl, ext: "srt", name: subtitleData.name }];
      }
    }

    const thumbnails: Thumbnail[] = [];
    const thumbUrl = playerData?.thumb ?? talkData.image?.url;
    if (thumbUrl) thumbnails.push({ url: thumbUrl });

    const speakerNames = (talkData.speakers ?? [])
      .map((s) => [s.firstname, s.lastname].filter(Boolean).join(" "))
      .filter(Boolean);

    return {
      id: String(talkData.id ?? talkSlug),
      title: talkData.title ?? talkSlug,
      description: talkData.description,
      duration: talkData.duration ?? playerData?.duration,
      view_count: talkData.viewedCount,
      uploader: speakerNames[0],
      upload_date: talkData.publishedAt?.slice(0, 10).replace(/-/g, ""),
      thumbnails,
      formats,
      subtitles,
      tags: [],
      webpage_url: url,
      extractor: this._NAME,
    };
  }
}
