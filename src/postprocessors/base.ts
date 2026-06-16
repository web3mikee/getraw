import { PostProcessor } from "../core/types";
import type { InfoDict, Options, PostProcessResult } from "../core/types";
import { logger } from "../core/logger";

export { PostProcessor };

const postProcessors: PostProcessor[] = [];

export function registerPostProcessor(pp: PostProcessor): void {
  postProcessors.push(pp);
}

export async function runPostProcessors(
  info: InfoDict,
  filepath: string,
  _options: Options,
): Promise<string> {
  let currentPath = filepath;
  const filesToDelete: string[] = [];

  for (const pp of postProcessors) {
    logger.debug(`Running post-processor: ${pp._NAME}`);
    try {
      const result: PostProcessResult = await pp.run(info, currentPath);
      currentPath = result.filepath;
      filesToDelete.push(...result.files_to_delete);
    } catch (err) {
      logger.warn(
        `Post-processor ${pp._NAME} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  for (const file of filesToDelete) {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(file);
    } catch {
      logger.debug(`Could not delete temp file: ${file}`);
    }
  }

  return currentPath;
}
