import { CookieJar } from "./cookies";
import { getRoundRobinUserAgent } from "./user-agents";
import { createProxyAgent, type ProxyAgent } from "./proxy";

export interface CacheEntry {
  body: string;
  headers: Record<string, string>;
  status: number;
  expiresAt: number;
}

export interface RateLimiter {
  requestsPerSecond: number;
  lastRequestTime: number;
  queue: Array<() => void>;
}

export interface HttpClientOptions {
  userAgent?: string;
  rotateUserAgent?: boolean;
  referer?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  maxRedirects?: number;
  requestsPerSecond?: number;
  cacheTtl?: number;
  cookieJar?: CookieJar;
  proxyUrl?: string;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  timeout?: number;
  maxRetries?: number;
  noCache?: boolean;
  followRedirects?: boolean;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  url: string;
  ok: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export class HttpClient {
  private options: Required<HttpClientOptions>;
  private cache: Map<string, CacheEntry> = new Map();
  private rateLimiter: RateLimiter;
  private proxyAgent: ProxyAgent | undefined;

  constructor(options: HttpClientOptions = {}) {
    this.options = {
      userAgent: options.userAgent ?? getRoundRobinUserAgent(),
      rotateUserAgent: options.rotateUserAgent ?? false,
      referer: options.referer ?? "",
      timeout: options.timeout ?? 30_000,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1_000,
      maxRedirects: options.maxRedirects ?? 10,
      requestsPerSecond: options.requestsPerSecond ?? 0,
      cacheTtl: options.cacheTtl ?? 0,
      cookieJar: options.cookieJar ?? new CookieJar(),
      proxyUrl: options.proxyUrl ?? "",
      headers: options.headers ?? {},
    };

    this.rateLimiter = {
      requestsPerSecond: this.options.requestsPerSecond,
      lastRequestTime: 0,
      queue: [],
    };

    if (this.options.proxyUrl) {
      this.proxyAgent = createProxyAgent(this.options.proxyUrl);
    }
  }

  private async waitForRateLimit(): Promise<void> {
    if (this.rateLimiter.requestsPerSecond <= 0) return;
    const minInterval = 1000 / this.rateLimiter.requestsPerSecond;
    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastRequestTime;
    if (elapsed < minInterval) {
      await sleep(minInterval - elapsed);
    }
    this.rateLimiter.lastRequestTime = Date.now();
  }

  private getCacheKey(url: string, method: string): string {
    return `${method}:${url}`;
  }

  private getFromCache(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry;
  }

  private setCache(key: string, entry: Omit<CacheEntry, "expiresAt">): void {
    if (this.options.cacheTtl <= 0) return;
    this.cache.set(key, {
      ...entry,
      expiresAt: Date.now() + this.options.cacheTtl * 1000,
    });
  }

  private buildHeaders(
    url: string,
    extra: Record<string, string> = {},
  ): Record<string, string> {
    const ua = this.options.rotateUserAgent
      ? getRoundRobinUserAgent()
      : this.options.userAgent;

    const headers: Record<string, string> = {
      "User-Agent": ua,
      ...this.options.headers,
      ...extra,
    };

    if (this.options.referer) {
      headers["Referer"] = this.options.referer;
    }

    const cookieHeader = this.options.cookieJar.getCookieHeader(url);
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }

    if (this.proxyAgent) {
      const authHeader = this.proxyAgent.getAuthHeader();
      if (authHeader) {
        headers["Proxy-Authorization"] = authHeader;
      }
    }

    return headers;
  }

  async request(url: string, opts: RequestOptions = {}): Promise<HttpResponse> {
    const method = opts.method ?? "GET";
    const cacheKey = this.getCacheKey(url, method);

    if (!opts.noCache && method === "GET" && this.options.cacheTtl > 0) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          status: cached.status,
          headers: cached.headers,
          body: cached.body,
          url,
          ok: cached.status >= 200 && cached.status < 300,
        };
      }
    }

    await this.waitForRateLimit();

    const timeout = opts.timeout ?? this.options.timeout;
    const maxRetries = opts.maxRetries ?? this.options.maxRetries;

    let redirectUrl = url;
    let redirectCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.options.retryDelay * Math.pow(2, attempt - 1);
        await sleep(delay);
        await this.waitForRateLimit();
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const fetchOpts: RequestInit = {
          method,
          headers: this.buildHeaders(redirectUrl, opts.headers ?? {}),
          signal: controller.signal,
          redirect: "manual",
        };

        if (opts.body) {
          fetchOpts.body = opts.body;
        }

        const response = await fetch(redirectUrl, fetchOpts);
        clearTimeout(timer);

        const isRedirect =
          response.status >= 300 &&
          response.status < 400 &&
          response.headers.get("location");

        if (
          isRedirect &&
          (opts.followRedirects !== false) &&
          redirectCount < this.options.maxRedirects
        ) {
          const location = response.headers.get("location")!;
          redirectUrl = new URL(location, redirectUrl).toString();
          redirectCount++;
          attempt = -1;
          continue;
        }

        if (isRetryable(response.status) && attempt < maxRetries) {
          const retryAfter = response.headers.get("retry-after");
          if (retryAfter) {
            await sleep(parseInt(retryAfter, 10) * 1000);
          }
          continue;
        }

        const body = await response.text();
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        const result: HttpResponse = {
          status: response.status,
          headers,
          body,
          url: redirectUrl,
          ok: response.status >= 200 && response.status < 300,
        };

        if (method === "GET" && result.ok) {
          this.setCache(cacheKey, {
            body: result.body,
            headers: result.headers,
            status: result.status,
          });
        }

        return result;
      } catch (err) {
        clearTimeout(timer);
        if (attempt === maxRetries) {
          throw new Error(
            `HTTP request failed after ${maxRetries + 1} attempts: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    throw new Error(`HTTP request failed: exhausted retries for ${url}`);
  }

  async get(url: string, opts: Omit<RequestOptions, "method"> = {}): Promise<HttpResponse> {
    return this.request(url, { ...opts, method: "GET" });
  }

  async post(
    url: string,
    body: string | Uint8Array,
    opts: Omit<RequestOptions, "method" | "body"> = {},
  ): Promise<HttpResponse> {
    return this.request(url, { ...opts, method: "POST", body });
  }

  async getJson<T>(url: string, opts: Omit<RequestOptions, "method"> = {}): Promise<T> {
    const res = await this.get(url, {
      ...opts,
      headers: { Accept: "application/json", ...opts.headers },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching JSON from ${url}`);
    }
    return JSON.parse(res.body) as T;
  }

  async getText(url: string, opts: Omit<RequestOptions, "method"> = {}): Promise<string> {
    const res = await this.get(url, opts);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching text from ${url}`);
    }
    return res.body;
  }

  clearCache(): void {
    this.cache.clear();
  }

  setCookieJar(jar: CookieJar): void {
    this.options.cookieJar = jar;
  }

  getCookieJar(): CookieJar {
    return this.options.cookieJar;
  }
}
