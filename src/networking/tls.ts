export interface TlsFingerprint {
  ja3?: string;
  ja4?: string;
  userAgent: string;
}

export interface TlsProfile {
  name: string;
  userAgent: string;
  fingerprint?: TlsFingerprint;
}

export const TLS_PROFILES: Record<string, TlsProfile> = {
  chrome_131: {
    name: "Chrome 131",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    fingerprint: {
      ja3: "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24,0",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  },
  firefox_133: {
    name: "Firefox 133",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    fingerprint: {
      ja3: "771,4865-4867-4866-49195-49199-52393-52392-49196-49200-49162-49161-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-34-51-43-13-45-28-65037,29-23-24-25-256-257,0",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    },
  },
  safari_18: {
    name: "Safari 18",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    fingerprint: {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    },
  },
};

export function getTlsProfileForUserAgent(
  userAgent: string,
): TlsProfile | undefined {
  for (const profile of Object.values(TLS_PROFILES)) {
    if (profile.userAgent === userAgent) return profile;
  }
  if (userAgent.includes("Chrome")) return TLS_PROFILES["chrome_131"];
  if (userAgent.includes("Firefox")) return TLS_PROFILES["firefox_133"];
  if (userAgent.includes("Safari")) return TLS_PROFILES["safari_18"];
  return undefined;
}

export const TLS_IMPLEMENTATION_NOTE = `
TLS fingerprinting (JA3/JA4) requires low-level TLS control not available through
standard fetch()/WebSocket APIs. Full impersonation requires:
1. A native Bun binding or FFI to BoringSSL/uTLS
2. Custom cipher suite ordering matching the target browser
3. Custom TLS extensions ordering

For now, getraw sets a matching User-Agent header which satisfies most sites.
Sites that perform JA3 fingerprint checking (e.g., some CDN bot detection) may
require a future implementation using Bun FFI + uTLS or a headless browser approach.
`;
