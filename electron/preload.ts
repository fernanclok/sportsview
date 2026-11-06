import { contextBridge, ipcRenderer } from "electron";

const subscribe = <T = boolean>(channel: string, cb: (v: T) => void) => {
  const listener = (_: unknown, v: T) => cb(v);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("sportsview", {
  setFullScreen: (v: boolean) => ipcRenderer.invoke("fullscreen:set", v),
  isFullScreen: (): Promise<boolean> => ipcRenderer.invoke("fullscreen:get"),
  onFullScreen: (cb: (v: boolean) => void) => subscribe("fullscreen", cb),
  setMini: (v: boolean) => ipcRenderer.invoke("mini:set", v),
  onMini: (cb: (v: boolean) => void) => subscribe("mini", cb),
  pip: (on: boolean) => ipcRenderer.invoke(on ? "pip:enter" : "pip:leave"),
  getSecret: (id: string): Promise<string | null> => ipcRenderer.invoke("secret:get", id),
  setSecret: (id: string, value: string | null) => ipcRenderer.invoke("secret:set", id, value),
  tvTargets: () => ipcRenderer.invoke("tv:targets"),
  tvOpen: (channel: unknown, displayId: number) => ipcRenderer.invoke("tv:open", channel, displayId),
  tvClose: () => ipcRenderer.invoke("tv:close"),
  tvMultiview: (displayId: number | null) => ipcRenderer.invoke("tv:multiview", displayId),
  onTvMultiview: (cb: (on: boolean) => void) => subscribe("tv:multiview", cb),
  onTvClosed: (cb: () => void) => subscribe("tv:closed", cb),
  onTvChannel: (cb: (channel: unknown) => void) => subscribe<unknown>("tv:channel", cb),
  onDisplaysChanged: (cb: () => void) => subscribe("tv:displays", cb),
});
