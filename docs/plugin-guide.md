# Plugin Guide — Writing a Custom Extractor

getraw extractors are classes that extend `BaseExtractor` from `src/core/types.ts`. Once written, they are registered via `registerExtractor` from `src/extractors/base.ts`. getraw then tries each registered extractor in order before falling back to the generic extractor.

## BaseExtractor Interface

```ts
// src/core/types.ts

export abstract class BaseExtractor {
  // Regex tested against the URL to decide if this extractor handles it.
  abstract readonly _VALID_URL: RegExp;

  // Human-readable name used in logs and the extractor field of InfoDict.
  abstract readonly _NAME: string;

  // Returns true when _VALID_URL matches the URL. Override to add custom logic.
  canHandle(url: string): boolean {
    return this._VALID_URL.test(url);
  }

  // Public entry point. Calls _real_extract and stamps extractor metadata.
  async extract(url: string): Promise<InfoDict> { ... }

  // Your implementation goes here.
  protected abstract _real_extract(url: string): Promise<InfoDict>;
}
```

`_real_extract` must return an `InfoDict`. The key fields are:

```ts
interface InfoDict {
  id: string;           // required — unique ID for the media
  title: string;        // required
  formats?: Format[];   // list of available streams; mutually exclusive with url
  url?: string;         // use this if there is exactly one stream URL
  ext?: string;         // file extension when using url
  thumbnails?: Thumbnail[];
  subtitles?: Record<string, Subtitle[]>;
  automatic_captions?: Record<string, Subtitle[]>;
  description?: string;
  uploader?: string;
  duration?: number;    // seconds
  // ... see src/core/types.ts for the full list
}
```

Each `Format` describes one downloadable stream:

```ts
interface Format {
  format_id: string;    // required
  url: string;          // required
  ext: string;          // required — e.g. "mp4", "m4a", "webm"
  protocol?: string;    // "https", "m3u8", "dash" — controls which downloader is used
  width?: number;
  height?: number;
  fps?: number;
  vcodec?: string;      // "avc1.…", "vp9", "none" (audio-only)
  acodec?: string;      // "mp4a.…", "opus", "none" (video-only)
  vbr?: number;         // video bitrate kbps
  abr?: number;         // audio bitrate kbps
  tbr?: number;         // total bitrate kbps
  filesize?: number;
  http_headers?: Record<string, string>;
}
```

## Minimal Example

```ts
// src/extractors/example.ts

import { BaseExtractor, ExtractorError } from "../core/types";
import type { InfoDict } from "../core/types";

export class ExampleExtractor extends BaseExtractor {
  readonly _VALID_URL = /https?:\/\/(?:www\.)?example\.com\/watch\/([a-zA-Z0-9]+)/;
  readonly _NAME = "example";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = this._VALID_URL.exec(url);
    if (!match) throw new ExtractorError(`example: invalid URL: ${url}`);
    const videoId = match[1];

    // Fetch the page or an API endpoint to find the stream URL.
    const apiUrl = `https://example.com/api/videos/${videoId}`;
    const resp = await fetch(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!resp.ok) {
      throw new ExtractorError(`example: API returned ${resp.status}`);
    }

    const data = (await resp.json()) as {
      title: string;
      mp4_url: string;
      duration_s: number;
    };

    return {
      id: videoId,
      title: data.title,
      url: data.mp4_url,
      ext: "mp4",
      duration: data.duration_s,
      extractor: this._NAME,
    };
  }
}
```

If the site provides multiple quality levels, return them as `formats` instead of a single `url`:

```ts
return {
  id: videoId,
  title: data.title,
  formats: [
    {
      format_id: "1080p",
      url: data.hd_url,
      ext: "mp4",
      width: 1920,
      height: 1080,
      vcodec: "avc1",
      acodec: "mp4a",
    },
    {
      format_id: "480p",
      url: data.sd_url,
      ext: "mp4",
      width: 854,
      height: 480,
      vcodec: "avc1",
      acodec: "mp4a",
    },
  ],
};
```

## Registering the Extractor

Import `registerExtractor` from `src/extractors/base.ts` and call it before the orchestrator runs. The standard place is an index file that is imported by the entry point:

```ts
// src/extractors/index.ts  (or wherever you collect registrations)

import { registerExtractor } from "./base";
import { ExampleExtractor } from "./example";

registerExtractor(new ExampleExtractor());
```

Extractors are tested in registration order. Place more-specific extractors before broader ones. The `generic` extractor is always the last fallback and cannot be displaced.

## Error Handling

Throw `ExtractorError` (from `src/core/types.ts`) for expected failures (unsupported URL shape, API error, content not found). Any other thrown error is automatically wrapped in an `ExtractorError` by the base class before propagating.

```ts
import { ExtractorError } from "../core/types";

throw new ExtractorError("example: video is private");
```
