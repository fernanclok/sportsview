import type { AddonCatalog, MetaItem, PosterShape, StreamOption } from "../types";
import { fetchJson } from "./proxy";

// Stremio addon protocol: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md

interface ManifestCatalog {
  type: string;
  id: string;
  name?: string;
  extra?: { name: string; isRequired?: boolean }[];
  extraRequired?: string[];
  extraSupported?: string[];
}

export interface Manifest {
  id?: string;
  name: string;
  description?: string;
  logo?: string;
  catalogs?: ManifestCatalog[];
}

interface RawMeta {
  id: string;
  type: string;
  name: string;
  poster?: string;
  posterShape?: PosterShape;
  background?: string;
  logo?: string;
  description?: string;
  genres?: string[];
  releaseInfo?: string | number;
}

interface RawStream {
  url?: string;
  externalUrl?: string;
  infoHash?: string;
  ytId?: string;
  name?: string;
  title?: string;
  description?: string;
  behaviorHints?: { proxyHeaders?: { request?: Record<string, string> } };
}

export function addonBase(url: string) {
  return url
    .trim()
    .replace(/^stremio:\/\//i, "https://")
    .replace(/\/manifest\.json.*$/i, "")
    .replace(/\/+$/, "");
}

export const isAddonUrl = (url: string) => /manifest\.json/i.test(url) || /^stremio:\/\//i.test(url);

export async function fetchManifest(url: string) {
  return fetchJson<Manifest>(`${addonBase(url)}/manifest.json`);
}

export function catalogsOf(manifest: Manifest, url: string, sourceId: string): AddonCatalog[] {
  const base = addonBase(url);
  return (manifest.catalogs ?? []).map((c) => {
    const extras = c.extra?.map((e) => e.name) ?? c.extraSupported ?? [];
    const required = c.extra?.filter((e) => e.isRequired).map((e) => e.name) ?? c.extraRequired ?? [];
    return {
      key: `${sourceId}:${c.type}:${c.id}`,
      sourceId,
      base,
      type: c.type,
      id: c.id,
      name: c.name ?? c.id,
      browsable: required.length === 0,
      search: extras.includes("search"),
      skip: extras.includes("skip"),
    };
  });
}

const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as Partial<T>;

function toItem(m: RawMeta, base: string, sourceId: string): MetaItem {
  return {
    id: m.id,
    type: m.type,
    name: m.name,
    base,
    sourceId,
    poster: m.poster,
    posterShape: m.posterShape,
    background: m.background,
    logo: m.logo,
    description: m.description,
    genres: m.genres,
    releaseInfo: m.releaseInfo != null ? String(m.releaseInfo) : undefined,
  };
}

export async function fetchCatalog(cat: AddonCatalog, extra: Record<string, string> = {}): Promise<MetaItem[]> {
  const ex = Object.entries(extra)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const { metas = [] } = await fetchJson<{ metas?: RawMeta[] }>(
    `${cat.base}/catalog/${cat.type}/${encodeURIComponent(cat.id)}${ex ? `/${ex}` : ""}.json`,
  );
  return metas.filter((m) => m?.id && m.name).map((m) => toItem(m, cat.base, cat.sourceId));
}

/** Full meta (background, summary…). Falls back to the catalog preview if the addon has no meta resource. */
export async function fetchMeta(item: MetaItem): Promise<MetaItem> {
  try {
    const { meta } = await fetchJson<{ meta?: RawMeta }>(
      `${item.base}/meta/${item.type}/${encodeURIComponent(item.id)}.json`,
    );
    if (meta) return { ...item, ...defined(toItem(meta, item.base, item.sourceId)) };
  } catch {}
  return item;
}

export async function fetchStreams(item: MetaItem): Promise<StreamOption[]> {
  const { streams = [] } = await fetchJson<{ streams?: RawStream[] }>(
    `${item.base}/stream/${item.type}/${encodeURIComponent(item.id)}.json`,
  );
  return streams.map((s) => {
    const name = (s.name ?? "").trim();
    const desc = (s.title ?? s.description ?? "").trim();
    const opt: StreamOption = {
      name: name || desc || "Stream",
      title: name ? desc : "",
      headers: s.behaviorHints?.proxyHeaders?.request,
    };
    if (s.url && /^https?:\/\//i.test(s.url)) opt.url = s.url;
    else if (s.externalUrl && /^https?:\/\//i.test(s.externalUrl)) opt.externalUrl = s.externalUrl;
    else if (s.infoHash) opt.note = "Torrent (no soportado)";
    else if (s.ytId) opt.note = "YouTube (no soportado)";
    return opt;
  });
}
