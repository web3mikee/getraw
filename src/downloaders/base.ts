import { Downloader } from "../core/types";
import { HttpDownloader } from "./http";
import { HlsDownloader } from "./hls";
import { DashDownloader } from "./dash";

export { Downloader };

const downloaders: Downloader[] = [
  new HttpDownloader(),
  new HlsDownloader(),
  new DashDownloader(),
];

export function registerDownloader(downloader: Downloader): void {
  downloaders.push(downloader);
}

export function getDownloader(protocol: string): Downloader | null {
  for (const dl of downloaders) {
    if (dl.canHandle(protocol)) {
      return dl;
    }
  }
  return null;
}
