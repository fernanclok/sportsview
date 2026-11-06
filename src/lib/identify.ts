import type { Channel, Source } from "../types";
import { matchGame, norm, todaysGames, type GameBrief } from "./espn";
import { getSecret } from "./secrets";
import { xtreamNowPlaying, xtreamStreamId } from "./xtream";

// Works out which ESPN game a stream shows, most reliable clue first:
// 1. its title names both teams · 2. the IPTV guide says what's on now · 3. it's the network carrying
// exactly one game that is live (or about to start).

export interface Identified {
  game: GameBrief;
  via: "título" | "guía" | "canal";
}

// Most specific first ("ESPN 2" before "ESPN", "FS1" before "FOX").
const NETWORKS: [string, RegExp][] = [
  ["espn+", /\bespn plus\b/],
  ["espn2", /\bespn ?2\b/],
  ["espnu", /\bespn ?u\b/],
  ["espnews", /\bespn ?news\b/],
  ["espn deportes", /\bespn deportes\b/],
  ["acc network", /\bacc ?(n|network)\b/],
  ["sec network", /\bsec ?(n|network)\b/],
  ["big ten network", /\b(big ?ten|btn)\b/],
  ["espn", /\bespn\b/],
  ["fs1", /\b(fs ?1|fox sports ?1)\b/],
  ["fs2", /\b(fs ?2|fox sports ?2)\b/],
  ["fox", /\bfox\b/],
  ["cbs sports network", /\b(cbssn|cbs sports( network)?)\b/],
  ["cbs", /\bcbs\b/],
  ["peacock", /\bpeacock\b/],
  ["nbc sports", /\b(nbc ?sports|nbcsn)\b/],
  ["nbc", /\bnbc\b/],
  ["abc", /\babc\b/],
  ["tnt", /\btnt\b/],
  ["tbs", /\btbs\b/],
  ["trutv", /\btru ?tv\b/],
  ["nba tv", /\bnba ?tv\b/],
  ["nfl network", /\bnfl ?(network|net)\b/],
  ["nhl network", /\bnhl ?network\b/],
  ["mlb network", /\bmlb ?network\b/],
  ["prime video", /\b(prime video|amazon prime|amazon|prime)\b/],
  ["apple tv", /\bapple ?tv\b/],
  ["netflix", /\bnetflix\b/],
];

export function networkOf(name: string): string | null {
  const n = norm(name.replace(/\+/g, " plus"));
  return NETWORKS.find(([, re]) => re.test(n))?.[0] ?? null;
}

// ESPN lists US broadcasts; "ESPN MX" or "FOX Sports Argentina" air other games.
const FOREIGN = /\b(mx|mex|mexico|latam|latino|latin|es|esp|espana|spain|uk|ca|canada|br|brasil|brazil|ar|arg|argentina|co|cl|pe|fr|de|it|pt|nl|au|caribe|deportes|sur|sud)\b/;

const SOON_MS = 60 * 60_000;

async function byNetwork(c: Channel): Promise<GameBrief | null> {
  if (FOREIGN.test(norm(`${c.name} ${c.group ?? ""}`))) return null;
  const net = networkOf(c.name);
  if (!net) return null;
  const now = Date.now();
  const onAir = (await todaysGames()).filter(
    (g) =>
      // "Prime Video (Local)" is a regional feed (NHL), not the national channel.
      g.networks.some((n) => !/\(local\)/i.test(n) && networkOf(n) === net) &&
      (g.state === "in" || (g.state === "pre" && Date.parse(g.date) - now < SOON_MS)),
  );
  const live = onAir.filter((g) => g.state === "in");
  // Several games at once on one network (FOX on NFL Sundays): can't tell which feed this is.
  const pool = live.length ? live : onAir;
  return pool.length === 1 ? pool[0] : null;
}

async function byGuide(c: Channel, src?: Source): Promise<GameBrief | null> {
  if (src?.kind !== "xtream" || !src.username) return null;
  const id = xtreamStreamId(c.url);
  const pass = id && (await getSecret(src.id));
  if (!id || !pass) return null;
  const now = await xtreamNowPlaying(src.url, src.username, pass, id).catch(() => "");
  return now ? matchGame(now) : null;
}

export async function identifyGame(c: Channel, src?: Source): Promise<Identified | null> {
  const byTitle = await matchGame(`${c.name} ${c.subtitle ?? ""}`);
  if (byTitle) return { game: byTitle, via: "título" };
  const guide = await byGuide(c, src).catch(() => null);
  if (guide) return { game: guide, via: "guía" };
  const net = await byNetwork(c).catch(() => null);
  return net ? { game: net, via: "canal" } : null;
}
