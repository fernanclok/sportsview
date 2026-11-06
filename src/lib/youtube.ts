import { fetchJson, fetchText } from "./proxy";

// YouTube can't be played through our own player (it blocks extracting the stream),
// so YouTube slots embed the official IFrame player instead.

const ID = /^[\w-]{11}$/;

export function isYouTubeUrl(raw: string) {
  try {
    const h = new URL(raw.trim()).hostname.replace(/^(www|m|music)\./, "");
    return h === "youtube.com" || h === "youtu.be" || h === "youtube-nocookie.com";
  } catch {
    return false;
  }
}

/** Video id from watch?v=, youtu.be/, /live/, /shorts/, /embed/ links; null for channel links. */
export function youtubeId(raw: string): string | null {
  if (!isYouTubeUrl(raw)) return null;
  const u = new URL(raw.trim());
  const v = u.searchParams.get("v");
  if (v && ID.test(v)) return v;
  const parts = u.pathname.split("/").filter(Boolean);
  if (u.hostname.endsWith("youtu.be") && ID.test(parts[0] ?? "")) return parts[0];
  if (["live", "shorts", "embed", "v"].includes(parts[0]) && ID.test(parts[1] ?? "")) return parts[1];
  return null;
}

/** Resolves any YouTube link (including youtube.com/@channel/live) to a video + its title. */
export async function resolveYouTube(raw: string) {
  let id = youtubeId(raw);
  if (!id) {
    // Channel link: its /live page points (canonical) to the current live video.
    const u = new URL(raw.trim());
    const path = u.pathname.replace(/\/+$/, "");
    const page = await fetchText(`https://www.youtube.com${path.endsWith("/live") ? path : `${path}/live`}`);
    id = page.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1] ?? null;
    if (!id) throw new Error("Ese canal no está en directo ahora");
  }
  const url = `https://www.youtube.com/watch?v=${id}`;
  try {
    const o = await fetchJson<{ title: string; author_name?: string; thumbnail_url?: string }>(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    );
    return { id, url, title: o.title, author: o.author_name, thumbnail: o.thumbnail_url };
  } catch {
    return { id, url, title: "YouTube", author: undefined, thumbnail: undefined };
  }
}
