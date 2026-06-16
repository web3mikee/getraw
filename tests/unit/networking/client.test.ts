import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { HttpClient } from "../../../src/networking/client";
import { CookieJar } from "../../../src/networking/cookies";
import { USER_AGENTS } from "../../../src/networking/user-agents";

function mockFetchResponse(
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain", ...headers },
  });
}

describe("HttpClient - User-Agent rotation", () => {
  test("uses configured user agent by default", async () => {
    const capturedHeaders: Record<string, string>[] = [];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const hdrs = init?.headers as Record<string, string> | undefined;
      if (hdrs) capturedHeaders.push(hdrs);
      return mockFetchResponse("ok");
    });

    try {
      const client = new HttpClient({ userAgent: "TestAgent/1.0", timeout: 5000 });
      await client.get("http://example.com/");
      expect(capturedHeaders[0]?.["User-Agent"]).toBe("TestAgent/1.0");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rotates user agents when rotateUserAgent is true", async () => {
    const capturedUAs: string[] = [];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const hdrs = init?.headers as Record<string, string> | undefined;
      if (hdrs?.["User-Agent"]) capturedUAs.push(hdrs["User-Agent"]);
      return mockFetchResponse("ok");
    });

    try {
      const client = new HttpClient({ rotateUserAgent: true, timeout: 5000 });
      for (let i = 0; i < 5; i++) {
        await client.get(`http://example.com/${i}`);
      }
      const known = USER_AGENTS.map((e) => e.ua);
      expect(capturedUAs.every((ua) => known.includes(ua))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("HttpClient - Retry logic", () => {
  test("retries on 503 status", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      callCount++;
      if (callCount < 3) return mockFetchResponse("error", 503);
      return mockFetchResponse("ok", 200);
    });

    try {
      const client = new HttpClient({ maxRetries: 3, retryDelay: 1, timeout: 5000 });
      const res = await client.get("http://example.com/");
      expect(res.ok).toBe(true);
      expect(callCount).toBe(3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("retries on 429 status", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      callCount++;
      if (callCount < 2) return mockFetchResponse("rate limited", 429);
      return mockFetchResponse("ok", 200);
    });

    try {
      const client = new HttpClient({ maxRetries: 3, retryDelay: 1, timeout: 5000 });
      const res = await client.get("http://example.com/");
      expect(res.ok).toBe(true);
      expect(callCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns last error response after exhausting retries", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      callCount++;
      return mockFetchResponse("error", 503);
    });

    try {
      const client = new HttpClient({ maxRetries: 2, retryDelay: 1, timeout: 5000 });
      const res = await client.get("http://example.com/");
      expect(res.status).toBe(503);
      expect(res.ok).toBe(false);
      expect(callCount).toBe(3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("does not retry on 404", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      callCount++;
      return mockFetchResponse("not found", 404);
    });

    try {
      const client = new HttpClient({ maxRetries: 3, retryDelay: 1, timeout: 5000 });
      const res = await client.get("http://example.com/");
      expect(res.status).toBe(404);
      expect(callCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("HttpClient - Rate limiting", () => {
  test("enforces delay between requests", async () => {
    const timestamps: number[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      timestamps.push(Date.now());
      return mockFetchResponse("ok");
    });

    try {
      const client = new HttpClient({ requestsPerSecond: 5, timeout: 5000 });
      await client.get("http://example.com/1");
      await client.get("http://example.com/2");
      await client.get("http://example.com/3");

      const minInterval = 1000 / 5;
      for (let i = 1; i < timestamps.length; i++) {
        const gap = timestamps[i] - timestamps[i - 1];
        expect(gap).toBeGreaterThanOrEqual(minInterval - 5);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("no delay when rate limiting is disabled", async () => {
    const timestamps: number[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      timestamps.push(Date.now());
      return mockFetchResponse("ok");
    });

    try {
      const client = new HttpClient({ requestsPerSecond: 0, timeout: 5000 });
      await client.get("http://example.com/1");
      await client.get("http://example.com/2");
      const gap = timestamps[1] - timestamps[0];
      expect(gap).toBeLessThan(100);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("HttpClient - Cookie jar", () => {
  test("sends Cookie header when jar has matching cookies", async () => {
    const capturedHeaders: Record<string, string>[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const hdrs = init?.headers as Record<string, string> | undefined;
      if (hdrs) capturedHeaders.push(hdrs);
      return mockFetchResponse("ok");
    });

    try {
      const jar = new CookieJar();
      jar.set({
        domain: "example.com",
        includeSubdomains: false,
        path: "/",
        secure: false,
        expires: Math.floor(Date.now() / 1000) + 86400,
        name: "auth",
        value: "token123",
      });
      const client = new HttpClient({ cookieJar: jar, timeout: 5000 });
      await client.get("http://example.com/");
      expect(capturedHeaders[0]?.["Cookie"]).toContain("auth=token123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("HttpClient - Caching", () => {
  test("caches GET responses when cacheTtl > 0", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      callCount++;
      return mockFetchResponse("cached body");
    });

    try {
      const client = new HttpClient({ cacheTtl: 60, timeout: 5000 });
      const r1 = await client.get("http://example.com/cached");
      const r2 = await client.get("http://example.com/cached");
      expect(callCount).toBe(1);
      expect(r1.body).toBe(r2.body);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("bypasses cache with noCache option", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      callCount++;
      return mockFetchResponse("body");
    });

    try {
      const client = new HttpClient({ cacheTtl: 60, timeout: 5000 });
      await client.get("http://example.com/nocache", { noCache: true });
      await client.get("http://example.com/nocache", { noCache: true });
      expect(callCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("HttpClient - Referer", () => {
  test("sets Referer header from options", async () => {
    const capturedHeaders: Record<string, string>[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const hdrs = init?.headers as Record<string, string> | undefined;
      if (hdrs) capturedHeaders.push(hdrs);
      return mockFetchResponse("ok");
    });

    try {
      const client = new HttpClient({
        referer: "https://referrer.example.com/",
        timeout: 5000,
      });
      await client.get("http://example.com/");
      expect(capturedHeaders[0]?.["Referer"]).toBe("https://referrer.example.com/");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
