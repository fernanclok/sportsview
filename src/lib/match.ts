import { useEffect, useState } from "react";
import type { GameRef } from "../types";
import { fetchGame, type GameData, type Player, type TeamBox } from "./espn";
import { fetchEvent, findEventSlug, priceHistory } from "./polymarket";
import { usePolled } from "./poll";

export function useGame(ref?: GameRef | null) {
  return usePolled(
    ref ? `game:${ref.league}:${ref.id}` : null,
    () => fetchGame(ref!),
    (g) => (g?.state === "in" ? 15_000 : g?.state === "pre" ? 120_000 : 600_000),
  ).data;
}

export function useMarket(game?: GameData) {
  const [slug, setSlug] = useState<string | null>(null);
  const id = game?.ref.id;
  useEffect(() => {
    setSlug(null);
    if (!game) return;
    let alive = true;
    findEventSlug(game).then((s) => alive && setSlug(s)).catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return usePolled(slug ? `pm:${slug}` : null, () => fetchEvent(slug!, game!), (e) => (e?.closed ? 600_000 : 30_000)).data;
}

/** Price history from shortly before tip-off (or the last 24 h before the game). */
export function useHistory(token: string | undefined, game?: GameData) {
  const live = game && game.state !== "pre";
  const from = live ? Date.parse(game!.date) - 30 * 60_000 : Math.floor(Date.now() / 3_600_000) * 3_600_000 - 24 * 3_600_000;
  return usePolled(
    token ? `hist:${token}:${from}` : null,
    () => priceHistory(token!, from),
    () => (game?.state === "in" ? 60_000 : 600_000),
  ).data;
}

export const statIndex = (labels: string[], ...names: string[]) => {
  for (const n of names) {
    const i = labels.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
};

/** Top performer of a team by points (or goals) in the first stat table. */
export function topPlayer(t: TeamBox): { p: Player; labels: string[] } | null {
  const table = t.tables[0];
  if (!table?.players.length) return null;
  const i = statIndex(table.labels, "PTS", "G", "YDS", "H");
  const val = (p: Player) => Number.parseFloat(p.stats[i]) || 0;
  const p = i >= 0 ? [...table.players].sort((a, b) => val(b) - val(a))[0] : table.players[0];
  return { p, labels: table.labels };
}

export const pct = (p?: number) => (p == null ? "–" : `${Math.round(p * 100)}%`);
