const playerCache = new Map<string, string>();
const sigFuncCache = new Map<string, (sig: string) => string>();

export async function fetchPlayerJs(playerUrl: string): Promise<string> {
  const cached = playerCache.get(playerUrl);
  if (cached) return cached;

  const fullUrl = playerUrl.startsWith("//")
    ? `https:${playerUrl}`
    : playerUrl.startsWith("/")
      ? `https://www.youtube.com${playerUrl}`
      : playerUrl;

  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch player JS: ${response.status}`);
  }

  const js = await response.text();
  playerCache.set(playerUrl, js);
  return js;
}

export function extractSignatureFunction(playerJs: string): (sig: string) => string {
  const cached = sigFuncCache.get(playerJs.slice(0, 100));
  if (cached) return cached;

  const funcNameMatch = playerJs.match(
    /\b[cs]\s*&&\s*[adf]\.set\([^,]+,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/
  ) ?? playerJs.match(
    /\b[a-zA-Z0-9]+\s*&&\s*[a-zA-Z0-9]+\.set\([^,]+,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/
  ) ?? playerJs.match(
    /\bm=([a-zA-Z0-9$]{2,})\(decodeURIComponent\(h\.s\)\)/
  ) ?? playerJs.match(
    /\bc\s*&&\s*d\.set\([^,]+,\s*(?:encodeURIComponent\s*\()([a-zA-Z0-9$]+)\(/
  ) ?? playerJs.match(
    /\bc\s*&&\s*[a-z]\.set\([^,]+,\s*([a-zA-Z0-9$]+)\(/
  ) ?? playerJs.match(
    /\bc\s*&&\s*[a-z]\.set\([^,]+,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/
  );

  if (!funcNameMatch) {
    throw new Error("Could not find signature function name in player JS");
  }

  const funcName = funcNameMatch[1];
  const escapedName = funcName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const funcBodyMatch = playerJs.match(
    new RegExp(`${escapedName}=function\\(a\\)\\{a=a\\.split\\(""\\);([^}]+)\\}`)
  );

  if (!funcBodyMatch) {
    throw new Error(`Could not find signature function body for ${funcName}`);
  }

  const funcBody = funcBodyMatch[1];
  const operations = parseSignatureOperations(funcBody, playerJs);

  const fn = (sig: string): string => {
    const arr = sig.split("");
    for (const op of operations) {
      op(arr);
    }
    return arr.join("");
  };

  sigFuncCache.set(playerJs.slice(0, 100), fn);
  return fn;
}

type SigOperation = (arr: string[]) => void;

function parseSignatureOperations(funcBody: string, playerJs: string): SigOperation[] {
  const helperMatch = funcBody.match(/([a-zA-Z0-9$]+)\./);
  if (!helperMatch) return [];

  const helperName = helperMatch[1];
  const escapedHelper = helperName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const helperObjMatch = playerJs.match(
    new RegExp(`var ${escapedHelper}=\\{([\\s\\S]*?)\\};`)
  );

  if (!helperObjMatch) return [];

  const helperBody = helperObjMatch[1];

  const methodMap = new Map<string, "reverse" | "splice" | "swap">();

  const methodRegex = /([a-zA-Z0-9$]+):function\(([^)]*)\)\{([^}]+)\}/g;
  let methodMatch: RegExpExecArray | null;
  while ((methodMatch = methodRegex.exec(helperBody)) !== null) {
    const name = methodMatch[1];
    const body = methodMatch[3];

    if (body.includes("reverse")) {
      methodMap.set(name, "reverse");
    } else if (body.includes("splice")) {
      methodMap.set(name, "splice");
    } else {
      methodMap.set(name, "swap");
    }
  }

  const operations: SigOperation[] = [];
  const callRegex = new RegExp(
    `${escapedHelper}\\.([a-zA-Z0-9$]+)\\(a,(\\d+)\\)`,
    "g"
  );

  let callMatch: RegExpExecArray | null;
  while ((callMatch = callRegex.exec(funcBody)) !== null) {
    const method = callMatch[1];
    const arg = parseInt(callMatch[2], 10);
    const type = methodMap.get(method);

    switch (type) {
      case "reverse":
        operations.push((arr) => arr.reverse());
        break;
      case "splice":
        operations.push((arr) => arr.splice(0, arg));
        break;
      case "swap":
        operations.push((arr) => {
          const idx = arg % arr.length;
          const tmp = arr[0];
          arr[0] = arr[idx];
          arr[idx] = tmp;
        });
        break;
    }
  }

  return operations;
}

export function decipherSignatureUrl(
  signatureCipher: string,
  playerJs: string,
): string {
  const params = new URLSearchParams(signatureCipher);
  const url = params.get("url");
  const sig = params.get("s");
  const sp = params.get("sp") ?? "signature";

  if (!url || !sig) {
    throw new Error("Missing url or signature in signatureCipher");
  }

  const sigFunc = extractSignatureFunction(playerJs);
  const decipheredSig = sigFunc(sig);

  const finalUrl = new URL(url);
  finalUrl.searchParams.set(sp, decipheredSig);
  return finalUrl.toString();
}

export function clearCache(): void {
  playerCache.clear();
  sigFuncCache.clear();
}
