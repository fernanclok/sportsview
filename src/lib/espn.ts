import { fetchJson } from "./proxy";
import { cached } from "./poll";
import type { GameRef } from "../types";

// ESPN's public site API (no key). Scoreboards list the day's games; the summary has
// box score, win probability (with each play's wall clock) and the season series.

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

export const LEAGUES: { key: string; label: string }[] = [
  { key: "basketball/nba", label: "NBA" },
  { key: "football/nfl", label: "NFL" },
  { key: "hockey/nhl", label: "NHL" },
  { key: "baseball/mlb", label: "MLB" },
  { key: "basketball/wnba", label: "WNBA" },
  { key: "football/college-football", label: "NCAAF" },
  { key: "basketball/mens-college-basketball", label: "NCAAB" },
  { key: "soccer/uefa.champions", label: "Champions" },
  { key: "soccer/eng.1", label: "Premier" },
  { key: "soccer/esp.1", label: "LaLiga" },
  { key: "soccer/ita.1", label: "Serie A" },
  { key: "soccer/ger.1", label: "Bundesliga" },
  { key: "soccer/fra.1", label: "Ligue 1" },
  { key: "soccer/mex.1", label: "Liga MX" },
  { key: "soccer/usa.1", label: "MLS" },
];
export const leagueLabel = (key: string) => LEAGUES.find((l) => l.key === key)?.label ?? key.split("/")[1].toUpperCase();

export type GameState = "pre" | "in" | "post";

export interface Team {
  name: string; // nickname: "Warriors"
  display: string; // "Golden State Warriors"
  abbr: string;
  logo?: string;
  color?: string;
  score?: string;
  record?: string;
}

export interface GameBrief {
  ref: GameRef;
  date: string;
  state: GameState;
  detail: string;
  away: Team;
  home: Team;
  /** TV/streaming networks carrying it ("Prime Video", "ESPN", "NBA TV"). */
  networks: string[];
}

export interface Player {
  id: string;
  name: string;
  short: string;
  jersey?: string;
  pos?: string;
  headshot?: string;
  starter: boolean;
  /** NBA only: on the floor right now (ESPN's `active`; exactly five per team while live). */
  onCourt?: boolean;
  stats: string[];
}

export interface StatTable {
  /** ESPN's table id ("passing", "goalies", "batting"…; "" for the NBA, "soccer" for rosters). */
  key: string;
  title?: string;
  labels: string[];
  players: Player[];
}

export interface TeamBox extends Team {
  tables: StatTable[];
  teamStats: { label: string; value: string }[];
  /** Season leaders (pre-game): category -> leader. */
  leaders: { category: string; value: string; name: string; headshot?: string }[];
}

export interface GameData extends GameBrief {
  away: TeamBox;
  home: TeamBox;
  clock?: string;
  period?: number;
  series?: string;
  winProb: { t: number; home: number }[];
  periods: { t: number; label: string }[];
  h2h: { date: string; away: string; home: string; awayScore?: string; homeScore?: string }[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const sportOf = (league: string) => league.split("/")[0];
const periodPrefix = (league: string) =>
  ({ basketball: "Q", football: "Q", hockey: "P" } as Record<string, string>)[sportOf(league)] ?? "";

function team(c: Json): Team {
  const t = c.team ?? {};
  return {
    name: t.name ?? t.shortDisplayName ?? t.displayName,
    display: t.displayName ?? t.name,
    abbr: t.abbreviation ?? "",
    logo: t.logo ?? t.logos?.[0]?.href,
    color: t.alternateColor ?? t.color,
    score: c.score,
    record: c.record?.[0]?.summary ?? c.records?.[0]?.summary,
  };
}

const networksOf = (c: Json): string[] => [
  ...new Set<string>([
    ...(c.broadcasts ?? []).flatMap((b: Json) => b.names ?? []),
    ...(c.geoBroadcasts ?? []).map((g: Json) => g.media?.shortName).filter(Boolean),
  ]),
];

const sides = (comps: Json[]) => ({
  away: comps.find((c) => c.homeAway === "away") ?? comps[0],
  home: comps.find((c) => c.homeAway === "home") ?? comps[1],
});

export function statusText(league: string, st: Json, date: string): string {
  const state = st?.type?.state as GameState;
  if (state === "pre") {
    const d = new Date(date);
    const today = new Date().toDateString() === d.toDateString();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return today ? `HOY ${time}` : `${d.toLocaleDateString([], { weekday: "short", day: "numeric" })} ${time}`.toUpperCase();
  }
  if (state === "post") return (st.type.shortDetail ?? "Final").toUpperCase();
  if (st?.type?.name === "STATUS_HALFTIME") return "MEDIO TIEMPO";
  const p = periodPrefix(league);
  if (sportOf(league) === "soccer") return st.displayClock ?? st.type.shortDetail;
  if (p && st.period) return `${st.period > (p === "P" ? 3 : 4) ? "OT" : p + st.period} (${st.displayClock})`;
  return st.type.shortDetail ?? "";
}

export function fetchScoreboard(league: string, day?: string): Promise<GameBrief[]> {
  return cached(`sb:${league}:${day ?? "today"}`, 60_000, async () => {
    const d = await fetchJson<Json>(`${BASE}/${league}/scoreboard${day ? `?dates=${day}` : ""}`);
    return (d.events ?? []).map((e: Json): GameBrief => {
      const c = e.competitions[0];
      const { away, home } = sides(c.competitors);
      return {
        ref: { league, id: e.id },
        date: e.date,
        state: e.status.type.state,
        detail: statusText(league, e.status, e.date),
        away: team(away),
        home: team(home),
        networks: networksOf(c),
      };
    });
  });
}

/** YYYYMMDD for ESPN's ?dates= param, offset in days from today. */
export const espnDay = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
};

const translateSeries = (s?: string) =>
  s
    ?.replace(/^Series tied (\S+)$/i, "Serie empatada $1")
    .replace(/^(.+) leads? series (\S+)$/i, "$1 gana la serie $2")
    .replace(/^(.+) wins? series (\S+)$/i, "$1 ganó la serie $2")
    .replace(/^Season tied$/i, "Temporada empatada");

// Soccer summaries have no boxscore.players; per-player stats live in the rosters (lineups).
const SOCCER_STATS = ["G", "A", "SHOT", "SOG", "SV", "GA", "YC", "RC", "FC"];
function soccerTable(d: Json, abbr: string): StatTable[] {
  const r = (d.rosters ?? []).find((x: Json) => x.team?.abbreviation === abbr);
  const played = (r?.roster ?? []).filter((p: Json) => p.starter || p.subbedIn);
  if (!played.length) return [];
  return [{
    key: "soccer",
    title: r.team?.displayName,
    labels: SOCCER_STATS,
    players: played.map((p: Json): Player => {
      const by = new Map<string, string>((p.stats ?? []).map((s: Json) => [s.abbreviation, s.displayValue]));
      return {
        id: p.athlete.id,
        name: p.athlete.displayName,
        short: p.athlete.shortName ?? p.athlete.displayName,
        jersey: p.jersey,
        pos: p.position?.abbreviation,
        headshot: p.athlete.headshot?.href,
        starter: !!p.starter,
        stats: SOCCER_STATS.map((k) => by.get(k) ?? "0"),
      };
    }),
  }];
}

export async function fetchGame(ref: GameRef): Promise<GameData> {
  const d = await fetchJson<Json>(`${BASE}/${ref.league}/summary?event=${ref.id}`);
  const comp = d.header.competitions[0];
  const st = comp.status;
  const { away, home } = sides(comp.competitors);

  const box = (abbr: string): Pick<TeamBox, "tables" | "teamStats" | "leaders"> => {
    const players = (d.boxscore?.players ?? []).find((p: Json) => p.team.abbreviation === abbr);
    const teamBox = (d.boxscore?.teams ?? []).find((t: Json) => t.team.abbreviation === abbr);
    const leaders = (d.leaders ?? []).find((l: Json) => l.team?.abbreviation === abbr);
    return {
      tables: players ? (players.statistics ?? []).map((s: Json) => ({
        key: s.name ?? s.type ?? "",
        title: s.text ?? s.name,
        labels: s.labels ?? s.names ?? [], // MLB calls them "names"
        players: (s.athletes ?? [])
          .filter((a: Json) => a.stats?.length)
          .map((a: Json): Player => ({
            id: a.athlete.id,
            name: a.athlete.displayName,
            short: a.athlete.shortName ?? a.athlete.displayName,
            jersey: a.athlete.jersey,
            pos: a.athlete.position?.abbreviation,
            headshot: a.athlete.headshot?.href,
            starter: !!a.starter,
            onCourt: sportOf(ref.league) === "basketball" ? !!a.active : undefined,
            stats: a.stats,
          })),
      })) : soccerTable(d, abbr),
      teamStats: (teamBox?.statistics ?? []).map((s: Json) => ({ label: s.label, value: s.displayValue })),
      leaders: (leaders?.leaders ?? []).flatMap((cat: Json) => {
        const l = cat.leaders?.[0];
        return l ? [{ category: cat.name, value: l.displayValue, name: l.athlete?.displayName, headshot: l.athlete?.headshot?.href }] : [];
      }),
    };
  };

  // Win probability is per play; plays carry the wall clock, so it can share a time axis with market prices.
  // NBA/NHL list plays flat; the NFL nests them inside drives.
  const allPlays: Json[] = d.plays ?? [
    ...(d.drives?.previous ?? []).flatMap((dr: Json) => dr.plays ?? []),
    ...(d.drives?.current?.plays ?? []),
  ];
  const plays = new Map<string, Json>(allPlays.map((p: Json) => [p.id, p]));
  const winProb = (d.winprobability ?? []).flatMap((w: Json) => {
    const t = Date.parse(plays.get(w.playId)?.wallclock ?? "");
    return Number.isFinite(t) ? [{ t, home: w.homeWinPercentage }] : [];
  });
  const periods: GameData["periods"] = [];
  const prefix = periodPrefix(ref.league);
  for (const p of allPlays) {
    const n = p.period?.number;
    if (n && !periods[n - 1] && p.wallclock) periods[n - 1] = { t: Date.parse(p.wallclock), label: prefix ? `${prefix}${n}` : `${n}` };
  }

  const series = d.seasonseries?.[0];
  return {
    ref,
    date: comp.date,
    state: st.type.state,
    detail: statusText(ref.league, st, comp.date),
    clock: st.displayClock,
    period: st.period,
    away: { ...team(away), ...box(away.team.abbreviation) },
    home: { ...team(home), ...box(home.team.abbreviation) },
    networks: networksOf(comp),
    series: translateSeries(series?.summary),
    winProb,
    periods: periods.filter(Boolean),
    h2h: (series?.events ?? []).map((e: Json) => {
      const s = sides(e.competitors ?? []);
      return {
        date: e.date,
        away: s.away?.team?.abbreviation ?? "",
        home: s.home?.team?.abbreviation ?? "",
        awayScore: s.away?.score,
        homeScore: s.home?.score,
      };
    }),
  };
}

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function mentions(title: string, t: Team) {
  const words = ` ${title} `;
  const has = (s?: string) => !!s && s.length >= 3 && words.includes(` ${norm(s)} `);
  return has(t.display) || (t.name.length >= 4 && has(t.name));
}

/** Today's games in every league we follow, live ones first. */
export async function todaysGames(): Promise<GameBrief[]> {
  const boards = await Promise.allSettled(LEAGUES.map((l) => fetchScoreboard(l.key)));
  const games = boards.flatMap((b) => (b.status === "fulfilled" ? b.value : []));
  // Live games first: a title like "Lakers vs Warriors" may also match a future rematch.
  const order = { in: 0, pre: 1, post: 2 } as const;
  return games.sort((a, b) => order[a.state] - order[b.state]);
}

/** Finds today's game whose two teams both appear in a text ("Heat vs Warriors", an EPG listing...). */
export async function matchGame(text: string): Promise<GameBrief | null> {
  const t = norm(text);
  if (!t) return null;
  return (await todaysGames()).find((g) => mentions(t, g.away) && mentions(t, g.home)) ?? null;
}
