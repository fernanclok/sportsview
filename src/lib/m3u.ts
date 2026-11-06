import type { Channel, Headers } from "../types";

const VLC_OPTS: Record<string, string> = {
  "http-referrer": "Referer",
  "http-referer": "Referer",
  "http-user-agent": "User-Agent",
  "http-origin": "Origin",
};

// Kodi style: http://host/stream.m3u8|Referer=https://x&User-Agent=y
function splitPipeHeaders(raw: string): { url: string; headers: Headers } {
  const [url, opts] = raw.split("|");
  const headers: Headers = {};
  if (opts) {
    for (const kv of opts.split("&")) {
      const i = kv.indexOf("=");
      if (i > 0) headers[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    }
  }
  return { url: url.trim(), headers };
}

// Display name = text after the first comma that is outside quotes.
function extinfName(line: string) {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === "," && !inQuotes) return line.slice(i + 1).trim();
  }
  return "";
}

export function parseM3U(text: string, sourceId: string): Channel[] {
  const out: Channel[] = [];
  let attrs: Record<string, string> = {};
  let name = "";
  let headers: Headers = {};
  let group = "";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      attrs = {};
      for (const m of line.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1].toLowerCase()] = m[2];
      name = extinfName(line);
      headers = {};
      group = attrs["group-title"] ?? "";
    } else if (line.startsWith("#EXTVLCOPT:")) {
      const [k, ...v] = line.slice(11).split("=");
      const h = VLC_OPTS[k.toLowerCase()];
      if (h) headers[h] = v.join("=");
    } else if (line.startsWith("#EXTHTTP:")) {
      try {
        Object.assign(headers, JSON.parse(line.slice(9)));
      } catch {}
    } else if (line.startsWith("#EXTGRP:")) {
      group = line.slice(8).trim();
    } else if (!line.startsWith("#")) {
      const { url, headers: pipe } = splitPipeHeaders(line);
      out.push({
        id: `${sourceId}:${out.length}`,
        name: name || attrs["tvg-name"] || url,
        url,
        logo: attrs["tvg-logo"] || undefined,
        group: group || undefined,
        headers: { ...headers, ...pipe },
        sourceId,
      });
      attrs = {};
      name = "";
      headers = {};
      group = "";
    }
  }
  return out;
}
