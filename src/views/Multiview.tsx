import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel, Layout } from "../types";
import { LAYOUT_SLOTS } from "../types";
import { Player } from "../components/Player";
import { YT_COMMAND, YouTubeFrame, type YtCommand } from "../components/YouTubeFrame";
import {
  ChevronUpIcon, CloseIcon, CollapseIcon, ExpandIcon, FullscreenIcon, MiniIcon, PipIcon, PlusIcon, ReloadIcon,
  ScoreboardIcon, SwapIcon, TvIcon, VolumeIcon,
} from "../components/Icons";
import { tvSupported } from "../lib/tv";
import type { GameRef } from "../types";
import { useGame, useMarket } from "../lib/match";
import { ScorePill } from "../components/match/ScorePill";
import { MatchPanel } from "../components/match/MatchPanel";
import { MatchSide } from "../components/match/MatchSide";
import { GamePicker } from "../components/match/GamePicker";
import { TrackAlerts, TrackPicker } from "../components/match/Track";
import { miniSupported, notifyPip, setAppFullscreen, setMiniPlayer } from "../lib/fullscreen";

const IDLE_MS = 2500;

interface Props {
  active: boolean;
  immersive: boolean;
  mini: boolean;
  layout: Layout;
  setLayout: (l: Layout) => void;
  slots: (Channel | null)[];
  setSlotAudio: (i: number, patch: Pick<Channel, "volume" | "muted">) => void;
  closeSlot: (i: number) => void;
  swapSlots: (a: number, b: number) => void;
  focused: number;
  setFocused: (i: number) => void;
  masterMuted: boolean;
  setMasterMuted: (fn: (m: boolean) => boolean) => void;
  masterVolume: number;
  setMasterVolume: (v: number) => void;
  /** slot index to replace, or null to add a new stream */
  onPick: (slot: number | null) => void;
  tvSlotId: string | null;
  tvMulti: boolean;
  onTvSlot: (slot: number) => void;
  onTvBack: () => void;
  onTvMultiview: () => void;
  setSlotGame: (i: number, game: GameRef | null) => void;
  /** Slots whose game couldn't be identified automatically. */
  unmatched: Set<string>;
}

/** Small live score on a grid slot linked to a game. */
function SlotScore({ game }: { game: GameRef }) {
  const g = useGame(game);
  return g ? <ScorePill game={g} /> : null;
}

const volumeIcon = (muted: boolean, v: number) => <VolumeIcon muted={muted} level={v} />;

export function Multiview(p: Props) {
  const tv = tvSupported();
  const { active, immersive, mini, layout, slots, focused } = p;
  const slotCount = LAYOUT_SLOTS[layout];
  const [expanded, setExpanded] = useState<number | null>(null);
  const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});
  const [pipId, setPipId] = useState<string | null>(null);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number>(undefined);
  const slotEls = useRef(new Map<string, HTMLDivElement>());
  const chromeless = immersive || mini;
  // Match mode: one stream on screen (or one expanded) that is linked to a game.
  const [info, setInfo] = useState(true);
  const [panel, setPanel] = useState(true);
  const [linking, setLinking] = useState<number | null>(null);
  // Player-follow picker: open with a player id (from the box score) or "" to choose one.
  const [following, setFollowing] = useState<string | null>(null);
  const shown = slots.slice(0, slotCount).flatMap((c, i) => (c ? [i] : []));
  const matchIdx = expanded ?? (shown.length === 1 ? shown[0] : null);
  const matchCh = matchIdx != null ? slots[matchIdx] : null;
  const game = useGame(matchCh?.game);
  const pm = useMarket(game);
  const matchMode = !!(game && info && !mini && matchCh?.id !== p.tvSlotId);

  useEffect(() => {
    if (expanded !== null && (expanded >= slotCount || !slots[expanded])) setExpanded(null);
  }, [slotCount, expanded, slots]);

  // Controls + cursor hide after a moment without mouse movement (fullscreen / mini).
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }, []);
  useEffect(() => {
    if (chromeless && active) wake();
    else {
      window.clearTimeout(idleTimer.current);
      setIdle(false);
    }
  }, [chromeless, active, wake]);

  // PiP events don't bubble; listen in the capture phase.
  useEffect(() => {
    const onEnter = (e: Event) => {
      setPipId((e.target as HTMLElement).closest<HTMLElement>(".slot")?.dataset.id ?? null);
      notifyPip(true);
    };
    const onLeave = (e: Event) => {
      setPipId(null);
      notifyPip(false);
      // Closing the PiP window with its X pauses the video; it's live, keep it going.
      (e.target as HTMLVideoElement).play?.().catch(() => {});
    };
    document.addEventListener("enterpictureinpicture", onEnter, true);
    document.addEventListener("leavepictureinpicture", onLeave, true);
    return () => {
      document.removeEventListener("enterpictureinpicture", onEnter, true);
      document.removeEventListener("leavepictureinpicture", onLeave, true);
    };
  }, []);

  const reload = (ch: Channel) => setReloadKeys((k) => ({ ...k, [ch.id]: (k[ch.id] ?? 0) + 1 }));

  // Expanded slot covers the whole grid; the others keep playing underneath.
  const toggleExpand = (i: number) => {
    p.setFocused(i);
    setExpanded((e) => (e === i ? null : i));
  };

  async function togglePip(i: number) {
    const ch = slots[i];
    const video = ch && slotEls.current.get(ch.id)?.querySelector("video");
    if (!video) return;
    try {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else {
        await video.requestPictureInPicture();
        p.setFocused(i); // audio follows focus: the PiP stream is the one you hear
        if (ch.muted) p.setSlotAudio(i, { muted: false });
      }
    } catch {}
  }

  const nudgeVolume = (i: number, delta: number) => {
    const ch = slots[i];
    if (!ch) return;
    const v = Math.min(1, Math.max(0, (ch.volume ?? 1) + delta));
    p.setSlotAudio(i, { volume: v, muted: v === 0 });
  };

  const solo = (i: number) =>
    slots.slice(0, slotCount).forEach((ch, j) => ch && p.setSlotAudio(j, { muted: j !== i }));

  // Keyboard: 1-9 focus · F expand · Shift+F fullscreen · Esc back · M mute slot · Shift+M mute all
  // S solo audio · ↑/↓ slot volume · P PiP · R reload · X close · A add stream · J follow a player
  // YouTube slots: ←/→ seek 10 s · Space play/pause · T send slot to TV · Shift+T whole multiview
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || e.metaKey || e.ctrlKey) return;
      const n = Number(e.key);
      const ch = slots[focused];
      const yt = (cmd: YtCommand) =>
        slotEls.current.get(ch!.id)?.dispatchEvent(new CustomEvent(YT_COMMAND, { detail: cmd }));
      if (ch?.kind === "youtube" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) yt({ seek: e.key === "ArrowLeft" ? -10 : 10 });
      else if (ch?.kind === "youtube" && e.key === " ") yt({ toggle: true });
      else if (n >= 1 && n <= slotCount) {
        p.setFocused(n - 1);
        if (expanded !== null && slots[n - 1]) setExpanded(n - 1);
      } else if (e.key === "F") setAppFullscreen(!immersive);
      else if (e.key === "f") ch && toggleExpand(focused);
      else if (e.key === "t" && tv) ch && (ch.id === p.tvSlotId ? p.onTvBack() : p.onTvSlot(focused));
      else if (e.key === "T" && tv) p.onTvMultiview();
      else if (e.key === "i" && game) setInfo((v) => !v);
      else if (e.key === "g") ch && setLinking(focused);
      else if (e.key === "j" && game) setFollowing("");
      else if (e.key === "Escape") {
        if (p.tvMulti) p.onTvMultiview();
        else if (expanded !== null) setExpanded(null);
        else if (mini) setMiniPlayer(false);
        else if (immersive) setAppFullscreen(false);
        else return;
      } else if (e.key === "M") p.setMasterMuted((m) => !m);
      else if (e.key === "m") ch && p.setSlotAudio(focused, { muted: !ch.muted });
      else if (e.key === "s") ch && solo(focused);
      else if (e.key === "ArrowUp") nudgeVolume(focused, 0.1);
      else if (e.key === "ArrowDown") nudgeVolume(focused, -0.1);
      else if (e.key === "p") togglePip(focused);
      else if (e.key === "r") ch && reload(ch);
      else if (e.key === "x") ch && p.closeSlot(focused);
      else if (e.key === "a") p.onPick(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onDrop(e: React.DragEvent, i: number) {
    e.preventDefault();
    const from = e.dataTransfer.getData("text/x-slot");
    if (from !== "" && Number(from) !== i) p.swapSlots(Number(from), i);
  }

  // Occupied slots are keyed by channel id and rendered in a stable DOM order (sorted by id);
  // grid position comes from CSS `order`. Moving/compacting slots therefore never re-mounts
  // or re-parents a <video>, so the other streams keep playing without reloading.
  const visible = Array.from({ length: slotCount }, (_, i) => ({ i, ch: slots[i] }));
  const occupied = visible.filter((s) => s.ch).sort((a, b) => (a.ch!.id < b.ch!.id ? -1 : 1));
  const empty = visible.filter((s) => !s.ch);
  const hasStreams = occupied.length > 0;

  return (
    <div
      className={`watch ${active ? "" : "hidden"} ${chromeless ? "chromeless" : ""} ${idle ? "idle" : ""}`}
      onMouseMove={chromeless ? wake : undefined}
    >
      <header className="watch-bar">
        <h1>Multiview</h1>
        <div className="layouts">
          {(Object.keys(LAYOUT_SLOTS) as Layout[]).map((l) => (
            <button key={l} className={l === layout ? "active" : ""} onClick={() => p.setLayout(l)}>{l}</button>
          ))}
        </div>
        <button className="primary add-btn" onClick={() => p.onPick(null)} title="Agregar otro stream (A)">
          <PlusIcon /> Agregar
        </button>
        <div className="spacer" />
        {game && (
          <button className={`stats-toggle ${info ? "on" : ""}`} title="Marcador, estadísticas y mercados (I)" onClick={() => setInfo((v) => !v)}>
            {game.away.abbr} {game.state === "pre" ? "vs" : `${game.away.score}-${game.home.score}`} {game.home.abbr}
          </button>
        )}
        <button className="icon" title="Silenciar todo (Shift+M)" onClick={() => p.setMasterMuted((m) => !m)}>
          {volumeIcon(p.masterMuted, p.masterVolume)}
        </button>
        <input type="range" min={0} max={1} step={0.05} value={p.masterVolume}
          onChange={(e) => p.setMasterVolume(Number(e.target.value))} title="Volumen general" />
        {tv && (
          <button className={`icon ${p.tvMulti ? "on" : ""}`} disabled={!hasStreams && !p.tvMulti}
            title={p.tvMulti ? "Traer el multiview a la Mac (Esc)" : "Mandar el multiview a la tele (Shift+T)"}
            onClick={p.onTvMultiview}>
            <TvIcon />
          </button>
        )}
        {miniSupported() && (
          <button className="icon" title="Mini player flotante" onClick={() => setMiniPlayer(true)} disabled={!hasStreams}>
            <MiniIcon />
          </button>
        )}
        <button className="icon" title="Pantalla completa (Shift+F)" onClick={() => setAppFullscreen(true)}>
          <FullscreenIcon />
        </button>
      </header>

      {mini && (
        <div className="mini-bar">
          <button className="icon" title="Silenciar todo" onClick={() => p.setMasterMuted((m) => !m)}>
            {volumeIcon(p.masterMuted, p.masterVolume)}
          </button>
          <div className="spacer" />
          <button className="icon" title="Volver a la ventana normal (Esc)" onClick={() => setMiniPlayer(false)}>
            <FullscreenIcon />
          </button>
        </div>
      )}

      <div className={`watch-body ${matchMode ? "match" : ""}`}>
      <div className="watch-main">
      <main className={`grid layout-${layout.replace("+", "p")} ${expanded !== null ? "has-expanded" : ""}`}>
        {occupied.map(({ i, ch }) => {
          const c = ch!;
          const vol = c.volume ?? 1;
          const audible = !c.muted && !p.masterMuted && vol > 0;
          return (
            <div
              key={c.id}
              data-id={c.id}
              ref={(el) => {
                if (el) slotEls.current.set(c.id, el);
                else slotEls.current.delete(c.id);
              }}
              style={{ order: i }}
              className={`slot pos-${i} ${i === focused ? "focused" : ""} ${i === expanded ? "expanded" : ""} ${matchMode && i === matchIdx ? "match-slot" : ""}`}
              onClick={() => p.setFocused(i)}
              onDoubleClick={() => toggleExpand(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, i)}
            >
              {c.id === p.tvSlotId ? (
                <div className="tv-placeholder">
                  <TvIcon />
                  <strong>Se está viendo en la tele</strong>
                  <button onClick={(e) => { e.stopPropagation(); p.onTvBack(); }}>Traer de vuelta (T)</button>
                </div>
              ) : c.kind === "youtube" ? (
                <YouTubeFrame key={c.url} channel={c} muted={p.masterMuted || !!c.muted}
                  reloadKey={reloadKeys[c.id] ?? 0} volume={vol * p.masterVolume} />
              ) : (
                <Player key={c.url} channel={c} muted={p.masterMuted || !!c.muted}
                  reloadKey={reloadKeys[c.id] ?? 0} volume={vol * p.masterVolume} />
              )}
              {pipId === c.id && <div className="pip-note">Reproduciendo en Picture in Picture</div>}
              {c.game === undefined && p.unmatched.has(c.id) && c.id !== p.tvSlotId && (
                <div className="link-hint" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                  <ScoreboardIcon />
                  <span>No identifiqué el partido</span>
                  <button onClick={() => setLinking(i)}>Buscar</button>
                  <button className="icon" title="No es un partido" onClick={() => p.setSlotGame(i, null)}><CloseIcon /></button>
                </div>
              )}
              {!(matchMode && i === matchIdx) && c.game && c.id !== p.tvSlotId && <SlotScore game={c.game} />}

              <div className="slot-bar" draggable onDragStart={(e) => e.dataTransfer.setData("text/x-slot", String(i))}>
                <span className="slot-num">{i + 1}</span>
                <span className="slot-name">
                  {c.name}
                  {c.subtitle && <small>{c.subtitle}</small>}
                </span>
                <button className="icon" title="Cambiar stream" onClick={(e) => { e.stopPropagation(); p.onPick(i); }}><SwapIcon /></button>
                {tv && (
                  <button className={`icon ${c.id === p.tvSlotId ? "on" : ""}`}
                    title={c.id === p.tvSlotId ? "Traer de la tele (T)" : "Mandar a la tele (T)"}
                    onClick={(e) => { e.stopPropagation(); c.id === p.tvSlotId ? p.onTvBack() : p.onTvSlot(i); }}>
                    <TvIcon />
                  </button>
                )}
                <button className={`icon ${c.game ? "on" : ""}`} title={c.game ? "Cambiar partido vinculado (G)" : "Vincular partido: marcador y estadísticas (G)"}
                  onClick={(e) => { e.stopPropagation(); setLinking(i); }}><ScoreboardIcon /></button>
                <button className="icon" title="Recargar (R)" onClick={() => reload(c)}><ReloadIcon /></button>
                <button className="icon" title="Ampliar / volver al grid (F)" onClick={() => toggleExpand(i)}>
                  {i === expanded ? <CollapseIcon /> : <ExpandIcon />}
                </button>
                <button className="icon" title="Cerrar (X)" onClick={(e) => { e.stopPropagation(); p.closeSlot(i); }}><CloseIcon /></button>
              </div>

              <div className="slot-audio" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                <button className="icon" title="Silenciar este stream (M)" onClick={() => p.setSlotAudio(i, { muted: !c.muted })}>
                  {volumeIcon(!!c.muted, vol)}
                </button>
                <input type="range" min={0} max={1} step={0.05} value={c.muted ? 0 : vol} title="Volumen de este stream (↑/↓)"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    p.setSlotAudio(i, { volume: v, muted: v === 0 });
                  }} />
                {occupied.length > 1 && (
                  <button className="icon solo" title="Escuchar solo este (S)" onClick={() => solo(i)}>solo</button>
                )}
                <div className="spacer" />
                {c.kind !== "youtube" && (
                  <button className={`icon ${pipId === c.id ? "on" : ""}`} title="Picture in Picture (P)" onClick={() => togglePip(i)}>
                    <PipIcon />
                  </button>
                )}
              </div>

              {audible && occupied.length > 1 && <span className="audible-tag" title="Con sonido"><VolumeIcon muted={false} level={1} /></span>}
            </div>
          );
        })}

        {empty.map(({ i }) => (
          <div key={`empty-${i}`} style={{ order: i }} className={`slot pos-${i} ${i === focused ? "focused" : ""}`}
            onClick={() => p.setFocused(i)}>
            <button className="slot-empty" onClick={() => p.onPick(hasStreams ? i : null)}>
              <PlusIcon />
              <span>Agregar stream</span>
              {hasStreams && <small>Slot {i + 1}</small>}
            </button>
          </div>
        ))}
        {/* Follow-a-player alerts: over the streams' top-left, held back by the chosen delay. */}
        <TrackAlerts games={slots.slice(0, slotCount).flatMap((c) => (c?.game ? [c.game] : []))} />
      </main>
      {/* Score + box score live under the stream, never on top of it. */}
      {matchMode && game && (
        <div className="match-dock" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <div className="md-head">
            <ScorePill game={game} big />
            <div className="spacer" />
            <button className="md-toggle" title="Box score y estadísticas (I)" onClick={() => setPanel((v) => !v)}>
              {panel ? "Ocultar estadísticas" : "Box score y estadísticas"} <span className={panel ? "flip" : ""}><ChevronUpIcon /></span>
            </button>
          </div>
          {panel && <MatchPanel game={game} onHide={() => setPanel(false)} onTrack={setFollowing} />}
        </div>
      )}
      </div>
      {matchMode && game && <MatchSide game={game} pm={pm} onTrack={(id) => setFollowing(id ?? "")} />}
      </div>

      {following !== null && game && <TrackPicker game={game} initial={following || undefined} onClose={() => setFollowing(null)} />}

      {linking !== null && (
        <GamePicker current={slots[linking]?.game}
          onPick={(g) => { p.setSlotGame(linking, g); setLinking(null); }} onCancel={() => setLinking(null)} />
      )}
    </div>
  );
}
