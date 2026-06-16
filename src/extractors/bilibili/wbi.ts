import { createHash } from "node:crypto";

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
  28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
  54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

interface NavData {
  data: {
    wbi_img: {
      img_url: string;
      sub_url: string;
    };
  };
}

function extractKey(url: string): string {
  return url.split("/").pop()?.replace(/\.\w+$/, "") ?? "";
}

function getMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i]).join("").slice(0, 32);
}

function filterNonPrintable(str: string): string {
  return str.replace(/[!'"()\\s]/g, "");
}

export async function fetchMixinKey(): Promise<string> {
  const resp = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.bilibili.com",
    },
  });
  if (!resp.ok) throw new Error(`wbi: nav request failed: ${resp.status}`);
  const data = (await resp.json()) as NavData;
  const imgKey = extractKey(data.data.wbi_img.img_url);
  const subKey = extractKey(data.data.wbi_img.sub_url);
  return getMixinKey(imgKey, subKey);
}

export function signWbi(params: Record<string, string | number>, mixinKey: string): Record<string, string> {
  const wts = Math.floor(Date.now() / 1000);
  const signed: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    signed[k] = filterNonPrintable(String(v));
  }
  signed["wts"] = String(wts);

  const query = Object.keys(signed)
    .sort()
    .map((k) => `${k}=${signed[k]}`)
    .join("&");

  const wRid = createHash("md5").update(query + mixinKey).digest("hex");
  return { ...signed, w_rid: wRid };
}
