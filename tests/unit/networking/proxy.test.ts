import { describe, expect, test } from "bun:test";
import {
  parseProxyUrl,
  buildProxyAuthHeader,
  createProxyAgent,
  buildConnectRequest,
  ProxyParseError,
} from "../../../src/networking/proxy";

describe("parseProxyUrl", () => {
  test("parses http proxy", () => {
    const proxy = parseProxyUrl("http://proxy.example.com:8080");
    expect(proxy.protocol).toBe("http");
    expect(proxy.host).toBe("proxy.example.com");
    expect(proxy.port).toBe(8080);
    expect(proxy.username).toBeUndefined();
    expect(proxy.password).toBeUndefined();
  });

  test("parses https proxy", () => {
    const proxy = parseProxyUrl("https://proxy.example.com:443");
    expect(proxy.protocol).toBe("https");
    expect(proxy.port).toBe(443);
  });

  test("parses socks5 proxy", () => {
    const proxy = parseProxyUrl("socks5://127.0.0.1:1080");
    expect(proxy.protocol).toBe("socks5");
    expect(proxy.host).toBe("127.0.0.1");
    expect(proxy.port).toBe(1080);
  });

  test("parses proxy with username and password", () => {
    const proxy = parseProxyUrl("http://user:pass@proxy.example.com:8080");
    expect(proxy.username).toBe("user");
    expect(proxy.password).toBe("pass");
  });

  test("parses proxy with url-encoded credentials", () => {
    const proxy = parseProxyUrl("http://my%40user:p%40ss@proxy.example.com:8080");
    expect(proxy.username).toBe("my@user");
    expect(proxy.password).toBe("p@ss");
  });

  test("defaults port for socks5 when omitted", () => {
    const proxy = parseProxyUrl("socks5://127.0.0.1");
    expect(proxy.port).toBe(1080);
  });

  test("throws ProxyParseError for invalid URL", () => {
    expect(() => parseProxyUrl("not a url")).toThrow(ProxyParseError);
  });

  test("throws ProxyParseError for unsupported protocol", () => {
    expect(() => parseProxyUrl("ftp://proxy.example.com:21")).toThrow(ProxyParseError);
  });
});

describe("buildProxyAuthHeader", () => {
  test("returns Basic auth header when credentials present", () => {
    const proxy = parseProxyUrl("http://user:pass@proxy.example.com:8080");
    const header = buildProxyAuthHeader(proxy);
    expect(header).toBe(`Basic ${btoa("user:pass")}`);
  });

  test("returns undefined when no credentials", () => {
    const proxy = parseProxyUrl("http://proxy.example.com:8080");
    const header = buildProxyAuthHeader(proxy);
    expect(header).toBeUndefined();
  });

  test("handles password-less username", () => {
    const proxy = parseProxyUrl("http://user@proxy.example.com:8080");
    const header = buildProxyAuthHeader(proxy);
    expect(header).toBe(`Basic ${btoa("user:")}`);
  });
});

describe("createProxyAgent", () => {
  test("returns agent with parsed proxy", () => {
    const agent = createProxyAgent("http://proxy.example.com:8080");
    expect(agent.proxy.host).toBe("proxy.example.com");
  });

  test("getProxyUrl reconstructs proxy URL without credentials", () => {
    const agent = createProxyAgent("http://proxy.example.com:8080");
    expect(agent.getProxyUrl()).toBe("http://proxy.example.com:8080");
  });

  test("getProxyUrl includes credentials when present", () => {
    const agent = createProxyAgent("http://user:pass@proxy.example.com:8080");
    expect(agent.getProxyUrl()).toContain("user");
  });

  test("getAuthHeader returns header when credentials present", () => {
    const agent = createProxyAgent("http://user:pass@proxy.example.com:8080");
    expect(agent.getAuthHeader()).toBeDefined();
  });

  test("getAuthHeader returns undefined when no credentials", () => {
    const agent = createProxyAgent("http://proxy.example.com:8080");
    expect(agent.getAuthHeader()).toBeUndefined();
  });
});

describe("buildConnectRequest", () => {
  test("builds valid CONNECT request", () => {
    const proxy = parseProxyUrl("http://proxy.example.com:8080");
    const req = buildConnectRequest({
      targetHost: "api.example.com",
      targetPort: 443,
      proxy,
    });
    expect(req).toContain("CONNECT api.example.com:443 HTTP/1.1");
    expect(req).toContain("Host: api.example.com:443");
  });

  test("includes Proxy-Authorization when credentials present", () => {
    const proxy = parseProxyUrl("http://user:pass@proxy.example.com:8080");
    const req = buildConnectRequest({
      targetHost: "api.example.com",
      targetPort: 443,
      proxy,
    });
    expect(req).toContain("Proxy-Authorization: Basic");
  });

  test("omits Proxy-Authorization when no credentials", () => {
    const proxy = parseProxyUrl("http://proxy.example.com:8080");
    const req = buildConnectRequest({
      targetHost: "api.example.com",
      targetPort: 443,
      proxy,
    });
    expect(req).not.toContain("Proxy-Authorization");
  });
});
