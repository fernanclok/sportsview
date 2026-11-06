import { useEffect, useMemo, useState } from "react";
import type { GameRef } from "../../types";
import { LEAGUES, espnDay, fetchScoreboard, leagueLabel, type GameBrief } from "../../lib/espn";

interface Props {
  current?: GameRef | null;
  onPick: (g: GameRef | null) => void;
  onCancel: () => void;
}

const DAYS = [{ label: "Ayer", offset: -1 }, { label: "Hoy", offset: 0 }, { label: "Mañana", offset: 1 }];

/** Link a stream to an ESPN game (for streams whose title doesn't say which game it is). */
export function GamePicker({ current, onPick, onCancel }: Props) {
  const [offset, setOffset] = useState(0);
  const [league, setLeague] = useState("");
  const [q, setQ] = useState("");
  const [games, setGames] = useState<GameBrief[] | null>(null);

  useEffect(() => {
    setGames(null);
    let alive = true;
    Promise.allSettled(LEAGUES.map((l) => fetchScoreboard(l.key, espnDay(offset)))).then((r) => {
      if (alive) setGames(r.flatMap((x) => (x.status === "fulfilled" ? x.value : [])));
    });
    return () => {
      alive = false;
    };
  }, [offset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const order = { in: 0, pre: 1, post: 2 } as const;
    return (games ?? [])
      .filter((g) => !league || g.ref.league === league)
      .filter((g) => !s || `${g.away.display} ${g.home.display} ${g.away.abbr} ${g.home.abbr}`.toLowerCase().includes(s))
      .sort((a, b) => order[a.state] - order[b.state] || Date.parse(a.date) - Date.parse(b.date));
  }, [games, league, q]);
  const leagues = useMemo(() => [...new Set((games ?? []).map((g) => g.ref.league))], [games]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal game-picker" onClick={(e) => e.stopPropagation()}>
        <h2>¿Qué partido es?</h2>
        <div className="gp-filters">
          {DAYS.map((d) => (
            <button key={d.offset} className={offset === d.offset ? "on" : ""} onClick={() => setOffset(d.offset)}>{d.label}</button>
          ))}
          <input placeholder="Buscar equipo…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <div className="gp-leagues">
          <button className={!league ? "on" : ""} onClick={() => setLeague("")}>Todas</button>
          {leagues.map((l) => (
            <button key={l} className={league === l ? "on" : ""} onClick={() => setLeague(l)}>{leagueLabel(l)}</button>
          ))}
        </div>
        <div className="gp-list">
          {!games && <div className="spinner" />}
          {games && !list.length && <p className="muted">No hay partidos.</p>}
          {list.map((g) => (
            <button key={g.ref.league + g.ref.id} className={`gp-game ${current?.id === g.ref.id ? "on" : ""}`} onClick={() => onPick(g.ref)}>
              <span className="gp-league">{leagueLabel(g.ref.league)}</span>
              <span className="gp-team">{g.away.logo && <img src={g.away.logo} alt="" />}{g.away.display}</span>
              <span className="gp-score">{g.state === "pre" ? "vs" : `${g.away.score} – ${g.home.score}`}</span>
              <span className="gp-team">{g.home.logo && <img src={g.home.logo} alt="" />}{g.home.display}</span>
              <span className={`gp-detail ${g.state === "in" ? "live" : ""}`}>{g.detail}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          {current && <button onClick={() => onPick(null)}>Quitar vínculo</button>}
          <div className="spacer" />
          <button onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
