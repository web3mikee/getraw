---
name: getraw
description: Download videos, audio, and metadata from 30+ sites (YouTube, Twitter, TikTok, Instagram, Reddit, Twitch, Vimeo, SoundCloud, and more). Use when the user asks to download media, extract video info, get transcripts/subtitles, rip audio, or fetch metadata from a URL. Wraps the getraw CLI — a yt-dlp replacement built in Bun/TypeScript.
---

# getraw

Download and extract media from 30+ sites. Built in Bun/TypeScript as a yt-dlp replacement.

## Prerequisites

Requires `bun` and `getraw` installed:

```bash
bun install -g getraw
```

Optional: `ffmpeg` for audio extraction, format merging, and subtitle embedding.

## Commands

### Download a video

```bash
getraw "URL"
```

Downloads the best available format to the current directory.

### Get metadata as JSON (no download)

```bash
getraw --dump-json "URL"
```

Returns full metadata: title, description, uploader, duration, formats, subtitles, thumbnails. Use this when you need info about a video without downloading it. Parse the JSON output for structured data.

### List available formats

```bash
getraw --list-formats "URL"
```

Shows all available quality/format options (resolution, codec, bitrate, filesize).

### Download specific format

```bash
getraw -f "best[height<=720]" "URL"
getraw -f "bestvideo+bestaudio" "URL"
getraw -f "bestaudio" "URL"
```

Format selection strings:
- `best` — best single file
- `bestvideo+bestaudio` — best video + best audio, merged by ffmpeg
- `bestaudio` — audio only (best quality)
- `best[height<=720]` — best format at 720p or below
- Format ID from `--list-formats` (e.g. `137+140`)

### Extract audio only

```bash
getraw -x "URL"
getraw -x --audio-format mp3 "URL"
getraw -x --audio-format flac "URL"
```

Supported audio formats: `mp3`, `aac`, `flac`, `wav`, `opus`, `vorbis`, `m4a`.

### Download subtitles

```bash
getraw --write-subs "URL"
getraw --write-subs --sub-langs "en,es" "URL"
```

Downloads subtitle files alongside the video. Use `--sub-langs` to specify languages.

### Custom output filename

```bash
getraw -o "%(title)s.%(ext)s" "URL"
getraw -o "%(uploader)s - %(title)s [%(id)s].%(ext)s" "URL"
```

Template variables: `%(title)s`, `%(id)s`, `%(ext)s`, `%(uploader)s`, `%(upload_date)s`, `%(duration)s`, `%(view_count)s`.

### Embed metadata

```bash
getraw --embed-thumbnail --embed-subs "URL"
```

Embeds thumbnail art and subtitles into the downloaded file (requires ffmpeg).

## Supported Sites

| Site | URL Pattern |
|------|------------|
| YouTube | youtube.com, youtu.be, youtube.com/shorts |
| Twitter/X | twitter.com/*/status/*, x.com/*/status/* |
| TikTok | tiktok.com/@*/video/*, vm.tiktok.com/* |
| Instagram | instagram.com/p/*, instagram.com/reel/* |
| Reddit | reddit.com/r/*/comments/*, v.redd.it/* |
| Twitch | twitch.tv/videos/*, twitch.tv/*/clip/* |
| Vimeo | vimeo.com/* |
| SoundCloud | soundcloud.com/*/* |
| Bilibili | bilibili.com/video/* |
| Dailymotion | dailymotion.com/video/* |
| Bandcamp | *.bandcamp.com/track/*, *.bandcamp.com/album/* |
| Rumble | rumble.com/* |
| TED | ted.com/talks/* |
| Kick | kick.com/video/*, kick.com/*/clips/* |
| Streamable | streamable.com/* |
| PeerTube | Any PeerTube instance |
| Archive.org | archive.org/details/* |
| + 13 more | Imgur, Coub, Odysee, Spotify podcasts, NHK, BBC, etc. |

## When to Use

- User says "download this video" or shares a video URL
- User wants video/audio metadata (`--dump-json`)
- User wants to extract audio from a video (`-x`)
- User wants subtitles or transcripts (`--write-subs`)
- User wants to check available qualities (`--list-formats`)
- User wants to save media for offline use or processing

## Common Patterns

### Get video transcript for summarization

```bash
getraw --write-subs --sub-langs en --skip-download "URL"
# Then read the .vtt or .srt file
```

### Download audio for TTS/transcription pipeline

```bash
getraw -x --audio-format wav -o "audio.wav" "URL"
```

### Batch download from a list

```bash
getraw URL1 URL2 URL3
```

### Get metadata for multiple videos

```bash
for url in URL1 URL2 URL3; do
  getraw --dump-json "$url"
done
```

## Error Handling

- If a site is unsupported, getraw returns a clear error with the URL
- If a format is unavailable, it falls back to the best available
- Network errors retry 3 times with exponential backoff
- Use `--verbose` for debug output, `--quiet` to suppress all output
