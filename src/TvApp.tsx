import { useEffect, useState } from "react";
import type { Channel } from "./types";
import { Player } from "./components/Player";
import { YouTubeFrame } from "./components/YouTubeFrame";
import { onTvChannel, tvClose } from "./lib/tv";

/** Fullscreen window on the TV playing a single stream sent from the multiview. */
export function TvApp() {
  const [ch, setCh] = useState<Channel | null>(null);
  const [info, setInfo] = useState(true);

  useEffect(() => onTvChannel((c) => setCh(c)), []);

  // Show what's playing for a few seconds whenever the stream changes.
  useEffect(() => {
    setInfo(true);
    const t = window.setTimeout(() => setInfo(false), 5000);
    return () => clearTimeout(t);
  }, [ch?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && tvClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="tv">
      {!ch ? (
        <div className="slot-status"><div className="spinner" /></div>
      ) : ch.kind === "youtube" ? (
        <YouTubeFrame key={ch.id} channel={ch} muted={false} reloadKey={0} volume={ch.volume ?? 1} />
      ) : (
        <Player key={ch.id} channel={ch} muted={false} reloadKey={0} volume={ch.volume ?? 1} />
      )}
      {ch && (
        <div className={`tv-info ${info ? "" : "hidden"}`}>
          <strong>{ch.name}</strong>
          {ch.subtitle && <small>{ch.subtitle}</small>}
        </div>
      )}
    </div>
  );
}
