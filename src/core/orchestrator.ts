import type { InfoDict, Options } from "./types";
import { DownloadError } from "./types";
import { findExtractor } from "../extractors/base";
import { getDownloader } from "../downloaders/base";
import { runPostProcessors } from "../postprocessors/base";
import { selectFormats, formatFormatTable } from "./format-sorter";
import { buildFilename } from "./output-template";
import { logger } from "./logger";

export class Orchestrator {
  async process(url: string, options: Options): Promise<void> {
    logger.info(`Processing: ${url}`);

    const extractor = findExtractor(url);
    if (!extractor) {
      throw new DownloadError(`No extractor found for URL: ${url}`);
    }

    logger.debug(`Using extractor: ${extractor._NAME}`);
    const info = await extractor.extract(url);

    if (info._type === "playlist" && info.entries) {
      logger.info(`Playlist: ${info.title} (${info.entries.length} entries)`);
      for (let i = 0; i < info.entries.length; i++) {
        const entry = info.entries[i];
        entry.playlist = info.title;
        entry.playlist_index = i + 1;
        entry.playlist_count = info.entries.length;
        if (entry.webpage_url) {
          await this.processEntry(entry.webpage_url, entry, options);
        }
      }
      return;
    }

    await this.processEntry(url, info, options);
  }

  private async processEntry(
    url: string,
    info: InfoDict,
    options: Options,
  ): Promise<void> {
    if (options.dumpJson) {
      process.stdout.write(JSON.stringify(info, null, 2) + "\n");
      return;
    }

    if (options.listFormats) {
      if (info.formats && info.formats.length > 0) {
        process.stdout.write(formatFormatTable(info.formats) + "\n");
      } else {
        logger.warn("No formats available");
      }
      return;
    }

    if (!info.formats || info.formats.length === 0) {
      if (info.url) {
        info.formats = [
          {
            format_id: "direct",
            url: info.url,
            ext: info.ext ?? "mp4",
          },
        ];
      } else {
        throw new DownloadError("No formats found and no direct URL available");
      }
    }

    const selectedFormats = selectFormats(info.formats, options.format);
    if (selectedFormats.length === 0) {
      throw new DownloadError(
        `No matching formats for: ${options.format}`,
      );
    }

    info.requested_formats = selectedFormats;
    info.ext = selectedFormats[0].ext;

    const filename = buildFilename(options.output, info);
    const filepath = options.paths.home
      ? `${options.paths.home}/${filename}`
      : filename;
    info.filename = filepath;

    logger.info(`Downloading: ${info.title}`);
    logger.debug(`Saving to: ${filepath}`);

    for (const format of selectedFormats) {
      const protocol = detectProtocol(format.url, format.protocol);
      const downloader = getDownloader(protocol);
      if (!downloader) {
        throw new DownloadError(
          `No downloader for protocol: ${protocol}`,
        );
      }

      const targetPath =
        selectedFormats.length > 1
          ? `${filepath}.f${format.format_id}.${format.ext}`
          : filepath;

      await downloader.download(targetPath, format.url, {
        headers: { ...info.http_headers, ...format.http_headers },
        rateLimit: options.rateLimit,
        retries: options.retries,
        onProgress: options.quiet
          ? undefined
          : (progress) => {
              logger.progress(
                progress.percent,
                progress.speed,
                progress.eta,
                filename,
              );
            },
      });
    }

    logger.clearProgress();

    if (selectedFormats.length > 1) {
      logger.info("Merging formats requires ffmpeg (post-processor)");
    }

    await runPostProcessors(info, filepath, options);

    logger.info(`Done: ${filepath}`);
  }
}

function detectProtocol(url: string, hint?: string): string {
  if (hint) return hint;
  if (url.includes(".m3u8")) return "m3u8";
  if (url.includes(".mpd")) return "dash";
  if (url.startsWith("rtmp")) return "rtmp";
  return "https";
}
