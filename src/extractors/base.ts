import { BaseExtractor } from "../core/types";
import { GenericExtractor } from "./generic";
import { YouTubeExtractor } from "./youtube/index";
import { TwitterExtractor } from "./twitter/index";
import { TwitterSpacesExtractor } from "./twitter/spaces";
import { TikTokExtractor } from "./tiktok/index";
import { TikTokUserExtractor } from "./tiktok/user";
import { InstagramExtractor } from "./instagram/index";
import { InstagramReelsExtractor } from "./instagram/reels";
import { RedditExtractor } from "./reddit/index";
import { RedditGalleryExtractor } from "./reddit/gallery";
import { TwitchVODExtractor } from "./twitch/index";
import { TwitchClipExtractor } from "./twitch/clips";
import { TwitchLiveExtractor } from "./twitch/live";
import { VimeoExtractor } from "./vimeo/index";
import { SoundCloudExtractor } from "./soundcloud/index";
import { SoundCloudPlaylistExtractor } from "./soundcloud/playlist";
import { BilibiliExtractor } from "./bilibili/index";
import { BilibiliBangumiExtractor } from "./bilibili/bangumi";
import { KickExtractor } from "./kick/index";
import { KickClipsExtractor } from "./kick/clips";
import { KickLiveExtractor } from "./kick/live";
import { NiconicoExtractor } from "./niconico/index";
import { DailymotionExtractor } from "./dailymotion";
import { RumbleExtractor } from "./rumble";
import { BandcampExtractor } from "./bandcamp";
import { SpotifyExtractor } from "./spotify";
import { PeerTubeExtractor } from "./peertube";
import { OdyseeExtractor } from "./odysee";
import { StreamableExtractor } from "./streamable";
import { ImgurExtractor } from "./imgur";
import { CoubExtractor } from "./coub";
import { TEDExtractor } from "./ted";
import { ArchiveOrgExtractor } from "./archive-org";
import { DropboxExtractor } from "./dropbox";
import { GoogleDriveExtractor } from "./google-drive";

export { BaseExtractor };

const extractors: BaseExtractor[] = [
  new YouTubeExtractor(),
  new TwitterExtractor(),
  new TwitterSpacesExtractor(),
  new TikTokExtractor(),
  new TikTokUserExtractor(),
  new InstagramExtractor(),
  new InstagramReelsExtractor(),
  new RedditExtractor(),
  new RedditGalleryExtractor(),
  new TwitchVODExtractor(),
  new TwitchClipExtractor(),
  new TwitchLiveExtractor(),
  new VimeoExtractor(),
  new SoundCloudExtractor(),
  new SoundCloudPlaylistExtractor(),
  new BilibiliExtractor(),
  new BilibiliBangumiExtractor(),
  new KickExtractor(),
  new KickClipsExtractor(),
  new KickLiveExtractor(),
  new NiconicoExtractor(),
  new DailymotionExtractor(),
  new RumbleExtractor(),
  new BandcampExtractor(),
  new SpotifyExtractor(),
  new PeerTubeExtractor(),
  new OdyseeExtractor(),
  new StreamableExtractor(),
  new ImgurExtractor(),
  new CoubExtractor(),
  new TEDExtractor(),
  new ArchiveOrgExtractor(),
  new DropboxExtractor(),
  new GoogleDriveExtractor(),
];
const genericExtractor = new GenericExtractor();

export function registerExtractor(extractor: BaseExtractor): void {
  extractors.push(extractor);
}

export function findExtractor(url: string): BaseExtractor | null {
  for (const extractor of extractors) {
    if (extractor.canHandle(url)) {
      return extractor;
    }
  }

  if (genericExtractor.canHandle(url)) {
    return genericExtractor;
  }

  return null;
}

export function getExtractors(): readonly BaseExtractor[] {
  return extractors;
}
