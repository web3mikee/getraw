# Supported Sites

All extractors implement `BaseExtractor` from `src/core/types.ts`. The `_VALID_URL` regex for each is listed below — dlpx tests URLs against these in registration order, falling back to the `generic` extractor for any `http(s)://` URL.

| # | Extractor name | Site | URL pattern | Formats | Notes |
|---|---------------|------|-------------|---------|-------|
| 1 | `youtube` | YouTube | `(www\|m\|music).youtube.com/watch?v=`, `youtu.be/<id>`, `youtube.com/shorts/<id>`, `youtube.com/live/<id>`, `youtube.com/embed/<id>`, `youtube.com/v/<id>`, `youtube.com/playlist?list=`, `youtube.com/channel/<id>`, `youtube.com/@<handle>` | DASH (MP4 video + M4A audio), HLS | Subtitles (manual) and auto-generated captions extracted. Age-gated videos attempt TV client bypass. Signature and n-sig deciphering implemented. Playlist and channel enumeration supported. |
| 2 | `vimeo` | Vimeo | `(www\|player).vimeo.com/<id>`, `vimeo.com/channels/<c>/<id>`, `vimeo.com/groups/<g>/videos/<id>` | HLS, DASH, Progressive MP4 | All CDN variants exposed as separate formats. |
| 3 | `twitter` | Twitter / X | `(www.)twitter.com/<user>/status/<id>`, `(www.)x.com/<user>/status/<id>` | MP4 (multiple bitrates), HLS | Uses the public syndication API — no auth required. |
| 4 | `twitter:spaces` | Twitter Spaces | `(www.)twitter.com/i/spaces/<id>`, `(www.)x.com/i/spaces/<id>` | HLS (M3U8) | Uses a guest token obtained from the public API. Spaces must be public. |
| 5 | `tiktok` | TikTok video | `(www.)tiktok.com/@<user>/video/<id>`, `vm.tiktok.com/<id>` | MP4 (playAddr / downloadAddr) | Parses hydration JSON embedded in the page HTML. |
| 6 | `tiktok:user` | TikTok user feed | `(www.)tiktok.com/@<username>` | Playlist (entries) | Returns a playlist of video URLs from the user's public profile page. |
| 7 | `instagram` | Instagram post / reel | `(www.)instagram.com/p/<id>`, `instagram.com/reel/<id>`, `instagram.com/reels/<id>` | MP4 | Parses `__additionalDataLoaded` and `window.__additionalData` from page. Sidecar (multi-image) posts extracted as playlist. |
| 8 | `instagram:reels` | Instagram Reels feed | `(www.)instagram.com/reels/` | MP4 | Fetches via the internal GraphQL endpoint (`PolarisClipsHomePageQuery`). Returns a playlist. |
| 9 | `twitch:vod` | Twitch VOD | `(www.)twitch.tv/videos/<id>` | HLS (M3U8, multiple quality levels) | Uses Twitch GQL to get a signed playback access token. |
| 10 | `twitch:clip` | Twitch Clip | `(www.)twitch.tv/<channel>/clip/<slug>`, `clips.twitch.tv/<slug>` | MP4 (multiple quality levels) | Signed MP4 URLs fetched via GQL. |
| 11 | `twitch:live` | Twitch Live stream | `(www.)twitch.tv/<channel>` | HLS (M3U8, multiple quality levels) | Errors if channel is offline. Signed via GQL stream playback access token. |
| 12 | `kick` | Kick VOD | `(www.)kick.com/video/<id>` | HLS (M3U8) | Uses the Kick v1 public API. |
| 13 | `kick:clips` | Kick Clip | `(www.)kick.com/<channel>/clips/<id>` | MP4 | Uses the Kick v1 clips API. |
| 14 | `kick:live` | Kick Live stream | `(www.)kick.com/<channel>` | HLS (M3U8) | Errors if channel is not live. |
| 15 | `reddit` | Reddit video post | `(www.\|old.)reddit.com/r/<sub>/comments/<id>`, `v.redd.it/<id>` | DASH (video) + separate audio URL, MP4 fallback | Audio is extracted from the DASH manifest and presented as a separate format so both can be merged. |
| 16 | `reddit:gallery` | Reddit gallery post | `(www.\|old.)reddit.com/r/<sub>/comments/<id>`, `reddit.com/gallery/<id>` | Images (JPEG/PNG) and MP4 (gallery items) | Each gallery item is returned as a separate entry in a playlist. |
| 17 | `soundcloud` | SoundCloud track | `(www.\|m.)soundcloud.com/<user>/<track>` | HLS (M3U8 opus/mp3), HTTP progressive MP3 | client_id is extracted dynamically from the JS bundle. |
| 18 | `soundcloud:playlist` | SoundCloud set / playlist | `(www.\|m.)soundcloud.com/<user>/sets/<playlist>` | Playlist (entries) | Paginates via `api-v2.soundcloud.com/playlists/<id>/tracks`. |
| 19 | `bilibili` | Bilibili video | `(www.)bilibili.com/video/BV<id>`, `bilibili.com/video/av<id>` | DASH (video + audio, multiple quality levels from 360p to 8K/HDR/Dolby) | Requires login cookies for 1080p+ qualities. BV-to-AV ID conversion implemented. |
| 20 | `bilibili:bangumi` | Bilibili Bangumi (anime/series) | `(www.)bilibili.com/bangumi/play/ep<id>`, `bilibili.com/bangumi/play/ss<id>` | DASH (same quality levels as bilibili) | `ep_id` fetches a single episode; `ss_id` fetches the full season as a playlist. |
| 21 | `niconico` | Niconico | `(www.)nicovideo.jp/watch/sm<id>`, `nicovideo.jp/watch/nm<id>` | HLS (DMS session-based M3U8) | Session cookies from the watch page are forwarded to the DMS API. |
| 22 | `bandcamp` | Bandcamp track / album | `<artist>.bandcamp.com/track/<slug>`, `<artist>.bandcamp.com/album/<slug>`, `bandcamp.com/EmbeddedPlayer/*` | MP3 (stream URL from `trackinfo` JSON) | Album URLs return a playlist of tracks. |
| 23 | `dailymotion` | Dailymotion | `(www.)dailymotion.com/video/<id>` | HLS (M3U8) | Uses the Dailymotion player metadata API. |
| 24 | `streamable` | Streamable | `(www.)streamable.com/<id>` | MP4 (multiple resolutions), HLS | Parses the player JSON from `api.streamable.com/videos/<id>`. |
| 25 | `coub` | Coub | `(www.)coub.com/view/<id>`, `coub.com/embed/<id>` | MP4 (video), MP3 (audio), GIF | Video loop and audio are separate; both formats are exposed. |
| 26 | `imgur` | Imgur | `imgur.com/<id>`, `imgur.com/a/<id>` (album), `imgur.com/gallery/<id>`, `i.imgur.com/<id>.<ext>` | MP4, GIF (converted), JPEG/PNG | Direct image/video links, single items, and albums all handled. Albums return a playlist. |
| 27 | `rumble` | Rumble | `(www.)rumble.com/v<slug>.html`, `rumble.com/embed/<id>` | MP4 (multiple resolutions) | Parses the embedded player JSON. |
| 28 | `odysee` | Odysee / LBRY | `(www.)odysee.com/@<channel>:<tag>/<slug>`, `lbry.tv/@<channel>:<tag>/<slug>` | MP4, HLS (if present) | Uses the Odysee API v3 to resolve claim URLs. |
| 29 | `ted` | TED Talks | `(www.)ted.com/talks/<slug>` | MP4 (multiple qualities via `playerData.resources.h264`) | Subtitles extracted from `subtitledDownloads` (SRT). |
| 30 | `peertube` | PeerTube (any instance) | `<host>/videos/watch/<uuid>`, `<host>/w/<uuid>`, `<host>/videos/embed/<uuid>` | WebTorrent (MP4), HLS | Subtitles (VTT) extracted from the captions API. Works with any PeerTube instance. |
| 31 | `google-drive` | Google Drive | `drive.google.com/file/d/<id>`, `docs.google.com/file/d/<id>`, `drive.google.com/uc?id=<id>` | MP4 (itag-based URLs) | Public files only. Parses the Drive streaming page for itag format entries. |
| 32 | `dropbox` | Dropbox | `(www.)dropbox.com/s/<id>`, `dropbox.com/sh/<id>`, `dropbox.com/scl/fo/<id>` | Direct download URL (any type) | Rewrites the `dl=0` query parameter to `dl=1` for direct download. |
| 33 | `archive.org` | Internet Archive | `(www.)archive.org/details/<id>`, `archive.org/download/<id>` | MP4, OGV, WEBM, MP3, and any other files hosted on the item | All media files listed under the item are returned as formats. |
| 34 | `spotify` | Spotify Podcast | `open.spotify.com/episode/<id>` | MP3 (30-second preview only) | Full episode audio requires Spotify auth, which is not implemented. Preview URL is from `previewUrl` in the episode API. |
| 35 | `generic` | Generic fallback | Any `http://` or `https://` URL | Depends on the target | Fetches the page and looks for `<video src>`, `<source src>`, and `og:video` meta tags. Last resort. |
