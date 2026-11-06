import { useState } from "react";
import type { GameData, Player, StatTable, TeamBox } from "../../lib/espn";
import { statIndex } from "../../lib/match";
import { useTrackStore } from "../../lib/track";
import { CloseIcon, StarIcon, TargetIcon } from "../Icons";

type Tab = "box" | "stats" | "series";
type Side = "away" | "both" | "home";

const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("");

function Avatar({ src, name }: { src?: string; name: string }) {
  return src ? <img className="avatar" src={src} alt="" loading="lazy" /> : <span className="avatar ph">{initials(name)}</span>;
}

function Table({ team, table, best, followed, onTrack, live }: {
  team: TeamBox; table: StatTable; best: Set<string>; followed: Set<string>; onTrack: (playerId: string) => void; live: boolean;
}) {
  const pm = statIndex(table.labels, "+/-");
  // While live, the NBA box knows who's on the floor: those five go first, the bench below.
  const court = live && table.players.some((p) => p.onCourt);
  const players = court ? [...table.players].sort((a, b) => Number(!!b.onCourt) - Number(!!a.onCourt)) : table.players;
  return (
    <table className="box-table">
      <thead>
        <tr>
          <th className="who">
            {team.logo && <img src={team.logo} alt="" />} {table.title && table.title !== "undefined" ? table.title : team.name}
            {court && <span className="court-key"><i className="led on" /> En cancha</span>}
          </th>
          {table.labels.map((l) => <th key={l}>{l}</th>)}
        </tr>
      </thead>
      <tbody>
        {players.map((p: Player, i) => (
          <tr key={p.id} className={`${p.starter ? "starter" : ""} ${followed.has(p.id) ? "followed" : ""} ${court ? (p.onCourt ? "on-court" : "bench") : ""} ${court && i === 5 ? "bench-first" : ""}`}>
            <td className="who">
              {court && <i className={`led ${p.onCourt ? "on" : ""}`} title={p.onCourt ? "En cancha" : "En la banca"} />}
              <Avatar src={p.headshot} name={p.name} />
              <span>
                {p.name}
                <small>{[p.jersey, p.pos].filter(Boolean).join(" ")}</small>
              </span>
              {best.has(p.id) && <span className="best" title="Líder del partido"><StarIcon on size={12} /></span>}
              <button className="icon follow" title={followed.has(p.id) ? "Siguiendo · cambiar qué seguir" : "Seguir a este jugador"}
                onClick={() => onTrack(p.id)}><TargetIcon /></button>
            </td>
            {p.stats.map((v, j) => (
              <td key={j}>
                {j === pm ? <span className={`chip ${v.startsWith("-") ? "neg" : v === "0" ? "" : "pos"}`}>{v}</span> : v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const num = (v: string) => Number.parseFloat(v.replace("%", "")) || 0;

export function MatchPanel({ game, onHide, onTrack }: { game: GameData; onHide: () => void; onTrack: (playerId: string) => void }) {
  const [tab, setTab] = useState<Tab>("box");
  const { tracked } = useTrackStore();
  const followed = new Set(tracked.filter((t) => t.game.id === game.ref.id).map((t) => t.playerId));
  const [side, setSide] = useState<Side>("away");
  const teams = side === "both" ? [game.away, game.home] : [game[side]];

  // Top scorer of each team gets a star.
  const best = new Set<string>();
  for (const t of [game.away, game.home]) {
    const tb = t.tables[0];
    const i = tb ? statIndex(tb.labels, "PTS", "G") : -1;
    if (i >= 0 && tb.players.length) best.add([...tb.players].sort((a, b) => num(b.stats[i]) - num(a.stats[i]))[0].id);
  }
  const hasBox = game.away.tables.some((t) => t.players.length);

  return (
    <div className="match-panel glass" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="mp-tabs">
        <button className={tab === "box" ? "on" : ""} onClick={() => setTab("box")}>Box score</button>
        <button className={tab === "stats" ? "on" : ""} onClick={() => setTab("stats")}>Estadísticas</button>
        <button className={tab === "series" ? "on" : ""} onClick={() => setTab("series")}>Cara a cara</button>
        <div className="spacer" />
        <button className="mp-hide" title="Ocultar (I)" onClick={onHide}><CloseIcon /></button>
      </div>

      {tab === "box" && (
        <>
          <div className="mp-sides">
            <button className={side === "away" ? "on" : ""} onClick={() => setSide("away")}>
              {game.away.logo && <img src={game.away.logo} alt="" />} {game.away.name}
            </button>
            <button className={side === "both" ? "on" : ""} onClick={() => setSide("both")}>
              {game.away.logo && <img src={game.away.logo} alt="" />} + {game.home.logo && <img src={game.home.logo} alt="" />}
            </button>
            <button className={side === "home" ? "on" : ""} onClick={() => setSide("home")}>
              {game.home.logo && <img src={game.home.logo} alt="" />} {game.home.name}
            </button>
          </div>
          <div className="mp-body">
            {!hasBox && <p className="mp-empty">El box score aparece cuando empiece el partido.</p>}
            {teams.map((t) => t.tables.map((tb, i) => <Table key={t.abbr + i} team={t} table={tb} best={best} followed={followed} onTrack={onTrack} live={game.state === "in"} />))}
          </div>
        </>
      )}

      {tab === "stats" && (
        <div className="mp-body">
          {!game.away.teamStats.length && <p className="mp-empty">Sin estadísticas todavía.</p>}
          <div className="team-stats">
            <div className="ts-head">
              <span>{game.away.logo && <img src={game.away.logo} alt="" />} {game.away.abbr}</span>
              <span>{game.home.abbr} {game.home.logo && <img src={game.home.logo} alt="" />}</span>
            </div>
            {game.away.teamStats.map((s, i) => {
              const h = game.home.teamStats[i]?.value ?? "";
              const a = num(s.value);
              const b = num(h);
              const share = a + b ? a / (a + b) : 0.5;
              return (
                <div key={s.label} className="ts-row">
                  <span className={a > b ? "lead" : ""}>{s.value}</span>
                  <div className="ts-mid">
                    <small>{s.label}</small>
                    <div className="ts-bar"><i style={{ width: `${share * 100}%` }} /></div>
                  </div>
                  <span className={b > a ? "lead" : ""}>{h}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "series" && (
        <div className="mp-body">
          {game.series && <h3 className="display">{game.series}</h3>}
          {!game.h2h.length && <p className="mp-empty">No hay partidos previos esta temporada.</p>}
          <ul className="h2h">
            {game.h2h.map((m) => (
              <li key={m.date}>
                <span>{new Date(m.date).toLocaleDateString([], { day: "numeric", month: "short" })}</span>
                <strong>{m.away} {m.awayScore ?? ""}</strong>
                <span>@</span>
                <strong>{m.home} {m.homeScore ?? ""}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
