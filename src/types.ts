export type Headers = Record<string, string>;

/** Something playable in a multiview slot. */
export interface Channel {
  id: string;
  name: string;
  url: string;
  subtitle?: string;
  logo?: string;
  group?: string;
  headers?: Headers;
  sourceId: string;
  /** "youtube": plays in the embedded YouTube player instead of ours. */
  kind?: "youtube";
  /** ESPN game this stream shows (score, box score, markets in match mode). */
  game?: GameRef | null;
  // per-slot audio (multiview)
  volume?: number;
  muted?: boolean;
}

export interface GameRef {
  league: string; // ESPN path, e.g. "basketball/nba"
  id: string;
}

export interface Source {
  id: string;
  kind: "m3u" | "addon" | "xtream";
  name: string;
  /** Xtream: server base URL (http://host[:port]). */
  url: string;
  /** Xtream only; the password lives in secure storage (lib/secrets). */
  username?: string;
  /** Simultaneous streams the plan allows (Xtream reports it on login). */
  maxConnections?: number;
}

export type PosterShape = "poster" | "landscape" | "square";

export interface AddonCatalog {
  key: string;
  sourceId: string;
  base: string;
  type: string;
  id: string;
  name: string;
  browsable: boolean; // no required extras -> can be shown on Home
  search: boolean;
  skip: boolean;
}

export interface MetaItem {
  id: string;
  type: string;
  name: string;
  base: string;
  sourceId: string;
  poster?: string;
  posterShape?: PosterShape;
  background?: string;
  logo?: string;
  description?: string;
  genres?: string[];
  releaseInfo?: string;
}

export interface StreamOption {
  name: string;
  title: string;
  url?: string;
  externalUrl?: string;
  headers?: Headers;
  note?: string;
}

export interface LoadState<T> {
  status: "loading" | "ok" | "error";
  data?: T;
  error?: string;
}

export type View =
  | { name: "home" }
  | { name: "catalog"; key: string }
  | { name: "detail"; item: MetaItem }
  | { name: "channels"; sourceId?: string }
  | { name: "sources" }
  | { name: "watch" };

export type Layout = "1" | "2" | "2x2" | "1+3" | "3x3";

export const LAYOUT_SLOTS: Record<Layout, number> = { "1": 1, "2": 2, "2x2": 4, "1+3": 4, "3x3": 9 };

/** Auto-grow order when adding a stream and every slot is taken. */
export const GROW_ORDER: Layout[] = ["1", "2", "2x2", "3x3"];
