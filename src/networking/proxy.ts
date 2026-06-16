export type ProxyProtocol = "http" | "https" | "socks5";

export interface ParsedProxy {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export class ProxyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyParseError";
  }
}

export function parseProxyUrl(proxyUrl: string): ParsedProxy {
  let url: URL;
  try {
    url = new URL(proxyUrl);
  } catch {
    throw new ProxyParseError(`Invalid proxy URL: ${proxyUrl}`);
  }

  const protocol = url.protocol.replace(":", "") as ProxyProtocol;
  if (!["http", "https", "socks5"].includes(protocol)) {
    throw new ProxyParseError(
      `Unsupported proxy protocol: ${protocol}. Supported: http, https, socks5`,
    );
  }

  const host = url.hostname;
  if (!host) {
    throw new ProxyParseError(`Proxy URL missing host: ${proxyUrl}`);
  }

  const port = url.port ? parseInt(url.port, 10) : protocol === "https" ? 443 : 1080;
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new ProxyParseError(`Invalid proxy port: ${url.port}`);
  }

  const result: ParsedProxy = { protocol, host, port };
  if (url.username) result.username = decodeURIComponent(url.username);
  if (url.password) result.password = decodeURIComponent(url.password);

  return result;
}

export function buildProxyAuthHeader(proxy: ParsedProxy): string | undefined {
  if (!proxy.username) return undefined;
  const creds = `${proxy.username}:${proxy.password ?? ""}`;
  return `Basic ${btoa(creds)}`;
}

export interface ProxyAgent {
  proxy: ParsedProxy;
  getProxyUrl(): string;
  getAuthHeader(): string | undefined;
}

export function createProxyAgent(proxyUrl: string): ProxyAgent {
  const proxy = parseProxyUrl(proxyUrl);

  return {
    proxy,
    getProxyUrl(): string {
      const auth =
        proxy.username
          ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? "")}@`
          : "";
      return `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`;
    },
    getAuthHeader(): string | undefined {
      return buildProxyAuthHeader(proxy);
    },
  };
}

export interface HttpConnectOptions {
  targetHost: string;
  targetPort: number;
  proxy: ParsedProxy;
}

export function buildConnectRequest(opts: HttpConnectOptions): string {
  const target = `${opts.targetHost}:${opts.targetPort}`;
  const authHeader = buildProxyAuthHeader(opts.proxy);
  const lines = [
    `CONNECT ${target} HTTP/1.1`,
    `Host: ${target}`,
    "Proxy-Connection: keep-alive",
  ];
  if (authHeader) {
    lines.push(`Proxy-Authorization: ${authHeader}`);
  }
  lines.push("", "");
  return lines.join("\r\n");
}

export interface Socks5ConnectOptions {
  targetHost: string;
  targetPort: number;
  proxy: ParsedProxy;
}

export function buildSocks5Greeting(proxy: ParsedProxy): Uint8Array {
  if (proxy.username) {
    return new Uint8Array([0x05, 0x02, 0x00, 0x02]);
  }
  return new Uint8Array([0x05, 0x01, 0x00]);
}

export function buildSocks5ConnectRequest(
  opts: Socks5ConnectOptions,
): Uint8Array {
  const encoder = new TextEncoder();
  const hostBytes = encoder.encode(opts.targetHost);
  const buf = new Uint8Array(4 + 1 + hostBytes.length + 2);
  let i = 0;
  buf[i++] = 0x05;
  buf[i++] = 0x01;
  buf[i++] = 0x00;
  buf[i++] = 0x03;
  buf[i++] = hostBytes.length;
  buf.set(hostBytes, i);
  i += hostBytes.length;
  const port = opts.targetPort;
  buf[i++] = (port >> 8) & 0xff;
  buf[i++] = port & 0xff;
  return buf;
}
