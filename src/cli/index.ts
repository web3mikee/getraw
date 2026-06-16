#!/usr/bin/env bun
import { parseArgs, printHelp } from "./options";
import { Orchestrator } from "../core/orchestrator";
import { logger } from "../core/logger";

const VERSION = "0.0.0";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    process.stdout.write(`getraw ${VERSION}\n`);
    process.exit(0);
  }

  if (options.verbose) {
    logger.setLevel("debug");
  }

  if (options.quiet) {
    logger.setQuiet(true);
  }

  if (options.urls.length === 0) {
    logger.error("No URLs provided. Use --help for usage.");
    process.exit(1);
  }

  const orchestrator = new Orchestrator();

  for (const url of options.urls) {
    try {
      await orchestrator.process(url, options);
    } catch (err) {
      logger.error(
        err instanceof Error ? err.message : String(err),
      );
      if (options.verbose && err instanceof Error && err.stack) {
        logger.debug(err.stack);
      }
      process.exit(1);
    }
  }
}

main();
