import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import type { Channel } from "../types";
import { proxied } from "../lib/proxy";

type Engine = "hls" | "mpegts" | "flv" | "native";
type Status = "loading" | "playing" | "error";

const STALL_SECONDS = 20;

// Order of engines to try; on a fatal error we fall through to the next one.
function engineOrder(url: string): Engine[] {
  const path = url.split(/[?#|]/)[0].toLowerCase();
  if (path.endsWith(".m3u8") || path.endsWith(".m3u")) return ["hls", "mpegts"];
  if (path.endsWith(".flv")) return ["flv"];
  if (/\.(mp4|webm|mov)$/.test(path)) return ["native"];
  // .ts and extensionless IPTV (Xtream style) are usually continuous MPEG-TS.
  // Trying HLS first there would hang reading an endless "manifest".
  return ["mpegts", "hls"];
}

interface Props {
  channel: Channel;
  muted: boolean;
  reloadKey: number;
  volume: number;
}

export function Player({ channel, muted, reloadKey, volume }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [engineLabel, setEngineLabel] = useState("");

  const headersKey = JSON.stringify(channel.headers ?? {});

  useEffect(() => {
    const video = videoRef.current!;
    const engines = engineOrder(channel.url);
    const src = new URL(proxied(channel.url, channel.headers), location.href).href;
    let idx = 0;
    let disposed = false;
    let destroy = () => {};

    setStatus("loading");
    setError("");

    const fail = (msg: string) => {
      if (disposed) return;
      destroy();
      destroy = () => {};
      idx++;
      if (idx < engines.length) start();
      else {
        setError(msg);
        setStatus("error");
      }
    };

    const start = () => {
      const engine = engines[idx];
      setEngineLabel(engine);

      if (engine === "hls") {
        if (!Hls.isSupported()) return fail("HLS no soportado");
        const hls = new Hls({ enableWorker: true, liveSyncDurationCount: 3, manifestLoadingMaxRetry: 2 });
        let recovers = 0;
        hls.on(Hls.Events.ERROR, (_, d) => {
          if (!d.fatal) return;
          const fatalManifest =
            d.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR ||
            d.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
            d.details === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR;
          if (!fatalManifest && recovers++ < 3) {
            if (d.type === Hls.ErrorTypes.MEDIA_ERROR) return hls.recoverMediaError();
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR) return hls.startLoad();
          }
          fail(`HLS: ${d.details}`);
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        destroy = () => hls.destroy();
      } else if (engine === "mpegts" || engine === "flv") {
        if (!mpegts.isSupported()) return fail("MSE no soportado");
        const p = mpegts.createPlayer(
          { type: engine, isLive: true, url: src },
          { enableWorker: true, lazyLoad: false, liveBufferLatencyChasing: true, autoCleanupSourceBuffer: true },
        );
        p.on(mpegts.Events.ERROR, (type: string, detail: string) => fail(`MPEG-TS: ${type} / ${detail}`));
        p.attachMediaElement(video);
        p.load();
        destroy = () => {
          p.unload();
          p.detachMediaElement();
          p.destroy();
        };
      } else {
        const onErr = () => fail(`Media error ${video.error?.code ?? ""}`);
        video.addEventListener("error", onErr, { once: true });
        video.src = src;
        destroy = () => {
          video.removeEventListener("error", onErr);
          video.removeAttribute("src");
          video.load();
        };
      }
      video.play().catch(() => {});
    };

    const onPlaying = () => setStatus("playing");
    const onWaiting = () => setStatus((s) => (s === "error" ? s : "loading"));
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);

    // Live streams sometimes freeze silently: if time doesn't move, restart the current engine.
    let lastTime = -1;
    let stalled = 0;
    const watchdog = window.setInterval(() => {
      if (disposed || video.paused || idx >= engines.length) return;
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        stalled = 0;
        return;
      }
      stalled += 5;
      if (stalled >= STALL_SECONDS) {
        stalled = 0;
        destroy();
        start();
      }
    }, 5000);

    start();

    return () => {
      disposed = true;
      clearInterval(watchdog);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.url, headersKey, reloadKey]);

  useEffect(() => {
    const v = videoRef.current!;
    v.muted = muted;
    v.volume = volume;
  }, [muted, volume]);

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted={muted} />
      {status === "loading" && <div className="slot-status"><div className="spinner" /></div>}
      {status === "error" && (
        <div className="slot-status error">
          <strong>No se pudo reproducir</strong>
          <small>{error}</small>
        </div>
      )}
      {status === "playing" && <span className="engine-tag">{engineLabel}</span>}
    </>
  );
}
