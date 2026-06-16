import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict, Format, Thumbnail } from "../core/types";

interface BandcampTrackFile {
  "mp3-128"?: string;
  "mp3-v0"?: string;
  "mp3-320"?: string;
  [key: string]: string | undefined;
}

interface BandcampTrack {
  id?: number;
  title?: string;
  duration?: number;
  file?: BandcampTrackFile;
  has_audio?: boolean;
  track_num?: number;
  artist?: string;
}

interface BandcampTralbum {
  current?: {
    id?: number;
    title?: string;
    about?: string;
    release_date?: string;
    art_id?: number;
    type?: string;
  };
  artist?: string;
  url?: string;
  art_id?: number;
  trackinfo?: BandcampTrack[];
  packages?: unknown[];
}

export class BandcampExtractor extends BaseExtractor {
  readonly _VALID_URL = /https?:\/\/(?:[^.]+\.bandcamp\.com\/(?:track|album)\/[^/?#]+|(?:www\.)?bandcamp\.com\/EmbeddedPlayer\/[^/?#]+)/;
  readonly _NAME = "bandcamp";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      throw new ExtractorError(`Bandcamp fetch error: ${response.status}`);
    }

    const html = await response.text();

    const tralbumMatch = html.match(/data-tralbum=["']([^"']+)["']/);
    if (!tralbumMatch) {
      throw new ExtractorError("Bandcamp: could not find data-tralbum attribute");
    }

    let tralbum: BandcampTralbum;
    try {
      tralbum = JSON.parse(tralbumMatch[1].replace(/&quot;/g, '"')) as BandcampTralbum;
    } catch {
      throw new ExtractorError("Bandcamp: failed to parse data-tralbum JSON");
    }

    const tracks = tralbum.trackinfo ?? [];
    const isAlbum = url.includes("/album/") || (tralbum.current?.type === "album");
    const artist = tralbum.artist ?? "Unknown Artist";
    const artId = tralbum.art_id ?? tralbum.current?.art_id;
    const thumbnailUrl = artId
      ? `https://f4.bcbits.com/img/a${artId}_10.jpg`
      : undefined;
    const thumbnails: Thumbnail[] = thumbnailUrl ? [{ url: thumbnailUrl }] : [];

    const buildTrackInfo = (track: BandcampTrack, index: number): InfoDict => {
      const trackId = String(track.id ?? index);
      const formats: Format[] = [];

      if (track.file) {
        const qualityOrder = ["mp3-320", "mp3-v0", "mp3-128"];
        for (const quality of qualityOrder) {
          const fileUrl = track.file[quality];
          if (fileUrl) {
            formats.push({
              format_id: quality,
              url: fileUrl,
              ext: "mp3",
              acodec: "mp3",
              abr: quality === "mp3-320" ? 320 : quality === "mp3-128" ? 128 : undefined,
              quality: quality === "mp3-320" ? 3 : quality === "mp3-v0" ? 2 : 1,
            });
          }
        }
      }

      return {
        id: trackId,
        title: track.title ?? `Track ${index + 1}`,
        uploader: track.artist ?? artist,
        duration: track.duration,
        thumbnails,
        formats,
        playlist_index: track.track_num ?? index + 1,
        webpage_url: url,
        extractor: this._NAME,
      };
    };

    if (!isAlbum || tracks.length === 1) {
      const track = tracks[0];
      if (!track) throw new ExtractorError("Bandcamp: no tracks found");
      return buildTrackInfo(track, 0);
    }

    const albumTitle = tralbum.current?.title ?? "Album";
    const entries = tracks
      .filter((t) => t.has_audio !== false)
      .map((t, i) => buildTrackInfo(t, i));

    return {
      id: String(tralbum.current?.id ?? "album"),
      title: albumTitle,
      uploader: artist,
      thumbnails,
      entries,
      _type: "playlist",
      playlist_count: entries.length,
      webpage_url: url,
      extractor: this._NAME,
    };
  }
}
