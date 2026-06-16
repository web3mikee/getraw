# getraw

Fast media downloader CLI built natively in Bun/TypeScript.

## Installation

### Global install (Bun required)

```sh
bun install -g getraw
```

### From source

```sh
git clone https://github.com/web3mikee/getraw
cd getraw
bun install
```

Run directly from source:

```sh
bun run src/cli/index.ts <URL>
```

Build a standalone binary:

```sh
bun run build
./getraw <URL>
```

## Quick Start

Download a video at best quality:

```sh
getraw https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

Extract audio as MP3:

```sh
getraw -x --audio-format mp3 https://soundcloud.com/artist/track
```

List all available formats before downloading:

```sh
getraw -F https://vimeo.com/123456789
```

Download a specific format and write subtitles:

```sh
getraw -f "bestvideo[height<=1080]+bestaudio" --write-subs --sub-langs en https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

Dump extracted metadata as JSON without downloading:

```sh
getraw -j https://www.reddit.com/r/videos/comments/abc123/some_post/
```

## CLI Reference

```
Usage: getraw [OPTIONS] URL [URL...]
```

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--format` | `-f` | string | `bv*+ba/b` | Format selection string |
| `--output` | `-o` | string | `%(title)s [%(id)s].%(ext)s` | Output filename template |
| `--extract-audio` | `-x` | boolean | false | Extract audio only |
| `--audio-format` | | string | `mp3` | Audio format (`mp3`, `aac`, `flac`, etc.) |
| `--audio-quality` | | string | `5` | Audio quality (0–10 or bitrate) |
| `--write-subs` | | boolean | false | Write subtitles to file |
| `--sub-langs` | | string | `en` | Subtitle languages |
| `--list-formats` | `-F` | boolean | false | List available formats |
| `--dump-json` | `-j` | boolean | false | Dump info JSON to stdout |
| `--quiet` | `-q` | boolean | false | Suppress output |
| `--verbose` | `-v` | boolean | false | Verbose output |
| `--no-progress` | | boolean | false | Disable progress bar |
| `--retries` | `-R` | number | `3` | Number of retries |
| `--rate-limit` | `-r` | number | none | Rate limit in bytes/sec |
| `--proxy` | | string | none | Proxy URL |
| `--cookies` | | string | none | Cookie file path |
| `--user-agent` | | string | `getraw/0.0.0` | Custom User-Agent |
| `--referer` | | string | none | Custom Referer header |
| `--embed-thumbnail` | | boolean | false | Embed thumbnail in output file |
| `--embed-subs` | | boolean | false | Embed subtitles in output file |
| `--merge-output-format` | | string | none | Output container for merging streams |
| `--ffmpeg-location` | | string | none | Path to ffmpeg binary |
| `--version` | `-V` | boolean | false | Print version |
| `--help` | `-h` | boolean | false | Show help |

## Supported Sites

| Site | Extractor name | URL pattern | Subtitles |
|------|---------------|-------------|-----------|
| YouTube | `youtube` | `youtube.com/watch`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/live/`, `youtube.com/playlist`, `youtube.com/channel/`, `youtube.com/@handle` | Yes (manual + auto-generated) |
| Vimeo | `vimeo` | `vimeo.com/<id>`, `player.vimeo.com/video/<id>`, channels, groups | No |
| Twitter / X | `twitter` | `twitter.com/*/status/*`, `x.com/*/status/*` | No |
| Twitter Spaces | `twitter:spaces` | `twitter.com/i/spaces/*`, `x.com/i/spaces/*` | No |
| TikTok | `tiktok` | `tiktok.com/@user/video/<id>`, `vm.tiktok.com/*` | No |
| TikTok User | `tiktok:user` | `tiktok.com/@username` | No |
| Instagram | `instagram` | `instagram.com/p/*`, `instagram.com/reel/*`, `instagram.com/reels/*` | No |
| Instagram Reels feed | `instagram:reels` | `instagram.com/reels/` | No |
| Twitch VOD | `twitch:vod` | `twitch.tv/videos/<id>` | No |
| Twitch Clip | `twitch:clip` | `twitch.tv/*/clip/*`, `clips.twitch.tv/*` | No |
| Twitch Live | `twitch:live` | `twitch.tv/<channel>` | No |
| Kick VOD | `kick` | `kick.com/video/<id>` | No |
| Kick Clip | `kick:clips` | `kick.com/<channel>/clips/<id>` | No |
| Kick Live | `kick:live` | `kick.com/<channel>` | No |
| Reddit | `reddit` | `reddit.com/r/*/comments/*`, `v.redd.it/*` | No |
| Reddit Gallery | `reddit:gallery` | `reddit.com/r/*/comments/*`, `reddit.com/gallery/*` | No |
| SoundCloud | `soundcloud` | `soundcloud.com/<user>/<track>` | No |
| SoundCloud Playlist | `soundcloud:playlist` | `soundcloud.com/<user>/sets/<playlist>` | No |
| Bilibili | `bilibili` | `bilibili.com/video/BV*`, `bilibili.com/video/av*` | No |
| Bilibili Bangumi | `bilibili:bangumi` | `bilibili.com/bangumi/play/ep*`, `bilibili.com/bangumi/play/ss*` | No |
| Niconico | `niconico` | `nicovideo.jp/watch/sm*`, `nicovideo.jp/watch/nm*` | No |
| Bandcamp | `bandcamp` | `*.bandcamp.com/track/*`, `*.bandcamp.com/album/*` | No |
| Dailymotion | `dailymotion` | `dailymotion.com/video/<id>` | No |
| Streamable | `streamable` | `streamable.com/<id>` | No |
| Coub | `coub` | `coub.com/view/*`, `coub.com/embed/*` | No |
| Imgur | `imgur` | `imgur.com/<id>`, `imgur.com/a/<id>`, `imgur.com/gallery/<id>`, `i.imgur.com/*` | No |
| Rumble | `rumble` | `rumble.com/v*.html`, `rumble.com/embed/*` | No |
| Odysee | `odysee` | `odysee.com/@*:*/<slug>`, `lbry.tv/@*:*/<slug>` | No |
| TED | `ted` | `ted.com/talks/<slug>` | Yes |
| PeerTube | `peertube` | Any PeerTube instance: `<host>/videos/watch/*`, `<host>/w/*`, `<host>/videos/embed/*` | Yes |
| Google Drive | `google-drive` | `drive.google.com/file/d/*`, `docs.google.com/file/d/*` | No |
| Dropbox | `dropbox` | `dropbox.com/s/*`, `dropbox.com/sh/*`, `dropbox.com/scl/fo/*` | No |
| Archive.org | `archive.org` | `archive.org/details/*`, `archive.org/download/*` | No |
| Spotify | `spotify` | `open.spotify.com/episode/<id>` | No |
| Generic | `generic` | Any `http://` or `https://` URL (fallback) | No |

> Spotify: only 30-second preview audio is available without authentication. Full episode audio requires Spotify auth (not currently implemented).

See [docs/supported-sites.md](docs/supported-sites.md) for full format and URL pattern details.

## Building from Source

Requires [Bun](https://bun.sh) v1.0 or later.

```sh
git clone https://github.com/web3mikee/getraw
cd getraw
bun install
bun run build    # produces ./getraw binary
```

Run tests:

```sh
bun test
```

## Writing a Custom Extractor

See [docs/plugin-guide.md](docs/plugin-guide.md) for the `BaseExtractor` interface and a minimal example.

## License

MIT
