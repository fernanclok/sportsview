import type { Channel } from "../types";
import { fetchJson } from "./proxy";

// Xtream Codes API: player_api.php with username/password. Live channels are played
// as HLS (/live/user/pass/id.m3u8); the server redirects to its edge node.

interface UserInfo {
  auth: number;
  status: string;
  exp_date: string | null;
  max_connections: string;
  active_cons: string;
}
interface Category { category_id: string; category_name: string }
interface LiveStream { stream_id: number; name: string; stream_icon?: string; category_id: string | null }

export function normalizeServer(raw: string) {
  const s = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(s) ? s : `http://${s}`;
}

const api = (server: string, user: string, pass: string, action?: string) =>
  `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}${action ? `&action=${action}` : ""}`;

export async function xtreamLogin(server: string, user: string, pass: string) {
  const res = await fetchJson<{ user_info?: UserInfo }>(api(server, user, pass));
  const u = res.user_info;
  if (!u || Number(u.auth) !== 1) throw new Error("Usuario o contraseña incorrectos");
  if (u.status !== "Active") throw new Error(`Cuenta ${u.status}`);
  return {
    maxConnections: Number(u.max_connections) || 1,
    expires: u.exp_date ? new Date(Number(u.exp_date) * 1000) : null,
  };
}

export async function fetchXtreamChannels(server: string, user: string, pass: string, sourceId: string) {
  const [cats, streams] = await Promise.all([
    fetchJson<Category[]>(api(server, user, pass, "get_live_categories")),
    fetchJson<LiveStream[]>(api(server, user, pass, "get_live_streams")),
  ]);
  const catName = new Map(cats.map((c) => [c.category_id, c.category_name]));
  const base = `${server}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}`;
  const out: Channel[] = [];
  for (const s of streams) {
    // Providers use "##### 4K #####" entries as section separators; they aren't channels.
    if (!s.name || /^\s*#{3,}/.test(s.name)) continue;
    out.push({
      id: `${sourceId}:${s.stream_id}`,
      name: s.name.trim(),
      url: `${base}/${s.stream_id}.m3u8`,
      logo: s.stream_icon || undefined,
      group: catName.get(s.category_id ?? "") ?? undefined,
      sourceId,
    });
  }
  return out;
}

interface EpgListing {
  title?: string;
  description?: string;
  start_timestamp?: string;
  stop_timestamp?: string;
}

// Xtream EPG text is usually base64; some panels send it plain.
function epgText(s?: string) {
  if (!s) return "";
  try {
    const bytes = Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return s;
  }
}

/** Stream id of an Xtream live URL (/live/user/pass/123.m3u8). */
export const xtreamStreamId = (url: string) => url.match(/\/live\/[^/]+\/[^/]+\/(\d+)\.\w+/)?.[1] ?? null;

/** What a channel is airing now (title + description), from the provider's guide. Empty if it has no EPG. */
export async function xtreamNowPlaying(server: string, user: string, pass: string, streamId: string): Promise<string> {
  const r = await fetchJson<{ epg_listings?: EpgListing[] }>(`${api(server, user, pass, "get_short_epg")}&stream_id=${streamId}&limit=3`);
  const now = Date.now() / 1000;
  const list = r.epg_listings ?? [];
  const cur = list.find((l) => Number(l.start_timestamp) <= now && now < Number(l.stop_timestamp)) ?? list[0];
  return cur ? `${epgText(cur.title)} ${epgText(cur.description)}`.trim() : "";
}
