import { Downloader, DownloadError } from "../core/types";
import type { DownloadOptions } from "../core/types";
import { FragmentDownloader } from "./fragment";
import type { Segment } from "./fragment";
import { logger } from "../core/logger";

interface DashRepresentation {
  id: string;
  bandwidth?: number;
  width?: number;
  height?: number;
  codecs?: string;
  mimeType?: string;
  segments?: DashSegmentInfo;
  initialization?: string;
  segmentList?: DashSegmentList;
  segmentTemplate?: DashSegmentTemplate;
}

interface DashAdaptationSet {
  id?: string;
  contentType?: string;
  mimeType?: string;
  representations: DashRepresentation[];
  segments?: DashSegmentInfo;
  segmentTemplate?: DashSegmentTemplate;
}

interface DashPeriod {
  id?: string;
  adaptationSets: DashAdaptationSet[];
}

interface DashMpd {
  periods: DashPeriod[];
}

interface DashSegmentInfo {
  list: Array<{ uri: string; timeline: Array<{ start: number; end: number; uri: string }> }>;
  timeline: Array<{ start: number; end: number; uri: string }>;
  initialization?: { sourceURL?: string };
}

interface DashSegmentList {
  initialization?: { sourceURL?: string };
  segmentURLs: Array<{ media?: string }>;
}

interface DashSegmentTemplate {
  initialization?: string;
  media?: string;
  timescale?: number;
  duration?: number;
  startNumber?: number;
  segmentTimeline?: Array<{ t?: number; d: number; r?: number }>;
}

export class DashDownloader extends Downloader {
  readonly protocol = "dash";

  canHandle(protocol: string): boolean {
    return protocol === "dash" || protocol === "mpd";
  }

  async download(
    url: string,
    filepath: string,
    options: DownloadOptions,
  ): Promise<void> {
    const retries = options.retries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.downloadDash(url, filepath, options);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < retries) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          logger.warn(`DASH download failed (attempt ${attempt}/${retries}): ${lastError.message}`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw new DownloadError(`DASH download failed after ${retries} attempts: ${lastError?.message}`);
  }

  private async fetchMpd(url: string, headers: Record<string, string>): Promise<string> {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new DownloadError(`Failed to fetch MPD: HTTP ${resp.status}`);
    }
    return resp.text();
  }

  private async downloadDash(url: string, filepath: string, options: DownloadOptions): Promise<void> {
    const { parse } = await import("mpd-parser");
    const headers = { ...options.headers };

    const mpdText = await this.fetchMpd(url, headers);
    const parsed = parse(mpdText, { manifestUri: url }) as DashMpd;

    if (!parsed.periods || parsed.periods.length === 0) {
      throw new DownloadError("MPD has no periods");
    }

    const allSegments: Segment[] = [];
    let globalIdx = 0;

    for (const period of parsed.periods) {
      const periodSegments = this.extractPeriodSegments(period, url, globalIdx);
      globalIdx += periodSegments.length;
      allSegments.push(...periodSegments);
    }

    if (allSegments.length === 0) {
      throw new DownloadError("No segments found in MPD");
    }

    const tempDir = `/tmp/getraw-dash-${Date.now()}`;
    const fragmenter = new FragmentDownloader();
    await fragmenter.downloadSegments(allSegments, filepath, {
      ...options,
      concurrency: 8,
      tempDir,
    });
  }

  private extractPeriodSegments(period: DashPeriod, baseUrl: string, startIdx: number): Segment[] {
    const { videoSet, audioSet } = this.selectAdaptationSets(period.adaptationSets);

    const segments: Segment[] = [];
    let idx = startIdx;

    if (videoSet) {
      const best = this.selectBestRepresentation(videoSet.representations);
      if (best) {
        const segs = this.buildSegments(best, videoSet, baseUrl, idx);
        idx += segs.length;
        segments.push(...segs);
        logger.debug(`DASH: selected video representation ${best.id} (${best.bandwidth ?? "?"} bps)`);
      }
    }

    if (audioSet) {
      const best = this.selectBestRepresentation(audioSet.representations);
      if (best) {
        const segs = this.buildSegments(best, audioSet, baseUrl, idx);
        segments.push(...segs);
        logger.debug(`DASH: selected audio representation ${best.id} (${best.bandwidth ?? "?"} bps)`);
      }
    }

    return segments;
  }

  private selectAdaptationSets(sets: DashAdaptationSet[]): {
    videoSet: DashAdaptationSet | null;
    audioSet: DashAdaptationSet | null;
  } {
    let videoSet: DashAdaptationSet | null = null;
    let audioSet: DashAdaptationSet | null = null;

    for (const set of sets) {
      const mime = set.mimeType ?? set.contentType ?? "";
      if (mime.startsWith("video") && !videoSet) {
        videoSet = set;
      } else if (mime.startsWith("audio") && !audioSet) {
        audioSet = set;
      }
    }

    if (!videoSet && sets.length > 0) {
      videoSet = sets[0];
    }

    return { videoSet, audioSet };
  }

  private selectBestRepresentation(reps: DashRepresentation[]): DashRepresentation | null {
    if (!reps || reps.length === 0) return null;
    return reps.reduce((a, b) => (b.bandwidth ?? 0) > (a.bandwidth ?? 0) ? b : a);
  }

  private buildSegments(
    rep: DashRepresentation,
    set: DashAdaptationSet,
    baseUrl: string,
    startIdx: number,
  ): Segment[] {
    const segments: Segment[] = [];
    let idx = startIdx;

    const template = rep.segmentTemplate ?? set.segmentTemplate;
    if (template) {
      return this.buildFromTemplate(template, rep, baseUrl, startIdx);
    }

    const segList = rep.segmentList;
    if (segList) {
      if (segList.initialization?.sourceURL) {
        segments.push({
          url: resolveUrl(baseUrl, segList.initialization.sourceURL),
          index: idx++,
          isInit: true,
        });
      }
      for (const s of segList.segmentURLs) {
        if (s.media) {
          segments.push({ url: resolveUrl(baseUrl, s.media), index: idx++ });
        }
      }
      return segments;
    }

    const info = rep.segments ?? set.segments;
    if (info) {
      if (info.initialization?.sourceURL) {
        segments.push({
          url: resolveUrl(baseUrl, info.initialization.sourceURL),
          index: idx++,
          isInit: true,
        });
      }
      for (const entry of info.timeline ?? []) {
        if (entry.uri) {
          segments.push({ url: resolveUrl(baseUrl, entry.uri), index: idx++ });
        }
      }
    }

    return segments;
  }

  private buildFromTemplate(
    template: DashSegmentTemplate,
    rep: DashRepresentation,
    baseUrl: string,
    startIdx: number,
  ): Segment[] {
    const segments: Segment[] = [];
    let idx = startIdx;

    if (template.initialization) {
      const initUrl = interpolateTemplate(template.initialization, rep.id, 0, 0);
      segments.push({ url: resolveUrl(baseUrl, initUrl), index: idx++, isInit: true });
    }

    const mediaTemplate = template.media;
    if (!mediaTemplate) return segments;

    if (template.segmentTimeline && template.segmentTimeline.length > 0) {
      const timescale = template.timescale ?? 1;
      let t = 0;
      let segNum = template.startNumber ?? 1;

      for (const entry of template.segmentTimeline) {
        if (entry.t !== undefined) t = entry.t;
        const repeat = (entry.r ?? 0) + 1;
        for (let r = 0; r < repeat; r++) {
          const segUrl = interpolateTemplate(mediaTemplate, rep.id, segNum, t);
          segments.push({ url: resolveUrl(baseUrl, segUrl), index: idx++ });
          t += entry.d;
          segNum++;
        }
      }
    } else if (template.duration && template.timescale) {
      logger.warn("DASH: duration-based SegmentTemplate without SegmentTimeline — segment count unknown, skipping");
    }

    return segments;
  }
}

function interpolateTemplate(template: string, repId: string, number: number, time: number): string {
  return template
    .replace("$RepresentationID$", repId)
    .replace(/\$Number(%0\d+d)?\$/g, (_, fmt) => fmt ? number.toString().padStart(parseInt(fmt.slice(2)), "0") : String(number))
    .replace(/\$Time(%0\d+d)?\$/g, (_, fmt) => fmt ? time.toString().padStart(parseInt(fmt.slice(2)), "0") : String(time));
}

function resolveUrl(base: string, relative: string): string {
  if (/^https?:\/\//i.test(relative)) return relative;
  return new URL(relative, base).toString();
}
