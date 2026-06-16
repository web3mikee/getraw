import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict } from "../../core/types";

interface SoundCloudUser {
  id: number;
  username: string;
  permalink_url?: string;
}

interface SoundCloudTrackRef {
  id: number;
  title?: string;
  permalink_url?: string;
}

interface SoundCloudPlaylist {
  id: number;
  title: string;
  description?: string;
  duration?: number;
  track_count?: number;
  likes_count?: number;
  created_at?: string;
  permalink_url?: string;
  user?: SoundCloudUser;
  artwork_url?: string;
  tracks?: SoundCloudTrackRef[];
  is_album?: boolean;
}

interface SoundCloudTracksResponse {
  collection: SoundCloudTrackRef[];
  next_href?: string;
}

const CLIENT_ID_PATTERN = /,client_id:"([a-zA-Z0-9_-]{32,})"/;

async function extractClientId(pageUrl: string): Promise<string> {
  const pageResponse = await fetch(pageUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!pageResponse.ok) {
    throw new ExtractorError(`SoundCloud page fetch failed: ${pageResponse.status}`);
  }
  const html = await pageResponse.text();
  const scriptMatches = html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g);
  const scriptUrls: string[] = [];
  for (const match of scriptMatches) {
    scriptUrls.push(match[1]);
  }
  for (const scriptUrl of scriptUrls.slice(-3)) {
    const scriptResponse = await fetch(scriptUrl);
    if (!scriptResponse.ok) continue;
    const scriptText = await scriptResponse.text();
    const match = CLIENT_ID_PATTERN.exec(scriptText);
    if (match) return match[1];
  }
  throw new ExtractorError("Could not extract SoundCloud client_id from JS bundle");
}

async function fetchAllTracks(
  playlistId: number,
  clientId: string,
): Promise<SoundCloudTrackRef[]> {
  const allTracks: SoundCloudTrackRef[] = [];
  let nextHref: string | null =
    `https://api-v2.soundcloud.com/playlists/${playlistId}/tracks?client_id=${clientId}&limit=50`;

  while (nextHref) {
    const response = await fetch(nextHref, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) break;
    const data = (await response.json()) as SoundCloudTracksResponse;
    allTracks.push(...(data.collection ?? []));
    nextHref = data.next_href
      ? `${data.next_href}&client_id=${clientId}`
      : null;
  }

  return allTracks;
}

export class SoundCloudPlaylistExtractor extends BaseExtractor {
  readonly _VALID_URL =
    /^https?:\/\/(?:(?:www|m)\.)?soundcloud\.com\/([^/]+)\/sets\/([^/?#]+)/;
  readonly _NAME = "soundcloud:playlist";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const clientId = await extractClientId(url);

    const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${clientId}`;
    const resolveResponse = await fetch(resolveUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!resolveResponse.ok) {
      throw new ExtractorError(`SoundCloud resolve failed: ${resolveResponse.status}`);
    }

    const playlist = (await resolveResponse.json()) as SoundCloudPlaylist;
    if (!playlist.id) throw new ExtractorError("Could not resolve SoundCloud playlist");

    const tracks = await fetchAllTracks(playlist.id, clientId);

    const entries: InfoDict[] = tracks.map((track, idx) => ({
      id: String(track.id),
      title: track.title ?? `Track ${idx + 1}`,
      webpage_url: track.permalink_url ?? url,
      url: track.permalink_url ?? url,
      _type: "url" as const,
      playlist_index: idx + 1,
    }));

    return {
      id: String(playlist.id),
      title: playlist.title,
      description: playlist.description,
      uploader: playlist.user?.username,
      uploader_id: playlist.user ? String(playlist.user.id) : undefined,
      uploader_url: playlist.user?.permalink_url,
      like_count: playlist.likes_count,
      upload_date: playlist.created_at?.replace(/-/g, "").slice(0, 8),
      webpage_url: playlist.permalink_url ?? url,
      _type: "playlist",
      entries,
      playlist_count: tracks.length,
    };
  }
}
