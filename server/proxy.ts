import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

// GET /proxy?url=<encoded>&h=<base64url(JSON headers)>
// Adds CORS + custom headers (Referer, User-Agent...) and rewrites HLS playlists
// so every segment/key/sub-playlist also goes through the proxy with the same headers.

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

export function proxyUrl(target: string, h?: string) {
  return `/proxy?url=${encodeURIComponent(target)}${h ? `&h=${h}` : ""}`;
}

function decodeHeaders(h: string | null): Record<string, string> {
  if (!h) return {};
  try {
    return JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function rewritePlaylist(body: string, base: string, h: string | null) {
  const abs = (u: string) => proxyUrl(new URL(u, base).toString(), h ?? undefined);
  return body
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${abs(u)}"`);
      return abs(t);
    })
    .join("\n");
}

export async function handleProxy(req: IncomingMessage, res: ServerResponse) {
  const reqUrl = new URL(req.url ?? "", "http://localhost");
  const target = reqUrl.searchParams.get("url");
  const h = reqUrl.searchParams.get("h");

  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.end();
  if (!target || !/^https?:\/\//i.test(target)) {
    res.statusCode = 400;
    return res.end("missing/invalid url");
  }

  const headers: Record<string, string> = { "User-Agent": DEFAULT_UA, ...decodeHeaders(h) };
  if (req.headers.range) headers.Range = req.headers.range;

  const ac = new AbortController();
  req.on("close", () => ac.abort());

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers, redirect: "follow", signal: ac.signal });
  } catch (e) {
    res.statusCode = 502;
    return res.end(`upstream error: ${(e as Error).message}`);
  }

  const ct = upstream.headers.get("content-type") ?? "";
  const finalUrl = upstream.url || target;
  const looksHls = /mpegurl/i.test(ct) || /\.m3u8(\?|$)/i.test(finalUrl);

  res.statusCode = upstream.status;

  if (looksHls) {
    const text = await upstream.text();
    if (text.trimStart().startsWith("#EXTM3U") && text.includes("#EXT-X-")) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache");
      return res.end(rewritePlaylist(text, finalUrl, h));
    }
    if (ct) res.setHeader("Content-Type", ct);
    return res.end(text);
  }

  // fetch() transparently decompresses gzip/br bodies, so the upstream content-length
  // (compressed size) would truncate the decoded body we stream back.
  const encoded = !!upstream.headers.get("content-encoding");
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    if (encoded && (k === "content-length" || k === "content-range")) continue;
    const v = upstream.headers.get(k);
    if (v) res.setHeader(k, v);
  }
  if (!upstream.body) return res.end();
  Readable.fromWeb(upstream.body as any)
    .on("error", () => res.destroy())
    .pipe(res);
}
