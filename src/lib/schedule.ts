import { useCallback, useEffect, useState } from "react";
import type { MetaItem } from "../types";
import { matchGame, type GameState } from "./espn";

// Sports addons list every upcoming game (days ahead) and keep finished ones around. We only want
// what's on today, and to drop games as they end: ESPN's status when it knows the game, otherwise
// the start time plus a typical length for the sport.

const MIN = 60_000;
// Typical full length (with breaks), by the addon's sport genre.
const LENGTH: Record<string, number> = {
  football: 135, basketball: 165, "american football": 225, hockey: 180, baseball: 225, "motor sports": 180,
  "fight (ufc, boxing)": 360, fight: 360, tennis: 240, rugby: 120, golf: 600, billiards: 240, afl: 150, darts: 240, cricket: 480,
};
const DEFAULT_LENGTH = 180;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Start time from "05 Nov 2026 · 17:45 UTC" (releaseInfo or description). null for 24/7 channels ("LIVE"). */
export function startOf(it: MetaItem): number | null {
  const m = `${it.releaseInfo ?? ""} ${it.description ?? ""}`.match(/(\d{1,2}) (\w{3})\w* (\d{4})\s*·\s*(\d{1,2}):(\d{2})\s*UTC/i);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  return month < 0 ? null : Date.UTC(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5]));
}

const lengthOf = (it: MetaItem) => (LENGTH[(it.genres?.[0] ?? "").toLowerCase()] ?? DEFAULT_LENGTH) * MIN;

const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** True once a page of items starts after today (the addon sorts by date, so later pages are later days). */
export const allAfterToday = (items: MetaItem[]) => items.length > 0 && items.every((it) => (startOf(it) ?? 0) > endOfToday());

function visible(it: MetaItem, now: number, espn?: GameState): boolean {
  const start = startOf(it);
  if (start == null) return true; // 24/7 channel
  if (espn === "post") return false;
  if (espn === "in") return true;
  if (start > endOfToday()) return false; // another day
  if (start < startOfToday() && now > start + lengthOf(it)) return false; // yesterday's, over
  return now < start + lengthOf(it);
}

/**
 * Filter for sports catalog items: today's games that haven't finished. Re-evaluates every minute and
 * asks ESPN about games already under way (cached scoreboards), so overtime keeps a game visible.
 */
export function useGameFilter(items: MetaItem[]) {
  const [now, setNow] = useState(Date.now);
  const [espn, setEspn] = useState<Map<string, GameState>>(new Map());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), MIN);
    return () => clearInterval(t);
  }, []);

  // Only games that have started need a status; check them again every couple of minutes.
  const started = items.filter((it) => {
    const s = startOf(it);
    return s != null && s <= now && s >= startOfToday() - 12 * 60 * MIN;
  });
  const key = started.map((it) => it.id).join("|") + `@${Math.floor(now / (2 * MIN))}`;
  useEffect(() => {
    if (!started.length) return;
    let alive = true;
    Promise.all(started.map((it) => matchGame(it.name).then((g) => [it.id, g?.state] as const).catch(() => [it.id, undefined] as const))).then(
      (pairs) => {
        if (!alive) return;
        const m = new Map<string, GameState>();
        for (const [id, st] of pairs) if (st) m.set(id, st);
        setEspn(m);
      },
    );
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return useCallback((it: MetaItem) => visible(it, now, espn.get(it.id)), [now, espn]);
}
