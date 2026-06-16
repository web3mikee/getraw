import { Downloader } from "../core/types";
import { HttpDownloader } from "./http";

export { Downloader };

const downloaders: Downloader[] = [new HttpDownloader()];

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
