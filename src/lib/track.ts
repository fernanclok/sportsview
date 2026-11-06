import { useEffect, useSyncExternalStore } from "react";
import type { GameRef } from "../types";
import type { GameData, Player } from "./espn";
import { load, save } from "./storage";

// Player tracking: pick a player and the stats you care about; every ESPN poll is diffed
// against the last values and each change becomes an alert ("+1 REB · 8 rebotes").

export interface StatDef {
  /** `${table}:${label}` — the table is ESPN's id ("rushing"); "*" matches any table. */
  key: string;
  short: string;
  es: string;
  /** Yards can go down (a -3 run); counts only go up (a drop is a stat correction). */
  signed?: boolean;
}

const def = (key: string, short: string, es: string, signed?: boolean): StatDef => ({ key, short, es, signed });

const DEFS: Record<string, StatDef[]> = {
  basketball: [
    def("*:PTS", "PTS", "puntos"), def("*:REB", "REB", "rebotes"), def("*:AST", "AST", "asistencias"),
    def("*:3PT", "3PT", "triples"), def("*:STL", "ROB", "robos"), def("*:BLK", "TAP", "tapones"),
  ],
  football: [
    def("passing:YDS", "YDS PASE", "yardas de pase", true), def("passing:TD", "TD PASE", "TD de pase"),
    def("passing:INT", "INT", "intercepciones lanzadas"),
    def("rushing:YDS", "YDS CARRERA", "yardas por tierra", true), def("rushing:CAR", "ACARREOS", "acarreos"),
    def("rushing:TD", "TD CARRERA", "TD por tierra"),
    def("receiving:REC", "REC", "recepciones"), def("receiving:YDS", "YDS REC", "yardas por recepción", true),
    def("receiving:TD", "TD REC", "TD por recepción"),
    def("defensive:SACKS", "SACKS", "capturas"), def("defensive:TOT", "TACKLES", "tacleadas"),
    def("interceptions:INT", "INT DEF", "intercepciones"),
  ],
  soccer: [
    def("soccer:G", "GOL", "goles"), def("soccer:A", "AST", "asistencias"), def("soccer:SHOT", "TIROS", "tiros"),
    def("soccer:SOG", "A PUERTA", "tiros a puerta"), def("soccer:SV", "ATAJADAS", "atajadas"),
    def("soccer:YC", "AMARILLA", "tarjetas amarillas"),
  ],
  hockey: [def("*:G", "G", "goles"), def("*:A", "A", "asistencias"), def("*:S", "TIROS", "tiros a gol"), def("goalies:SV", "ATAJADAS", "atajadas")],
  baseball: [def("batting:H", "H", "hits"), def("batting:HR", "HR", "jonrones"), def("batting:RBI", "RBI", "carreras impulsadas"), def("pitching:K", "K", "ponches")],
};

const sportOf = (league: string) => league.split("/")[0];

/** Stats you can follow for this player: the sport's list, filtered to tables he could show up in. */
export function statsFor(game: GameData, player: Player): StatDef[] {
  const defs = DEFS[sportOf(game.ref.league)];
  if (defs) return defs;
  // Unknown sport: whatever the box score lists for him.
  return [game.away, game.home].flatMap((t) =>
    t.tables.filter((tb) => tb.players.some((p) => p.id === player.id)).flatMap((tb) => tb.labels.map((l) => def(`${tb.key}:${l}`, l, l))),
  );
}

/** The NFL box has no positions: guess from where he has the most yards. */
function nflRole(game: GameData, player: Player) {
  const yds = (table: string) => [game.away, game.home].reduce((n, t) => {
    const tb = t.tables.find((x) => x.key === table);
    const p = tb?.players.find((x) => x.id === player.id);
    return p ? Math.max(n, Number.parseFloat(p.stats[tb!.labels.indexOf("YDS")]) || 0.1) : n;
  }, 0);
  const role = { QB: yds("passing"), RB: yds("rushing"), WR: yds("receiving") };
  const best = Object.entries(role).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : "";
}

/** Sensible preselection by sport and position. */
export function defaultStats(game: GameData, player: Player): string[] {
  const sport = sportOf(game.ref.league);
  const pos = player.pos || (sport === "football" ? nflRole(game, player) : "");
  if (sport === "basketball") return ["*:PTS", "*:REB", "*:AST"];
  if (sport === "football") {
    if (pos === "QB") return ["passing:YDS", "passing:TD", "passing:INT"];
    if (pos === "RB" || pos === "FB") return ["rushing:YDS", "rushing:TD", "receiving:REC"];
    if (pos === "WR" || pos === "TE") return ["receiving:REC", "receiving:YDS", "receiving:TD"];
    return ["defensive:TOT", "defensive:SACKS", "interceptions:INT"];
  }
  if (sport === "soccer") return pos === "G" ? ["soccer:SV"] : ["soccer:G", "soccer:SHOT", "soccer:SOG"];
  if (sport === "hockey") return pos === "G" ? ["goalies:SV"] : ["*:G", "*:A", "*:S"];
  return statsFor(game, player).slice(0, 3).map((d) => d.key);
}

/** Every player in the box (NFL lists a player once per table). */
export function rosterOf(game: GameData, side: "away" | "home"): Player[] {
  const seen = new Map<string, Player>();
  for (const tb of game[side].tables) for (const p of tb.players) if (!seen.has(p.id)) seen.set(p.id, p);
  return [...seen.values()];
}

/** Current value, or undefined while the box score isn't there. A player missing from a table has 0 there (the NFL only lists players with stats). */
export function statValue(game: GameData, team: string, playerId: string, key: string): number | undefined {
  const box = game.away.abbr === team ? game.away : game.home.abbr === team ? game.home : undefined;
  if (!box?.tables.some((t) => t.players.length)) return undefined;
  const [table, label] = key.split(":");
  for (const tb of box.tables) {
    if (table !== "*" && tb.key !== table) continue;
    const i = tb.labels.indexOf(label);
    const p = i >= 0 ? tb.players.find((x) => x.id === playerId) : undefined;
    // "3-7" (3PT made-attempted) and "18/25" (completions) → the first number.
    if (p) return Number.parseFloat(p.stats[i]) || 0;
  }
  return 0;
}

export const findDef = (league: string, key: string) =>
  DEFS[sportOf(league)]?.find((d) => d.key === key) ?? def(key, key.split(":")[1], key.split(":")[1]);

export interface Tracked {
  id: string; // `${gameId}:${playerId}`
  game: GameRef;
  playerId: string;
  name: string;
  headshot?: string;
  team: string;
  logo?: string;
  stats: string[];
  added: number;
}

/** NBA while live: is he on the floor? undefined when the sport/state doesn't say. */
export function onCourtNow(game: GameData, t: Tracked): boolean | undefined {
  if (game.state !== "in") return undefined;
  const box = game.away.abbr === t.team ? game.away : game.home;
  const p = box.tables[0]?.players.find((x) => x.id === t.playerId);
  return box.tables[0]?.players.some((x) => x.onCourt) ? !!p?.onCourt : undefined;
}

export interface TrackEvent {
  id: number;
  trackedId: string;
  name: string;
  headshot?: string;
  logo?: string;
  /** "+1 REC · +23 YDS REC" */
  change: string;
  /** "5 recepciones · 61 yardas por recepción" */
  totals: string;
  /** When to show it: the moment it happened plus the stream delay. */
  showAt: number;
}

/* ---------- store ---------- */

interface State {
  tracked: Tracked[];
  events: TrackEvent[];
  /** Seconds the alerts wait so they don't spoil a stream that runs behind live. */
  delay: number;
}

const DAY = 86_400_000;
let state: State = {
  tracked: load<Tracked[]>("tracked", []).filter((t) => Date.now() - t.added < 2 * DAY),
  events: [],
  delay: load("trackDelay", 30),
};
const subs = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  if (patch.tracked) save("tracked", state.tracked);
  if (patch.delay != null) save("trackDelay", state.delay);
  subs.forEach((f) => f());
};

export const useTrackStore = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );

export function trackPlayer(game: GameData, side: "away" | "home", p: Player, stats: string[]) {
  const id = `${game.ref.id}:${p.id}`;
  const t: Tracked = {
    id, game: game.ref, playerId: p.id, name: p.name, headshot: p.headshot,
    team: game[side].abbr, logo: game[side].logo, stats, added: Date.now(),
  };
  // Baseline now, so whatever happened before you started following isn't an alert.
  const base = baselines.get(id) ?? new Map<string, number>();
  for (const k of stats) {
    const v = statValue(game, t.team, p.id, k);
    if (v != null && !base.has(k)) base.set(k, v);
  }
  baselines.set(id, base);
  const i = state.tracked.findIndex((x) => x.id === id);
  set({ tracked: i < 0 ? [...state.tracked, t] : state.tracked.map((x, j) => (j === i ? { ...t, added: x.added } : x)) });
}

export function untrack(id: string) {
  baselines.delete(id);
  set({ tracked: state.tracked.filter((t) => t.id !== id) });
}

export const setTrackDelay = (delay: number) => set({ delay });

/* ---------- diffing ---------- */

/** Last seen value per tracked player and stat. In memory: after a restart the first poll is the new baseline. */
const baselines = new Map<string, Map<string, number>>();
let nextId = 1;

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Diffs a fresh poll of a game against the baselines and queues alerts. */
export function useTrackGame(game: GameData | undefined) {
  useEffect(() => {
    if (game) diffGame(game);
  }, [game]);
}

export function diffGame(game: GameData) {
  const fresh: TrackEvent[] = [];
  for (const t of state.tracked) {
    if (t.game.id !== game.ref.id) continue;
    // No baseline yet (fresh app start): this poll becomes it.
    const first = !baselines.has(t.id);
    const base = baselines.get(t.id) ?? new Map<string, number>();
    baselines.set(t.id, base);
    const changes: string[] = [];
    for (const key of t.stats) {
      const v = statValue(game, t.team, t.playerId, key);
      if (v == null) continue;
      const prev = base.get(key);
      const d = findDef(game.ref.league, key);
      if (prev != null && !first && v !== prev && (d.signed || v > prev)) changes.push(`${v > prev ? "+" : "−"}${fmt(Math.abs(v - prev))} ${d.short}`);
      if (prev == null || v > prev || d.signed) base.set(key, v);
    }
    if (!changes.length) continue;
    fresh.push({
      id: nextId++, trackedId: t.id, name: t.name, headshot: t.headshot, logo: t.logo,
      change: changes.join(" · "),
      totals: t.stats.map((k) => `${fmt(base.get(k) ?? 0)} ${findDef(game.ref.league, k).es}`).join(" · "),
      showAt: Date.now() + state.delay * 1000,
    });
  }
  if (fresh.length) set({ events: [...state.events, ...fresh].slice(-40) });
  return fresh;
}



/** Current values for a tracked player (for the side card). */
export function currentValues(game: GameData, t: Tracked) {
  return t.stats.map((k) => ({ def: findDef(game.ref.league, k), value: statValue(game, t.team, t.playerId, k) }));
}
