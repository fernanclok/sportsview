// Window-level fullscreen + mini player. In Electron it goes through the preload
// bridge; in a plain browser (npm run dev:web) fullscreen falls back to the HTML API
// and the mini player isn't available.

interface Bridge {
  setFullScreen(v: boolean): Promise<void>;
  isFullScreen(): Promise<boolean>;
  onFullScreen(cb: (v: boolean) => void): () => void;
  setMini(v: boolean): Promise<void>;
  onMini(cb: (v: boolean) => void): () => void;
  pip(on: boolean): Promise<void>;
  getSecret(id: string): Promise<string | null>;
  setSecret(id: string, value: string | null): Promise<void>;
  tvTargets(): Promise<TvTarget[]>;
  tvOpen(channel: unknown, displayId: number): Promise<void>;
  tvClose(): Promise<void>;
  tvMultiview(displayId: number | null): Promise<void>;
  onTvMultiview(cb: (on: boolean) => void): () => void;
  onTvClosed(cb: () => void): () => void;
  onTvChannel(cb: (channel: unknown) => void): () => void;
  onDisplaysChanged(cb: () => void): () => void;
}

export interface TvTarget { id: number; label: string }

declare global {
  interface Window {
    sportsview?: Bridge;
  }
}

export function setAppFullscreen(v: boolean) {
  if (window.sportsview) return void window.sportsview.setFullScreen(v);
  if (v) document.documentElement.requestFullscreen().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen();
}

export function subscribeAppFullscreen(cb: (v: boolean) => void) {
  if (window.sportsview) {
    window.sportsview.isFullScreen().then(cb);
    return window.sportsview.onFullScreen(cb);
  }
  const onChange = () => cb(!!document.fullscreenElement);
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

export const miniSupported = () => !!window.sportsview?.setMini;

export function setMiniPlayer(v: boolean) {
  window.sportsview?.setMini(v);
}

export function subscribeMiniPlayer(cb: (v: boolean) => void) {
  return window.sportsview?.onMini(cb) ?? (() => {});
}

/** Tell the main process a video entered/left PiP (it minimizes/restores the window). */
export function notifyPip(on: boolean) {
  window.sportsview?.pip(on);
}
