import { BaseExtractor } from "../core/types";
import { GenericExtractor } from "./generic";

export { BaseExtractor };

const extractors: BaseExtractor[] = [];
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
