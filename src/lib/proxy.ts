import type { Headers } from "../types";

function b64url(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Same-origin URL that fetches `url` through the local proxy (CORS + custom headers). */
export function proxied(url: string, headers?: Headers) {
  const h = headers && Object.keys(headers).length ? `&h=${b64url(JSON.stringify(headers))}` : "";
  return `/proxy?url=${encodeURIComponent(url)}${h}`;
}

export async function fetchText(url: string, headers?: Headers) {
  const res = await fetch(proxied(url, headers));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url));
}
