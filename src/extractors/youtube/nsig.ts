const nsigFuncCache = new Map<string, (n: string) => string>();

export function extractNsigFunction(playerJs: string): (n: string) => string {
  const cacheKey = playerJs.slice(0, 100);
  const cached = nsigFuncCache.get(cacheKey);
  if (cached) return cached;

  const funcName = findNsigFuncName(playerJs);
  const funcBody = extractNsigFuncBody(funcName, playerJs);

  const fn = buildNsigTransform(funcBody);
  nsigFuncCache.set(cacheKey, fn);
  return fn;
}

function findNsigFuncName(playerJs: string): string {
  const patterns = [
    /\.get\("n"\)\)&&\(b=([a-zA-Z0-9$]+)(?:\[(\d+)\])?\([a-zA-Z0-9]\)/,
    /\b([a-zA-Z0-9$]+)\s*=\s*function\([a-zA-Z]\)\s*\{var\s+b=a\.split\(""\)/,
    /(?:^|[;,])([a-zA-Z0-9$]+)\s*=\s*function\(a\)\{(?:var\s+b=)?a\.split\(""\)/m,
  ];

  for (const pattern of patterns) {
    const match = playerJs.match(pattern);
    if (match) {
      const name = match[1];
      if (match[2]) {
        const arrayIdx = parseInt(match[2], 10);
        const arrayMatch = playerJs.match(
          new RegExp(
            `var ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*\\[([^\\]]+)\\]`
          )
        );
        if (arrayMatch) {
          const elements = arrayMatch[1].split(",").map((e) => e.trim());
          return elements[arrayIdx];
        }
      }
      return name;
    }
  }

  throw new Error("Could not find nsig function name in player JS");
}

function extractNsigFuncBody(funcName: string, playerJs: string): string {
  const escaped = funcName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    new RegExp(`${escaped}\\s*=\\s*function\\(a\\)\\{(.+?)\\}\\s*[;,]`, "s"),
    new RegExp(`function\\s+${escaped}\\(a\\)\\{(.+?)\\}\\s*[;,]`, "s"),
  ];

  for (const pattern of patterns) {
    const match = playerJs.match(pattern);
    if (match) return match[1];
  }

  const idx = playerJs.indexOf(`${funcName}=function(a){`);
  if (idx !== -1) {
    const start = idx + `${funcName}=function(a){`.length;
    let depth = 1;
    let i = start;
    while (i < playerJs.length && depth > 0) {
      if (playerJs[i] === "{") depth++;
      else if (playerJs[i] === "}") depth--;
      i++;
    }
    return playerJs.slice(start, i - 1);
  }

  throw new Error(`Could not extract nsig function body for ${funcName}`);
}

function buildNsigTransform(funcBody: string): (n: string) => string {
  return (n: string): string => {
    try {
      const evalFunc = new Function("a", funcBody);
      const result: unknown = evalFunc(n);
      if (typeof result === "string") return result;
      return n;
    } catch {
      return n;
    }
  };
}

export function transformNsig(url: string, playerJs: string): string {
  const urlObj = new URL(url);
  const n = urlObj.searchParams.get("n");
  if (!n) return url;

  const transform = extractNsigFunction(playerJs);
  const newN = transform(n);

  if (newN !== n) {
    urlObj.searchParams.set("n", newN);
  }

  return urlObj.toString();
}

export function clearNsigCache(): void {
  nsigFuncCache.clear();
}
