import type { InfoDict } from "../../core/types";
import { InnerTubeClient } from "./innertube";

interface PlaylistVideoRenderer {
  videoId: string;
  title: { runs?: Array<{ text: string }>; simpleText?: string };
  lengthSeconds?: string;
  thumbnail?: { thumbnails: Array<{ url: string; width: number; height: number }> };
  shortBylineText?: { runs?: Array<{ text: string }> };
  index?: { simpleText?: string };
}

interface ContinuationItem {
  continuationEndpoint?: {
    continuationCommand?: { token: string };
  };
}

export class PlaylistExtractor {
  private client: InnerTubeClient;

  constructor() {
    this.client = new InnerTubeClient("WEB");
  }

  async extractPlaylist(playlistId: string): Promise<InfoDict> {
    const browseId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
    const response = await this.client.browse(browseId);

    const alerts = response.alerts;
    if (alerts?.length) {
      const alert = alerts[0]?.alertRenderer;
      if (alert?.type === "ERROR") {
        throw new Error(`Playlist error: ${alert.text?.simpleText ?? "Unknown error"}`);
      }
    }

    const entries: InfoDict[] = [];
    let title = "Playlist";
    let channelName: string | undefined;
    let playlistCount: number | undefined;

    const metadata = response.metadata as Record<string, unknown> | undefined;
    if (metadata) {
      const renderer = metadata.playlistMetadataRenderer as Record<string, string> | undefined;
      if (renderer?.title) {
        title = renderer.title;
      }
    }

    const header = response.header as Record<string, unknown> | undefined;
    if (header) {
      const headerRenderer = header.playlistHeaderRenderer as Record<string, unknown> | undefined;
      if (headerRenderer) {
        const numVideos = headerRenderer.numVideosText as { runs?: Array<{ text: string }> } | undefined;
        if (numVideos?.runs?.[0]) {
          const countStr = numVideos.runs[0].text.replace(/[^0-9]/g, "");
          playlistCount = parseInt(countStr, 10) || undefined;
        }
        const owner = headerRenderer.ownerText as { runs?: Array<{ text: string }> } | undefined;
        channelName = owner?.runs?.[0]?.text;
      }
    }

    const contents = response.contents as Record<string, unknown> | undefined;
    const videoItems = this.extractVideoItems(contents);

    for (const item of videoItems) {
      const entry = this.parsePlaylistVideo(item);
      if (entry) entries.push(entry);
    }

    let continuation = this.findContinuation(contents);
    while (continuation) {
      const contResponse = await this.client.browse("", undefined, continuation);
      const actions = contResponse.onResponseReceivedActions as Array<Record<string, unknown>> | undefined;
      if (actions) {
        for (const action of actions) {
          const appendItems = action.appendContinuationItemsAction as Record<string, unknown> | undefined;
          const items = appendItems?.continuationItems as Array<Record<string, unknown>> | undefined;
          if (items) {
            for (const item of items) {
              const renderer = item.playlistVideoRenderer as PlaylistVideoRenderer | undefined;
              if (renderer) {
                const entry = this.parsePlaylistVideo(renderer);
                if (entry) entries.push(entry);
              }
            }
            continuation = this.findContinuationInItems(items);
          }
        }
      } else {
        continuation = undefined;
      }
    }

    return {
      id: playlistId,
      title,
      _type: "playlist",
      entries,
      uploader: channelName,
      playlist_count: playlistCount ?? entries.length,
      webpage_url: `https://www.youtube.com/playlist?list=${playlistId}`,
    };
  }

  async extractChannelVideos(channelId: string): Promise<InfoDict> {
    const browseId = channelId.startsWith("UC") ? channelId : `UC${channelId}`;
    const params = "EgZ2aWRlb3PyBgQKAjoA";

    const response = await this.client.browse(browseId, params);

    const entries: InfoDict[] = [];
    let title = "Channel";

    const metadata = response.metadata as Record<string, unknown> | undefined;
    if (metadata) {
      const renderer = metadata.channelMetadataRenderer as Record<string, string> | undefined;
      if (renderer?.title) {
        title = renderer.title;
      }
    }

    const contents = response.contents as Record<string, unknown> | undefined;
    const videoItems = this.extractChannelVideoItems(contents);

    for (const item of videoItems) {
      entries.push({
        id: item.videoId,
        title: item.title?.runs?.[0]?.text ?? item.title?.simpleText ?? "Unknown",
        _type: "url",
        url: `https://www.youtube.com/watch?v=${item.videoId}`,
        webpage_url: `https://www.youtube.com/watch?v=${item.videoId}`,
      });
    }

    return {
      id: channelId,
      title: `${title} - Videos`,
      _type: "playlist",
      entries,
      channel: title,
      channel_id: channelId,
      channel_url: `https://www.youtube.com/channel/${channelId}`,
      webpage_url: `https://www.youtube.com/channel/${channelId}/videos`,
    };
  }

  private extractVideoItems(contents: Record<string, unknown> | undefined): PlaylistVideoRenderer[] {
    if (!contents) return [];

    const items: PlaylistVideoRenderer[] = [];
    const json = JSON.stringify(contents);

    const regex = /"playlistVideoRenderer"\s*:\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(json)) !== null) {
      try {
        const parsed = JSON.parse(match[1]) as PlaylistVideoRenderer;
        if (parsed.videoId) {
          items.push(parsed);
        }
      } catch {
        continue;
      }
    }

    return items;
  }

  private extractChannelVideoItems(contents: Record<string, unknown> | undefined): PlaylistVideoRenderer[] {
    if (!contents) return [];

    const items: PlaylistVideoRenderer[] = [];
    const json = JSON.stringify(contents);

    const regex = /"gridVideoRenderer"\s*:\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(json)) !== null) {
      try {
        const parsed = JSON.parse(match[1]) as PlaylistVideoRenderer;
        if (parsed.videoId) {
          items.push(parsed);
        }
      } catch {
        continue;
      }
    }

    return items;
  }

  private parsePlaylistVideo(renderer: PlaylistVideoRenderer): InfoDict | null {
    if (!renderer.videoId) return null;

    const title =
      renderer.title?.runs?.[0]?.text ?? renderer.title?.simpleText ?? "Unknown";

    return {
      id: renderer.videoId,
      title,
      _type: "url",
      url: `https://www.youtube.com/watch?v=${renderer.videoId}`,
      webpage_url: `https://www.youtube.com/watch?v=${renderer.videoId}`,
      duration: renderer.lengthSeconds ? parseInt(renderer.lengthSeconds, 10) : undefined,
      uploader: renderer.shortBylineText?.runs?.[0]?.text,
    };
  }

  private findContinuation(contents: Record<string, unknown> | undefined): string | undefined {
    if (!contents) return undefined;
    const json = JSON.stringify(contents);
    const match = json.match(/"continuationCommand"\s*:\s*\{\s*"token"\s*:\s*"([^"]+)"/);
    return match?.[1];
  }

  private findContinuationInItems(items: Array<Record<string, unknown>>): string | undefined {
    for (const item of items) {
      const cont = item.continuationItemRenderer as ContinuationItem | undefined;
      if (cont?.continuationEndpoint?.continuationCommand?.token) {
        return cont.continuationEndpoint.continuationCommand.token;
      }
    }
    return undefined;
  }
}
