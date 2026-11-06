import { fetchJson } from "./proxy";
import { cached } from "./poll";
import type { GameData } from "./espn";

// Polymarket's public Gamma API (events/markets) and CLOB price history. Read-only.

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

export interface PmMarket {
  question: string;
  outcomes: string[];
  prices: number[];
  tokens: string[];
  volume: number;
  type?: string;
  line?: number;
}

export interface PmProp extends PmMarket {
  player: string;
  stat: string;
  line: number;
}

export interface PmTotal extends PmMarket {
  line: number;
}

export interface PmEvent {
  slug: string;
  url: string;
  title: string;
  closed: boolean;
  start?: number;
  moneyline?: PmMarket;
  /** index of the home team in moneyline outcomes */
  homeIndex: number;
  props: PmProp[];
  /** Main full-game over/under (most traded line). */
  total?: PmTotal;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const parse = (s: unknown) => {
  try {
    return typeof s === "string" ? JSON.parse(s) : (s ?? []);
  } catch {
    return [];
  }
};

// Game slugs end with the game's date: US Eastern for the NBA (nba-mia-gsw-2026-11-05, a 10 PM ET tip),
// but UTC for the NFL (nfl-jax-bal-2026-11-06, an 8:15 PM ET kickoff). Accept either.
const etDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const utcDate = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/** Finds the Polymarket event for an ESPN game by team nicknames + date. */
export function findEventSlug(game: GameData): Promise<string | null> {
  const days = [etDate(game.date), utcDate(game.date)];
  return cached(`pm:find:${game.ref.id}`, 10 * 60_000, async () => {
    const q = encodeURIComponent(`${game.away.name} ${game.home.name}`);
    const r = await fetchJson<Json>(`${GAMMA}/public-search?q=${q}&limit_per_type=10&events_status=all`);
    const hit = (r.events ?? []).find((e: Json) => typeof e.slug === "string" && days.some((d) => e.slug.endsWith(d)));
    return hit?.slug ?? null;
  });
}

const PROP = /^(.+?):\s*(Points|Rebounds|Assists|Threes|Goals|Shots|Strikeouts|Hits)[^0-9]*O\/U\s*([\d.]+)/i;

export async function fetchEvent(slug: string, game: GameData): Promise<PmEvent> {
  const [e] = await fetchJson<Json[]>(`${GAMMA}/events?slug=${slug}`);
  const markets: PmMarket[] = (e.markets ?? []).map((m: Json) => ({
    question: m.question,
    outcomes: parse(m.outcomes),
    prices: parse(m.outcomePrices).map(Number),
    tokens: parse(m.clobTokenIds),
    volume: Number(m.volume ?? 0),
    type: m.sportsMarketType,
    line: Number(m.line),
  }));
  const moneyline = markets.find((m) => m.type === "moneyline") ?? markets[0];
  // Outcomes are full names in some leagues ("Golden State Warriors") and nicknames in others ("Ravens").
  const home = e.teams?.find((t: Json) => t.ordering === "home");
  const homeNames = [home?.name, home?.alias, game.home.name, game.home.display].filter(Boolean).map((n: string) => n.toLowerCase());
  const found = moneyline?.outcomes.findIndex((o) => homeNames.includes(o.toLowerCase())) ?? -1;
  const homeIndex = found >= 0 ? found : 1; // Polymarket lists away first
  const props = markets.flatMap((m): PmProp[] => {
    const x = m.question.match(PROP);
    return x ? [{ ...m, player: x[1].trim(), stat: x[2].toLowerCase(), line: Number(x[3]) }] : [];
  });
  return {
    slug,
    url: `https://polymarket.com/event/${slug}`,
    title: e.title,
    closed: !!e.closed,
    start: e.startTime ? Date.parse(e.startTime) : undefined,
    moneyline,
    homeIndex,
    props,
    total: markets
      .filter((m) => m.type === "totals" && Number.isFinite(m.line))
      .sort((a, b) => b.volume - a.volume)[0] as PmTotal | undefined,
  };
}

/** Price history of one outcome token since `fromMs` (1-minute buckets). */
export async function priceHistory(token: string, fromMs: number): Promise<{ t: number; p: number }[]> {
  const start = Math.floor(fromMs / 1000);
  const r = await fetchJson<Json>(`${CLOB}/prices-history?market=${token}&startTs=${start}&fidelity=1`);
  return (r.history ?? []).map((h: Json) => ({ t: h.t * 1000, p: Number(h.p) }));
}
