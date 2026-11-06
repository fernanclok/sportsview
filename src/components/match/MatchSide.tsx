import type { GameData, Player, TeamBox } from "../../lib/espn";
import type { PmEvent, PmProp, PmTotal } from "../../lib/polymarket";
import { pct, statIndex, topPlayer, useHistory } from "../../lib/match";
import { Chart } from "./Chart";
import { TrackCard } from "./Track";
import { ArrowUpRightIcon } from "../Icons";

const H2H_STATS = ["PTS", "REB", "AST", "STL", "G", "A", "SOG", "C/ATT", "YDS", "TD", "INT", "H", "HR", "RBI"];
/** Stats where the smaller number wins (a QB's interceptions). */
const LOWER_WINS = new Set(["INT"]);
const STAT_ES: Record<string, string> = { points: "puntos", rebounds: "rebotes", assists: "asistencias", threes: "triples", goals: "goles", shots: "tiros", strikeouts: "ponches", hits: "hits" };
const open = (url: string) => window.open(url);
const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}K`);
const lastName = (n: string) => n.split(" ").slice(-1)[0];

function HeadToHead({ game }: { game: GameData }) {
  const a = topPlayer(game.away);
  const h = topPlayer(game.home);
  const labels = (a ?? h)?.labels ?? [];
  const rows = H2H_STATS.filter((s) => labels.includes(s)).slice(0, 4);
  const style = {
    "--c1": game.away.color ? `#${game.away.color}` : "#5b3fd1",
    "--c2": game.home.color ? `#${game.home.color}` : "#d1a33f",
  } as React.CSSProperties;

  const side = (p: Player | undefined, team: TeamBox, cls: string) =>
    p?.headshot ? <img className={`h2h-shot ${cls}`} src={p.headshot} alt="" /> : team.logo ? <img className={`h2h-shot logo ${cls}`} src={team.logo} alt="" /> : null;

  return (
    <section className="mcard h2h-card" style={style}>
      {side(a?.p, game.away, "left")}
      {side(h?.p, game.home, "right")}
      <div className="h2h-body">
        <span className="h2h-title display">Cara<br />a cara</span>
        <span className="pill-chip">
          {game.away.logo && <img src={game.away.logo} alt="" />} {game.detail} {game.home.logo && <img src={game.home.logo} alt="" />}
        </span>
        <span className="h2h-names display">
          {a ? a.p.short : game.away.name} <i>vs</i> {h ? h.p.short : game.home.name}
        </span>
        {rows.length ? (
          <div className="h2h-rows">
            {rows.map((s) => {
              const va = a ? a.p.stats[statIndex(a.labels, s)] : "–";
              const vh = h ? h.p.stats[statIndex(h.labels, s)] : "–";
              const better = (x: string, y: string) => (LOWER_WINS.has(s) ? Number(x) < Number(y) : Number(x) > Number(y));
              return (
                <div key={s} className="h2h-row">
                  <b className={better(va, vh) ? "lead" : ""}>{va}</b>
                  <span>{s}</span>
                  <b className={better(vh, va) ? "lead" : ""}>{vh}</b>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h2h-rows pre">
            <div className="h2h-row"><b>{game.away.record ?? "–"}</b><span>REC</span><b>{game.home.record ?? "–"}</b></div>
          </div>
        )}
      </div>
    </section>
  );
}

function WinnerMarket({ game, pm }: { game: GameData; pm?: PmEvent | null }) {
  const m = pm?.moneyline;
  const hi = pm?.homeIndex ?? 1;
  const ai = 1 - hi;
  const hist = useHistory(m?.tokens[hi], game);
  const start = Date.parse(game.date);
  const now = Date.now();
  const t0 = game.state === "pre" ? (hist?.[0]?.t ?? now - 86_400_000) : Math.min(start, game.winProb[0]?.t ?? start);
  const t1 = game.state === "post" ? Math.max(hist?.[hist.length - 1]?.t ?? 0, game.winProb[game.winProb.length - 1]?.t ?? 0, t0 + 1) : now;
  const home = m?.prices[hi] ?? game.winProb[game.winProb.length - 1]?.home;
  const away = home == null ? undefined : 1 - home;
  const live = game.state === "in";

  return (
    <section className="mcard market-card">
      <header>
        <span className="pill-chip">{live && <i className="led live" />} {live ? "Mercado en vivo" : "Mercado"}</span>
        <button className="link" onClick={() => pm && open(pm.url)} disabled={!pm}>Polymarket <ArrowUpRightIcon /></button>
      </header>
      <h3 className="display">¿Quién gana?</h3>
      <p className="market-sub">
        {game.away.logo && <img src={game.away.logo} alt="" />} {game.away.name} {pct(away)}
        <span>•</span>
        {game.home.logo && <img src={game.home.logo} alt="" />} {game.home.name} {pct(home)}
        {m && <span className="vol">Vol {money(m.volume)}</span>}
      </p>
      <div className="chart-box">
        <div className="chart-title">
          <span>Probabilidad de {game.home.name}</span>
          <span className="legend"><i className="pm" /> Polymarket <i className="espn" /> ESPN</span>
        </div>
        <Chart
          t0={t0}
          t1={t1}
          marks={game.state === "pre" ? [] : game.periods}
          end={game.state === "post" ? "FINAL" : "AHORA"}
          bubble={home}
          series={[
            { pts: (hist ?? []).map((h) => ({ t: h.t, v: h.p })), cls: "pm", step: true },
            { pts: game.winProb.map((w) => ({ t: w.t, v: w.home })), cls: "espn" },
          ]}
        />
        {!m && <p className="chart-note">Sin mercado de Polymarket para este partido · solo ESPN</p>}
      </div>
      <div className="vote">
        <button className="dark" onClick={() => pm && open(pm.url)}>{game.away.abbr} ({pct(away)})</button>
        <button className="light" onClick={() => pm && open(pm.url)}>{game.home.abbr} ({pct(home)})</button>
      </div>
    </section>
  );
}

/** Picks the most interesting prop: the top scorer's line closest to 50/50, else the most traded. */
function choosePropFor(game: GameData, pm: PmEvent): { prop: PmProp; player?: Player; labels: string[] } | null {
  const points = pm.props.filter((p) => p.stat === "points" || p.stat === "goals");
  if (!points.length) return null;
  const tops = [topPlayer(game.away), topPlayer(game.home)].filter(Boolean) as NonNullable<ReturnType<typeof topPlayer>>[];
  const ptsOf = (t: (typeof tops)[number]) => Number.parseFloat(t.p.stats[statIndex(t.labels, "PTS", "G")]) || 0;
  tops.sort((a, b) => ptsOf(b) - ptsOf(a));
  for (const t of tops) {
    const mine = points.filter((p) => p.player.toLowerCase() === t.p.name.toLowerCase() && !p.prices.every((x) => x === 0 || x === 1));
    const pick = mine.sort((a, b) => Math.abs(a.prices[0] - 0.5) - Math.abs(b.prices[0] - 0.5))[0];
    if (pick) return { prop: pick, player: t.p, labels: t.labels };
  }
  const prop = [...points].sort((a, b) => b.volume - a.volume)[0];
  const box = [game.away, game.home].flatMap((t) => t.tables[0] ? t.tables[0].players.map((p) => ({ p, labels: t.tables[0].labels })) : []);
  const found = box.find((b) => b.p.name.toLowerCase() === prop.player.toLowerCase());
  return { prop, player: found?.p, labels: found?.labels ?? [] };
}

function PropMarket({ game, pm }: { game: GameData; pm: PmEvent }) {
  const pick = choosePropFor(game, pm);
  const hist = useHistory(pick?.prop.tokens[0], game);
  if (!pick) return null;
  const { prop, player, labels } = pick;
  const line = Math.ceil(prop.line);
  const yes = prop.prices[0];
  const stat = (k: string) => (player ? player.stats[statIndex(labels, k)] : undefined);
  const facts = [
    stat("PTS") && `${stat("PTS")} PTS`,
    stat("FG") && `${stat("FG")} FG`,
    stat("3PT") && `${stat("3PT")} 3PT`,
    stat("MIN") && `${stat("MIN")} MIN`,
  ].filter(Boolean);
  const now = Date.now();
  const t0 = hist?.[0]?.t ?? now - 3_600_000;
  const t1 = game.state === "post" ? (hist?.[hist.length - 1]?.t ?? now) : now;

  return (
    <section className="mcard prop-card">
      <header>
        <span className="pill-chip">Jugador</span>
        <button className="link" onClick={() => open(pm.url)}>Polymarket <ArrowUpRightIcon /></button>
      </header>
      <h3 className="display">¿{lastName(prop.player)} {line}+ {STAT_ES[prop.stat] ?? prop.stat}?</h3>
      <div className="prop-who">
        {player?.headshot ? <img src={player.headshot} alt="" /> : <span className="avatar ph">{prop.player[0]}</span>}
        <div>
          <strong>{prop.player}</strong>
          <small>{facts.length ? facts.join(" • ") : `Línea ${prop.line}`}</small>
        </div>
      </div>
      {hist && hist.length > 1 && <Chart t0={t0} t1={t1} series={[{ pts: hist.map((h) => ({ t: h.t, v: h.p })), cls: "pm", step: true }]} />}
      <div className="vote">
        <button className="dark" onClick={() => open(pm.url)}>SÍ ({pct(yes)})</button>
        <button className="light" onClick={() => open(pm.url)}>NO ({pct(1 - yes)})</button>
      </div>
    </section>
  );
}

/** Over/under on total points — the NFL has no player props on Polymarket, so this takes the prop card's place. */
function TotalMarket({ game, pm, total }: { game: GameData; pm: PmEvent; total: PmTotal }) {
  const over = total.outcomes.findIndex((o) => /over/i.test(o));
  const oi = over < 0 ? 0 : over;
  const hist = useHistory(total.tokens[oi], game);
  const yes = total.prices[oi];
  const now = Date.now();
  const t0 = hist?.[0]?.t ?? now - 3_600_000;
  const t1 = game.state === "post" ? (hist?.[hist.length - 1]?.t ?? now) : now;
  const pts = (Number(game.away.score) || 0) + (Number(game.home.score) || 0);
  const left = Math.ceil(total.line - pts);
  const sub =
    game.state === "pre" ? `Línea ${total.line} · ${money(total.volume)} operados`
    : left > 0 ? `Van ${pts} · faltan ${left} para el over`
    : `Van ${pts} · over cubierto`;

  return (
    <section className="mcard prop-card">
      <header>
        <span className="pill-chip">Total</span>
        <button className="link" onClick={() => open(pm.url)}>Polymarket <ArrowUpRightIcon /></button>
      </header>
      <h3 className="display">¿Más de {total.line} puntos?</h3>
      <p className="market-sub">{game.away.abbr} + {game.home.abbr} <span>·</span> {sub}</p>
      {hist && hist.length > 1 && <Chart t0={t0} t1={t1} series={[{ pts: hist.map((h) => ({ t: h.t, v: h.p })), cls: "pm", step: true }]} />}
      <div className="vote">
        <button className="dark" onClick={() => open(pm.url)}>MÁS ({pct(yes)})</button>
        <button className="light" onClick={() => open(pm.url)}>MENOS ({pct(1 - yes)})</button>
      </div>
    </section>
  );
}

export function MatchSide({ game, pm, onTrack }: { game: GameData; pm?: PmEvent | null; onTrack: (playerId?: string) => void }) {
  const hasProp = !!pm && !!choosePropFor(game, pm);
  return (
    <aside className="match-side" onClick={(e) => e.stopPropagation()}>
      <HeadToHead game={game} />
      <TrackCard game={game} onAdd={() => onTrack()} onEdit={onTrack} />
      <WinnerMarket game={game} pm={pm} />
      {pm && hasProp && <PropMarket game={game} pm={pm} />}
      {pm && !hasProp && pm.total && <TotalMarket game={game} pm={pm} total={pm.total} />}
    </aside>
  );
}
