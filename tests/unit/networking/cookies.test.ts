import { describe, expect, test, beforeEach } from "bun:test";
import {
  parseNetscapeCookieFile,
  serializeNetscapeCookieFile,
  CookieJar,
  type Cookie,
} from "../../../src/networking/cookies";

const NETSCAPE_FILE = `# Netscape HTTP Cookie File
# This is a comment
.example.com	TRUE	/	FALSE	1893456000	session	abc123
.youtube.com	TRUE	/	TRUE	1893456000	VISITOR_INFO1_LIVE	xyz789
.example.com	TRUE	/path	FALSE	0	tracker	val1
`;

describe("parseNetscapeCookieFile", () => {
  test("parses valid Netscape cookie file", () => {
    const cookies = parseNetscapeCookieFile(NETSCAPE_FILE);
    expect(cookies).toHaveLength(3);
  });

  test("parses domain correctly", () => {
    const cookies = parseNetscapeCookieFile(NETSCAPE_FILE);
    expect(cookies[0].domain).toBe(".example.com");
    expect(cookies[1].domain).toBe(".youtube.com");
  });

  test("parses includeSubdomains flag", () => {
    const cookies = parseNetscapeCookieFile(NETSCAPE_FILE);
    expect(cookies[0].includeSubdomains).toBe(true);
    expect(cookies[1].includeSubdomains).toBe(true);
  });

  test("parses secure flag", () => {
    const cookies = parseNetscapeCookieFile(NETSCAPE_FILE);
    expect(cookies[0].secure).toBe(false);
    expect(cookies[1].secure).toBe(true);
  });

  test("parses expiry", () => {
    const cookies = parseNetscapeCookieFile(NETSCAPE_FILE);
    expect(cookies[0].expires).toBe(1893456000);
    expect(cookies[2].expires).toBe(0);
  });

  test("parses name and value", () => {
    const cookies = parseNetscapeCookieFile(NETSCAPE_FILE);
    expect(cookies[0].name).toBe("session");
    expect(cookies[0].value).toBe("abc123");
    expect(cookies[1].name).toBe("VISITOR_INFO1_LIVE");
    expect(cookies[1].value).toBe("xyz789");
  });

  test("skips comment lines", () => {
    const cookies = parseNetscapeCookieFile(NETSCAPE_FILE);
    expect(cookies.every((c) => !c.name.startsWith("#"))).toBe(true);
  });

  test("skips empty lines", () => {
    const cookies = parseNetscapeCookieFile("\n\n\n");
    expect(cookies).toHaveLength(0);
  });

  test("skips malformed lines", () => {
    const bad = "not\tenough\tfields\n";
    const cookies = parseNetscapeCookieFile(bad);
    expect(cookies).toHaveLength(0);
  });
});

describe("serializeNetscapeCookieFile", () => {
  test("round-trips cookies", () => {
    const original = parseNetscapeCookieFile(NETSCAPE_FILE);
    const serialized = serializeNetscapeCookieFile(original);
    const reparsed = parseNetscapeCookieFile(serialized);
    expect(reparsed).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(reparsed[i].name).toBe(original[i].name);
      expect(reparsed[i].value).toBe(original[i].value);
      expect(reparsed[i].domain).toBe(original[i].domain);
    }
  });

  test("includes header comment", () => {
    const serialized = serializeNetscapeCookieFile([]);
    expect(serialized).toContain("# Netscape HTTP Cookie File");
  });
});

describe("CookieJar", () => {
  let jar: CookieJar;
  const futureExpiry = Math.floor(Date.now() / 1000) + 86400;
  const pastExpiry = Math.floor(Date.now() / 1000) - 1;

  beforeEach(() => {
    jar = new CookieJar();
  });

  test("load parses netscape file", () => {
    jar.load(NETSCAPE_FILE);
    expect(jar.size()).toBe(3);
  });

  test("set and get cookie", () => {
    const cookie: Cookie = {
      domain: "example.com",
      includeSubdomains: false,
      path: "/",
      secure: false,
      expires: futureExpiry,
      name: "test",
      value: "hello",
    };
    jar.set(cookie);
    const retrieved = jar.get("example.com", "/", "test");
    expect(retrieved).toBeDefined();
    expect(retrieved?.value).toBe("hello");
  });

  test("get returns undefined for expired cookies", () => {
    const cookie: Cookie = {
      domain: "example.com",
      includeSubdomains: false,
      path: "/",
      secure: false,
      expires: pastExpiry,
      name: "expired",
      value: "yes",
    };
    jar.set(cookie);
    const retrieved = jar.get("example.com", "/", "expired");
    expect(retrieved).toBeUndefined();
  });

  test("set overwrites existing cookie with same key", () => {
    const cookie: Cookie = {
      domain: "example.com",
      includeSubdomains: false,
      path: "/",
      secure: false,
      expires: futureExpiry,
      name: "mykey",
      value: "v1",
    };
    jar.set(cookie);
    jar.set({ ...cookie, value: "v2" });
    expect(jar.size()).toBe(1);
    expect(jar.get("example.com", "/", "mykey")?.value).toBe("v2");
  });

  test("getForUrl matches by host", () => {
    jar.load(NETSCAPE_FILE);
    const cookies = jar.getForUrl("https://www.example.com/");
    expect(cookies.some((c) => c.name === "session")).toBe(true);
  });

  test("getForUrl excludes secure cookies on http", () => {
    jar.set({
      domain: "example.com",
      includeSubdomains: false,
      path: "/",
      secure: true,
      expires: futureExpiry,
      name: "secureOnly",
      value: "s",
    });
    const httpCookies = jar.getForUrl("http://example.com/");
    expect(httpCookies.some((c) => c.name === "secureOnly")).toBe(false);
    const httpsCookies = jar.getForUrl("https://example.com/");
    expect(httpsCookies.some((c) => c.name === "secureOnly")).toBe(true);
  });

  test("getForUrl filters by path", () => {
    jar.set({
      domain: "example.com",
      includeSubdomains: false,
      path: "/api",
      secure: false,
      expires: futureExpiry,
      name: "apiOnly",
      value: "a",
    });
    const root = jar.getForUrl("http://example.com/");
    expect(root.some((c) => c.name === "apiOnly")).toBe(false);
    const api = jar.getForUrl("http://example.com/api/v1");
    expect(api.some((c) => c.name === "apiOnly")).toBe(true);
  });

  test("getCookieHeader returns key=value pairs", () => {
    jar.set({
      domain: "example.com",
      includeSubdomains: false,
      path: "/",
      secure: false,
      expires: futureExpiry,
      name: "a",
      value: "1",
    });
    jar.set({
      domain: "example.com",
      includeSubdomains: false,
      path: "/",
      secure: false,
      expires: futureExpiry,
      name: "b",
      value: "2",
    });
    const header = jar.getCookieHeader("http://example.com/");
    expect(header).toContain("a=1");
    expect(header).toContain("b=2");
  });

  test("removeExpired clears expired cookies", () => {
    jar.set({
      domain: "example.com",
      includeSubdomains: false,
      path: "/",
      secure: false,
      expires: pastExpiry,
      name: "dead",
      value: "x",
    });
    jar.set({
      domain: "example.com",
      includeSubdomains: false,
      path: "/",
      secure: false,
      expires: futureExpiry,
      name: "alive",
      value: "y",
    });
    expect(jar.size()).toBe(2);
    jar.removeExpired();
    expect(jar.size()).toBe(1);
  });

  test("clear empties the jar", () => {
    jar.load(NETSCAPE_FILE);
    jar.clear();
    expect(jar.size()).toBe(0);
  });

  test("session cookies (expires=0) never expire", () => {
    jar.set({
      domain: "example.com",
      includeSubdomains: false,
      path: "/",
      secure: false,
      expires: 0,
      name: "session",
      value: "s",
    });
    const retrieved = jar.get("example.com", "/", "session");
    expect(retrieved).toBeDefined();
  });
});
