import { useEffect, useRef, useState } from "react";
import type { Channel } from "../types";
import { youtubeId } from "../lib/youtube";
import { PauseIcon, PlayIcon } from "./Icons";

const YT_ORIGIN = "https://www.youtube.com";

// Error codes from the IFrame API.
const ERRORS: Record<number, string> = {
  100: "El video no existe o es privado",
  101: "El canal no permite verlo fuera de YouTube",
  150: "El canal no permite verlo fuera de YouTube",
  153: "YouTube rechazó el reproductor incrustado",
};

const fmt = (s: number) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

/** Sent by Multiview's keyboard shortcuts to the focused slot. */
export type YtCommand = { seek: number } | { toggle: true };
export const YT_COMMAND = "sportsview:yt";

interface Info { time: number; duration: number; state: number; live: boolean }

interface Props {
  channel: Channel;
  muted: boolean;
  reloadKey: number;
  volume: number;
}

// Talks to the embed with the IFrame API's postMessage protocol instead of loading
// youtube.com/iframe_api into our page (that script would run with access to the app bridge).
export function YouTubeFrame({ channel, muted, reloadKey, volume }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<number | null>(null);
  const [info, setInfo] = useState<Info>({ time: 0, duration: 0, state: -1, live: false });
  const [scrub, setScrub] = useState<number | null>(null);
  const id = youtubeId(channel.url);
  const src =
    `${YT_ORIGIN}/embed/${id}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&iv_load_policy=3` +
    `&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;

  const post = (func: string, args: unknown[] = []) =>
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args, id: 1, channel: "widget" }), YT_ORIGIN);

  useEffect(() => {
    const iframe = ref.current!;
    let hello = 0;
    setReady(false);
    setError(null);
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      let d: { event?: string; info?: unknown };
      try {
        d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (d.event === "onError") setError(Number(d.info));
      else if (d.event === "onReady" || d.event === "initialDelivery" || d.event === "infoDelivery") {
        clearInterval(hello);
        setReady(true);
        const x = (d.info ?? {}) as { currentTime?: number; duration?: number; playerState?: number; videoData?: { isLive?: boolean } };
        setInfo((o) => ({
          time: x.currentTime ?? o.time,
          duration: x.duration ?? o.duration,
          state: x.playerState ?? o.state,
          live: x.videoData?.isLive ?? o.live,
        }));
      }
    };
    // The embed only reports events after a "listening" handshake.
    const onLoad = () => {
      const say = () => iframe.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), YT_ORIGIN);
      say();
      hello = window.setInterval(say, 500);
    };
    window.addEventListener("message", onMsg);
    iframe.addEventListener("load", onLoad);
    return () => {
      clearInterval(hello);
      window.removeEventListener("message", onMsg);
      iframe.removeEventListener("load", onLoad);
    };
  }, [src, reloadKey]);

  const seekTo = (t: number) => {
    const to = Math.min(Math.max(0, t), info.duration || t);
    post("seekTo", [to, true]);
    setInfo((o) => ({ ...o, time: to }));
  };
  const toggle = () => post(info.state === 1 || info.state === 3 ? "pauseVideo" : "playVideo");

  // Keyboard shortcuts arrive as a DOM event on the slot (see Multiview).
  const cmdRef = useRef<(c: YtCommand) => void>(() => {});
  cmdRef.current = (c) => ("seek" in c ? seekTo(info.time + c.seek) : toggle());
  useEffect(() => {
    const slot = ref.current?.parentElement;
    const on = (e: Event) => cmdRef.current((e as CustomEvent<YtCommand>).detail);
    slot?.addEventListener(YT_COMMAND, on);
    return () => slot?.removeEventListener(YT_COMMAND, on);
  }, []);

  useEffect(() => {
    if (!ready) return;
    post("setVolume", [Math.round(volume * 100)]);
    post(muted ? "mute" : "unMute");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, muted, volume]);

  useEffect(() => {
    if (ready) post("playVideo");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const playing = info.state === 1 || info.state === 3;
  const shown = scrub ?? info.time;
  const behind = info.duration - shown;
  const atLive = info.live && behind < 15;
  const commit = () => {
    if (scrub != null) seekTo(scrub);
    setScrub(null);
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <iframe key={reloadKey} ref={ref} className="yt-frame" src={src} title={channel.name}
        allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />
      {/* Clicks/keys/mouse moves stay with the app (focus slot, shortcuts, idle UI) instead of the iframe. */}
      <div className="yt-shield" />
      {!ready && error == null && <div className="slot-status"><div className="spinner" /></div>}
      {error != null && (
        <div className="slot-status error yt-error">
          <strong>No se puede ver aquí</strong>
          <small>{ERRORS[error] ?? `Error de YouTube (${error})`}</small>
          <button onClick={(e) => { e.stopPropagation(); window.open(channel.url); }}>Abrir en YouTube</button>
        </div>
      )}
      {ready && error == null && info.duration > 0 && (
        <div className="yt-controls" onClick={stop} onDoubleClick={stop}>
          <button className="icon" title={playing ? "Pausa (Espacio)" : "Reproducir (Espacio)"} onClick={toggle}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="icon" title="Atrasar 10 s (←)" onClick={() => seekTo(info.time - 10)}>−10</button>
          <button className="icon" title="Adelantar 10 s (→)" onClick={() => seekTo(info.time + 10)}>+10</button>
          <span className="yt-time">{info.live ? (atLive ? "" : `−${fmt(behind)}`) : fmt(shown)}</span>
          <input type="range" min={0} max={info.duration} step={1} value={shown}
            onChange={(e) => setScrub(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
          {info.live ? (
            <button className={`yt-live ${atLive ? "on" : ""}`} title="Ir al directo" onClick={() => seekTo(info.duration)}>
              <i className="led" /> En vivo
            </button>
          ) : (
            <span className="yt-time">{fmt(info.duration)}</span>
          )}
        </div>
      )}
    </>
  );
}
