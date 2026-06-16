import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict, Thumbnail } from "../core/types";

export class SpotifyExtractor extends BaseExtractor {
  readonly _VALID_URL = /https?:\/\/open\.spotify\.com\/episode\/([a-zA-Z0-9]+)/;
  readonly _NAME = "spotify";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = url.match(this._VALID_URL);
    if (!match) throw new ExtractorError(`Invalid Spotify episode URL: ${url}`);
    const episodeId = match[1];

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new ExtractorError(`Spotify fetch error: ${response.status}`);
    }

    const html = await response.text();

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    let audioPreviewUrl: string | undefined;
    let title = "Spotify Podcast Episode";
    let description: string | undefined;
    let duration: number | undefined;
    let uploader: string | undefined;
    let thumbnails: Thumbnail[] = [];

    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]) as Record<string, unknown>;
        const props = (nextData.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined;
        const episode = props?.episode as Record<string, unknown> | undefined;

        if (episode) {
          title = (episode.name as string) ?? title;
          description = episode.description as string | undefined;
          duration = typeof episode.duration_ms === "number"
            ? Math.round(episode.duration_ms / 1000)
            : undefined;
          audioPreviewUrl = episode.audio_preview_url as string | undefined;

          const show = episode.show as Record<string, unknown> | undefined;
          uploader = show?.name as string | undefined;

          const images = episode.images as Array<{ url: string; width?: number; height?: number }> | undefined;
          if (images) {
            thumbnails = images.map((img) => ({
              url: img.url,
              width: img.width,
              height: img.height,
            }));
          }
        }
      } catch {
      }
    }

    if (!audioPreviewUrl) {
      const previewMatch = html.match(/"audio_preview_url"\s*:\s*"([^"]+)"/);
      if (previewMatch) audioPreviewUrl = previewMatch[1];
    }

    if (!audioPreviewUrl) {
      throw new ExtractorError(
        "Spotify: no audio preview URL found. Note: full podcast audio requires Spotify auth. Only 30-second previews are available without DRM.",
      );
    }

    return {
      id: episodeId,
      title,
      description,
      duration,
      uploader,
      thumbnails,
      url: audioPreviewUrl,
      ext: "mp3",
      formats: [
        {
          format_id: "preview-mp3",
          url: audioPreviewUrl,
          ext: "mp3",
          acodec: "mp3",
          format_note: "30-second preview only (full episode requires Spotify auth)",
        },
      ],
      webpage_url: url,
      extractor: this._NAME,
    };
  }
}
