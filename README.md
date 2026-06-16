# getraw

Fast media downloader CLI built natively in Bun/TypeScript. A yt-dlp replacement with native JS execution.

[![npm](https://img.shields.io/npm/v/getraw)](https://www.npmjs.com/package/getraw)
[![tests](https://img.shields.io/badge/tests-386%20passing-brightgreen)]()
[![license](https://img.shields.io/badge/license-MIT-blue)]()

## Why getraw?

- **Native JS execution** — YouTube's player code runs natively in Bun. No external runtime needed (yt-dlp requires Deno/Node).
- **50ms cold startup** — Bun-powered, not Python.
- **30+ sites** — YouTube, Twitter, TikTok, Instagram, Reddit, Twitch, and more.
- **Zero API keys** — All extractors use public endpoints, guest tokens, and page scraping.
- **Agent-ready** — Install as an AI agent skill: `npx skills add onkits/getraw`

## Installation

```sh
bun install -g getraw
```

### From source

```sh
git clone https://github.com/onkits/getraw
cd getraw
bun install
```

### As an AI agent skill

```sh
npx skills add onkits/getraw
```

Works with Claude Code, Cursor, Copilot, Codex, Windsurf, and 50+ other agents.

## Quick Start

```sh
# Download a video
getraw https://www.youtube.com/watch?v=dQw4w9WgXcQ

# Extract audio as MP3
getraw -x --audio-format mp3 https://soundcloud.com/artist/track

# List available formats
getraw -F https://vimeo.com/123456789

# Download specific quality with subtitles
getraw -f "bestvideo[height<=1080]+bestaudio" --write-subs https://www.youtube.com/watch?v=dQw4w9WgXcQ

# Get metadata as JSON (no download)
getraw -j https://www.reddit.com/r/videos/comments/abc123/some_post/
```

## CLI Reference

```
Usage: getraw [OPTIONS] URL [URL...]
```

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--format` | `-f` | `bv*+ba/b` | Format selection string |
| `--output` | `-o` | `%(title)s [%(id)s].%(ext)s` | Output filename template |
| `--extract-audio` | `-x` | | Extract audio only |
| `--audio-format` | | `mp3` | Audio format (mp3, aac, flac, wav, opus) |
| `--write-subs` | | | Write subtitles to file |
| `--sub-langs` | | `en` | Subtitle languages |
| `--list-formats` | `-F` | | List available formats |
| `--dump-json` | `-j` | | Dump info JSON to stdout |
| `--quiet` | `-q` | | Suppress output |
| `--verbose` | `-v` | | Verbose output |
| `--retries` | `-R` | `3` | Number of retries |
| `--rate-limit` | `-r` | | Rate limit in bytes/sec |
| `--proxy` | | | Proxy URL |
| `--cookies` | | | Cookie file path (Netscape format) |
| `--embed-thumbnail` | | | Embed thumbnail in output |
| `--embed-subs` | | | Embed subtitles in output |
| `--version` | `-V` | | Print version |
| `--help` | `-h` | | Show help |

## Supported Sites (30+)

| Site | URL Patterns |
|------|-------------|
| **YouTube** | youtube.com, youtu.be, shorts, live, playlists, channels |
| **Twitter/X** | twitter.com/\*/status/\*, x.com/\*/status/\*, Spaces |
| **TikTok** | tiktok.com/@\*/video/\*, vm.tiktok.com, user profiles |
| **Instagram** | instagram.com/p/\*, /reel/\*, /reels/ |
| **Reddit** | reddit.com/r/\*/comments/\*, v.redd.it, galleries |
| **Twitch** | VODs, clips, live streams |
| **Vimeo** | vimeo.com/\*, player embeds |
| **SoundCloud** | Tracks, playlists, albums |
| **Bilibili** | Videos, bangumi/anime |
| **Dailymotion** | Videos |
| **Bandcamp** | Tracks, albums |
| **Kick** | VODs, clips, live |
| **Rumble** | Videos |
| **TED** | Talks (with multi-language subtitles) |
| **Niconico** | Videos |
| **Streamable** | Videos |
| **Imgur** | Videos, GIFs, albums |
| **Coub** | Videos (video + audio merge) |
| **Odysee/LBRY** | Videos |
| **PeerTube** | Any instance |
| **Spotify** | Podcast episodes (30s preview) |
| **Archive.org** | Any public media |
| **Google Drive** | Public files |
| **Dropbox** | Public share links |
| **+ more** | Generic fallback for direct media URLs |

See [docs/supported-sites.md](docs/supported-sites.md) for full details.

## For AI Agents

getraw is designed to be used by AI agents. Key commands for automation:

```sh
# Get structured metadata
getraw --dump-json "URL" | jq '.title, .duration, .formats[0].url'

# Download transcript for summarization
getraw --write-subs --sub-langs en --skip-download "URL"

# Extract audio for transcription pipelines
getraw -x --audio-format wav -o "audio.wav" "URL"

# Batch download
getraw URL1 URL2 URL3
```

Install as an agent skill for any compatible AI coding agent:

```sh
npx skills add onkits/getraw
```

## Building from Source

```sh
git clone https://github.com/onkits/getraw
cd getraw
bun install
bun test         # 386 tests
bun run build    # standalone binary
```

## Writing a Custom Extractor

See [docs/plugin-guide.md](docs/plugin-guide.md) for the `BaseExtractor` interface and examples.

## License

MIT
