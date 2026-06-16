export interface UserAgentEntry {
  ua: string;
  platform: "macos" | "windows" | "linux";
  browser: "chrome" | "firefox" | "safari" | "edge";
}

export const USER_AGENTS: UserAgentEntry[] = [
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "macos",
    browser: "chrome",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "windows",
    browser: "chrome",
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "linux",
    browser: "chrome",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
    platform: "macos",
    browser: "firefox",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    platform: "windows",
    browser: "firefox",
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    platform: "linux",
    browser: "firefox",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    platform: "macos",
    browser: "safari",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    platform: "windows",
    browser: "edge",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    platform: "macos",
    browser: "edge",
  },
];

let roundRobinIndex = 0;

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)].ua;
}

export function getRoundRobinUserAgent(): string {
  const ua = USER_AGENTS[roundRobinIndex % USER_AGENTS.length].ua;
  roundRobinIndex++;
  return ua;
}

export function getUserAgentByBrowser(
  browser: UserAgentEntry["browser"],
  platform?: UserAgentEntry["platform"],
): string {
  const filtered = USER_AGENTS.filter(
    (e) => e.browser === browser && (!platform || e.platform === platform),
  );
  if (filtered.length === 0) {
    return getRandomUserAgent();
  }
  return filtered[Math.floor(Math.random() * filtered.length)].ua;
}

export function getUserAgentByPlatform(
  platform: UserAgentEntry["platform"],
): string {
  const filtered = USER_AGENTS.filter((e) => e.platform === platform);
  if (filtered.length === 0) {
    return getRandomUserAgent();
  }
  return filtered[Math.floor(Math.random() * filtered.length)].ua;
}
