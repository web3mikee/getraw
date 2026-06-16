import { analyzePlayerJs, getNsigProcessorFn } from "./js-analyzer";
import type { PlayerScriptResult } from "./js-analyzer";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

let cachedPlayerUrl: string | null = null;
let cachedScript: PlayerScriptResult | null = null;

async function getPlayerUrl(pageHtml?: string): Promise<string> {
  if (cachedPlayerUrl) return cachedPlayerUrl;

  if (pageHtml) {
    const match = pageHtml.match(/\/s\/player\/([a-zA-Z0-9_-]+)\/[^"]+?base\.js/);
    if (match) {
      cachedPlayerUrl = `https://www.youtube.com${match[0]}`;
      return cachedPlayerUrl;
    }
  }

  const resp = await fetch("https://www.youtube.com/iframe_api", {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!resp.ok) throw new Error(`Failed to fetch iframe_api: ${resp.status}`);
  const text = await resp.text();
  const match = text.match(/player\\\/([a-zA-Z0-9_-]+)\\\//);
  if (!match) throw new Error("Could not extract player ID from iframe_api");
  cachedPlayerUrl = `https://www.youtube.com/s/player/${match[1]}/player_ias.vflset/en_US/base.js`;
  return cachedPlayerUrl;
}

async function getPlayerScript(pageHtml?: string): Promise<PlayerScriptResult> {
  if (cachedScript) return cachedScript;

  const playerUrl = await getPlayerUrl(pageHtml);
  const resp = await fetch(playerUrl, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!resp.ok) throw new Error(`Failed to fetch player JS: ${resp.status}`);
  const playerJs = await resp.text();

  cachedScript = analyzePlayerJs(playerJs);
  return cachedScript;
}

export async function getSignatureTimestamp(pageHtml?: string): Promise<number> {
  const script = await getPlayerScript(pageHtml);
  return script.signatureTimestamp;
}

async function evalPlayerScript(
  script: PlayerScriptResult,
  n?: string,
  sp?: string,
  s?: string,
): Promise<{ sig?: string; n?: string }> {
  const code = `${script.output}\n${getNsigProcessorFn(n, sp, s)}`;
  const fn = new Function(code);
  const result: unknown = fn();
  if (typeof result !== "object" || result === null) {
    throw new Error("Got invalid result from player script evaluation");
  }
  return result as { sig?: string; n?: string };
}

export async function decipherStreamUrl(
  rawUrl: string | undefined,
  signatureCipher: string | undefined,
  pageHtml?: string,
): Promise<string | null> {
  if (!rawUrl && !signatureCipher) return null;

  const script = await getPlayerScript(pageHtml);

  let urlString: string;
  let sig: string | undefined;
  let sp: string | undefined;

  if (signatureCipher) {
    const params = new URLSearchParams(signatureCipher);
    urlString = params.get("url") ?? "";
    sig = params.get("s") ?? undefined;
    sp = params.get("sp") ?? "signature";
    if (!urlString) return null;
  } else if (rawUrl) {
    urlString = rawUrl;
  } else {
    return null;
  }

  const urlObj = new URL(urlString);
  const n = urlObj.searchParams.get("n") ?? undefined;

  const needsEval = sig !== undefined || n !== undefined;

  if (needsEval && script.hasNsigFunction) {
    const result = await evalPlayerScript(script, n, sp, sig);

    if (typeof result.sig === "string" && sp) {
      urlObj.searchParams.set(sp, result.sig);
    }

    if (typeof result.n === "string") {
      if (!result.n.startsWith("enhanced_except_")) {
        urlObj.searchParams.set("n", result.n);
      }
    }
  }

  const client = urlObj.searchParams.get("c");
  const CLIENT_VERSIONS: Record<string, string> = {
    WEB: "2.20250615.01.00",
    MWEB: "2.20250614.01.00",
    WEB_REMIX: "1.20250611.01.00",
    WEB_KIDS: "2.20250612.00.00",
    TVHTML5: "7.20250612.16.00",
    TVHTML5_SIMPLY: "2.0",
    TVHTML5_SIMPLY_EMBEDDED_PLAYER: "2.0",
    WEB_EMBEDDED_PLAYER: "2.20250613.01.00",
  };
  if (client && CLIENT_VERSIONS[client]) {
    urlObj.searchParams.set("cver", CLIENT_VERSIONS[client]);
  }

  return urlObj.toString();
}

export function clearPlayerCache(): void {
  cachedPlayerUrl = null;
  cachedScript = null;
}

export function setPageHtmlForPlayerExtraction(html: string): void {
  if (!cachedPlayerUrl) {
    const match = html.match(/\/s\/player\/([a-zA-Z0-9_-]+)\/[^"]+?base\.js/);
    if (match) {
      cachedPlayerUrl = `https://www.youtube.com${match[0]}`;
    }
  }
}
