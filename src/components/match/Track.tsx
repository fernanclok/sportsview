import { useEffect, useMemo, useState } from "react";
import type { GameData, Player } from "../../lib/espn";
import type { GameRef } from "../../types";
import { useGame } from "../../lib/match";
import {
  currentValues, defaultStats, onCourtNow, rosterOf, setTrackDelay, statsFor, trackPlayer, untrack, useTrackGame, useTrackStore,
  type TrackEvent,
} from "../../lib/track";
import { CloseIcon, PlusIcon, TargetIcon } from "../Icons";

type Side = "away" | "home";
const SHOW_MS = 7000;
const DELAYS = [0, 15, 30, 60, 90];

const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("");
const Face = ({ src, name }: { src?: string; name: string }) =>
  src ? <img className="avatar" src={src} alt="" /> : <span className="avatar ph">{initials(name)}</span>;

/** Pick a player and what to follow. `initial` = player id clicked in the box score. */
export function TrackPicker({ game, initial, onClose }: { game: GameData; initial?: string; onClose: () => void }) {
  const { tracked } = useTrackStore();
  const sideOf = (id?: string): Side => (id && rosterOf(game, "home").some((p) => p.id === id) ? "home" : "away");
  const [side, setSide] = useState<Side>(sideOf(initial));
  const [q, setQ] = useState("");
  const [player, setPlayer] = useState<Player | undefined>(() => initial ? rosterOf(game, sideOf(initial)).find((p) => p.id === initial) : undefined);
  const existing = player && tracked.find((t) => t.id === `${game.ref.id}:${player.id}`);
  const [stats, setStats] = useState<string[]>([]);

  useEffect(() => {
    if (player) setStats(existing?.stats ?? defaultStats(game, player));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (player && !initial ? setPlayer(undefined) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, player, initial]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rosterOf(game, side)
      .filter((p) => !s || p.name.toLowerCase().includes(s) || p.jersey === s)
      .sort((a, b) => Number(b.starter) - Number(a.starter));
  }, [game, side, q]);
  const hasBox = rosterOf(game, "away").length + rosterOf(game, "home").length > 0;
  const toggle = (k: string) => setStats((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal track-picker" onClick={(e) => e.stopPropagation()}>
        <h2><TargetIcon size={22} /> Seguir jugador</h2>
        {!player ? (
          <>
            <div className="mp-sides tp-sides">
              {(["away", "home"] as Side[]).map((s) => (
                <button key={s} className={side === s ? "on" : ""} onClick={() => setSide(s)}>
                  {game[s].logo && <img src={game[s].logo} alt="" />} {game[s].name}
                </button>
              ))}
            </div>
            <input className="tp-search" placeholder="Buscar jugador o número…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <div className="tp-list">
              {!hasBox && <p className="muted">Los jugadores aparecen cuando ESPN publica el box score (al empezar el partido; en fútbol, con las alineaciones).</p>}
              {list.map((p) => {
                const on = tracked.some((t) => t.id === `${game.ref.id}:${p.id}`);
                return (
                  <button key={p.id} className={`tp-player ${on ? "on" : ""}`} onClick={() => setPlayer(p)}>
                    <Face src={p.headshot} name={p.name} />
                    <span>{p.name}<small>{[p.jersey && `#${p.jersey}`, p.pos].filter(Boolean).join(" · ")}</small></span>
                    {on && <i className="led" />}
                  </button>
                );
              })}
            </div>
            <div className="modal-actions"><button onClick={onClose}>Cerrar</button></div>
          </>
        ) : (
          <>
            <div className="prop-who">
              <Face src={player.headshot} name={player.name} />
              <div><strong>{player.name}</strong><small>{[game[side].abbr, player.jersey && `#${player.jersey}`, player.pos].filter(Boolean).join(" · ")}</small></div>
            </div>
            <p className="label">Avísame cuando cambie…</p>
            <div className="tp-stats">
              {statsFor(game, player).map((d) => (
                <button key={d.key} className={stats.includes(d.key) ? "on" : ""} onClick={() => toggle(d.key)}>{d.es}</button>
              ))}
            </div>
            <div className="modal-actions">
              {existing && <button onClick={() => { untrack(existing.id); onClose(); }}>Dejar de seguir</button>}
              <div className="spacer" />
              {!initial && <button onClick={() => setPlayer(undefined)}>Otro jugador</button>}
              <button className="primary" disabled={!stats.length} onClick={() => { trackPlayer(game, side, player, stats); onClose(); }}>
                {existing ? "Guardar" : "Seguir"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Side card: who you follow in this game, their numbers and the last alerts. */
export function TrackCard({ game, onAdd, onEdit }: { game: GameData; onAdd: () => void; onEdit: (playerId: string) => void }) {
  const { tracked, events, delay } = useTrackStore();
  const mine = tracked.filter((t) => t.game.id === game.ref.id);
  const now = Date.now();
  const recent = events.filter((e) => mine.some((t) => t.id === e.trackedId) && e.showAt <= now).slice(-4).reverse();

  return (
    <section className="mcard track-card">
      <header>
        <span className="pill-chip"><TargetIcon size={12} /> Siguiendo</span>
        <label className="tc-delay" title="Retrasa las alertas para que no te adelanten lo que el stream aún no muestra">
          Retraso
          <select value={delay} onChange={(e) => setTrackDelay(Number(e.target.value))}>
            {DELAYS.map((d) => <option key={d} value={d}>{d ? `${d} s` : "ninguno"}</option>)}
          </select>
        </label>
      </header>
      {!mine.length && <p className="tc-empty">Elige un jugador y te aviso cada punto, rebote, yarda o atajada.</p>}
      {mine.map((t) => {
        const court = onCourtNow(game, t);
        return (
          <div key={t.id} className="tc-player">
            <button className="tc-who" onClick={() => onEdit(t.playerId)} title="Cambiar qué seguir">
              <Face src={t.headshot} name={t.name} />
              <strong>{t.name}</strong>
              {court != null && <span className={`tc-court ${court ? "on" : ""}`}><i className={`led ${court ? "on" : ""}`} /> {court ? "En cancha" : "Banca"}</span>}
            </button>
            <button className="icon" title="Dejar de seguir" onClick={() => untrack(t.id)}><CloseIcon /></button>
            <div className="tc-stats">
              {currentValues(game, t).map(({ def, value }) => (
                <span key={def.key}><b>{value ?? "–"}</b>{def.short}</span>
              ))}
            </div>
          </div>
        );
      })}
      {recent.length > 0 && (
        <ul className="tc-log">
          {recent.map((e) => (
            <li key={e.id}><time>{new Date(e.showAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>{e.name.split(" ").slice(-1)[0]} {e.change}</li>
          ))}
        </ul>
      )}
      <button className="tc-add" onClick={onAdd}><PlusIcon /> Seguir jugador</button>
    </section>
  );
}

/** Polls a game with tracked players (shares the request with the rest of the UI) and diffs it. */
function Runner({ game }: { game: GameRef }) {
  useTrackGame(useGame(game));
  return null;
}

/** Diffs every watched game with tracked players and shows alerts over the streams once the delay has passed. */
export function TrackAlerts({ games }: { games: GameRef[] }) {
  const { tracked, events } = useTrackStore();
  const [, tick] = useState(0);
  const now = Date.now();
  const watched = games.filter((g, i) => tracked.some((t) => t.game.id === g.id) && games.findIndex((x) => x.id === g.id) === i);
  const showing = events.filter((e) => e.showAt <= now && now < e.showAt + SHOW_MS);

  // Re-render at the next moment an alert appears or leaves.
  useEffect(() => {
    const next = events.flatMap((e) => [e.showAt, e.showAt + SHOW_MS]).filter((t) => t > Date.now()).sort((a, b) => a - b)[0];
    if (!next) return;
    const id = window.setTimeout(() => tick((n) => n + 1), next - Date.now() + 20);
    return () => clearTimeout(id);
  });

  // Away from the app (another window, full-screen elsewhere): a system notification instead.
  useEffect(() => {
    if (document.hasFocus()) return;
    for (const e of showing) notifyOnce(e);
  });

  return (
    <>
      {watched.map((g) => <Runner key={g.id} game={g} />)}
      {showing.length > 0 && (
        <div className="track-alerts" aria-live="polite">
          {showing.slice(-3).map((e) => (
            <div key={e.id} className="track-alert">
              <Face src={e.headshot} name={e.name} />
              <div>
                <strong>{e.logo && <img src={e.logo} alt="" />}{e.name}</strong>
                <span className="ta-change">{e.change}</span>
                <small>{e.totals}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const notified = new Set<number>();
function notifyOnce(e: TrackEvent) {
  if (notified.has(e.id) || typeof Notification === "undefined") return;
  notified.add(e.id);
  try {
    new Notification(`${e.name} ${e.change}`, { body: e.totals, icon: e.headshot, silent: true });
  } catch {}
}
