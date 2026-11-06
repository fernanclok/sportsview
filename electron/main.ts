import { app, BrowserWindow, ipcMain, safeStorage, screen, shell, type Rectangle } from "electron";
import http from "node:http";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { handleProxy } from "../server/proxy";

// In dev the renderer comes from Vite (which mounts the same /proxy middleware).
// In prod a local server serves dist/ + /proxy on a fixed port, so the origin
// (and therefore localStorage) is stable between launches.
const DEV_URL = process.env.SPORTSVIEW_DEV ? "http://127.0.0.1:5173" : null;
// Fixed so localStorage (keyed by origin) survives restarts; SPORTSVIEW_PORT only for side-by-side test instances.
const PORT = Number(process.env.SPORTSVIEW_PORT) || 47815;
const MIN_SIZE = { width: 900, height: 560 };
const MINI_SIZE = { width: 480, height: 270 };
const IS_MAC = process.platform === "darwin";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function startServer(): Promise<string> {
  const root = path.join(__dirname, "../dist");
  const server = http.createServer(async (req, res) => {
    if (req.url?.startsWith("/proxy")) return handleProxy(req, res).catch(() => res.end());

    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let file = path.join(root, pathname === "/" ? "index.html" : pathname);
    if (!file.startsWith(root)) {
      res.statusCode = 403;
      return res.end();
    }
    try {
      const data = await readFile(file).catch(() => readFile((file = path.join(root, "index.html"))));
      res.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(`http://127.0.0.1:${PORT}`));
  });
}

let mainWin: BrowserWindow | null = null;
let appUrl = "";

const WEB_PREFS = {
  preload: path.join(__dirname, "preload.cjs"),
  autoplayPolicy: "no-user-gesture-required" as const,
  // Keep hls.js/mpegts timers running at full speed while minimized or covered
  // (e.g. watching in Picture in Picture from another app).
  backgroundThrottling: false,
  contextIsolation: true,
  sandbox: true,
};

function openLinksExternally(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

async function createWindow() {
  const url = (appUrl = DEV_URL ?? (await startServer()));
  const win = (mainWin = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: "SportsView",
    backgroundColor: "#0b0d10",
    // macOS: content under the traffic lights. Windows/Linux keep the native frame
    // (hiddenInset there would remove the close/minimize buttons).
    ...(IS_MAC ? { titleBarStyle: "hiddenInset" as const } : {}),
    autoHideMenuBar: true,
    webPreferences: WEB_PREFS,
  }));

  // External links go to the real browser, never inside the app.
  openLinksExternally(win);
  win.on("closed", () => {
    mainWin = null;
    tvWin?.close();
  });

  // Native fullscreen (green button / Ctrl+Cmd+F) drives the renderer's immersive mode.
  win.on("enter-full-screen", () => win.webContents.send("fullscreen", true));
  win.on("leave-full-screen", () => win.webContents.send("fullscreen", false));

  await win.loadURL(url);
}

// Mini player: the whole window becomes a small always-on-top floating player that
// stays visible over other apps and Spaces (PiP for the entire multiview).
let normalBounds: Rectangle | null = null;

function setMini(win: BrowserWindow, on: boolean) {
  if (on === !!normalBounds) return;
  if (on && win.isFullScreen()) {
    win.once("leave-full-screen", () => setMini(win, true));
    win.setFullScreen(false);
    return;
  }
  if (on) {
    normalBounds = win.getBounds();
    const { workArea } = screen.getDisplayMatching(normalBounds);
    win.setMinimumSize(256, 144);
    win.setAlwaysOnTop(true, "floating");
    if (IS_MAC) {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setWindowButtonVisibility(false);
    }
    win.setBounds({
      x: workArea.x + workArea.width - MINI_SIZE.width - 24,
      y: workArea.y + workArea.height - MINI_SIZE.height - 24,
      ...MINI_SIZE,
    }, true);
    win.setAspectRatio(16 / 9);
  } else {
    win.setAspectRatio(0);
    win.setAlwaysOnTop(false);
    if (IS_MAC) {
      win.setVisibleOnAllWorkspaces(false);
      win.setWindowButtonVisibility(true);
    }
    win.setMinimumSize(MIN_SIZE.width, MIN_SIZE.height);
    win.setBounds(normalBounds!, true);
    normalBounds = null;
  }
  win.webContents.send("mini", on);
}

// Picture in Picture: get the main window out of the way (leave fullscreen + minimize)
// so only the floating PiP video remains; bring it back when PiP closes.
let pipRestoreFullscreen = false;

ipcMain.handle("pip:enter", (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || normalBounds) return; // mini player is already small and floating
  pipRestoreFullscreen = win.isFullScreen();
  if (pipRestoreFullscreen) {
    win.once("leave-full-screen", () => win.minimize());
    win.setFullScreen(false);
  } else {
    win.minimize();
  }
});

ipcMain.handle("pip:leave", (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || normalBounds) return;
  const refullscreen = pipRestoreFullscreen;
  pipRestoreFullscreen = false;
  const done = () => {
    win.focus();
    if (refullscreen) win.setFullScreen(true);
  };
  if (win.isMinimized()) {
    win.once("restore", done);
    win.restore();
  } else {
    done();
  }
});

// Secrets (IPTV passwords) are encrypted with the macOS Keychain via safeStorage and
// kept in userData, never in the renderer's localStorage.
const secretsFile = () => path.join(app.getPath("userData"), "secrets.json");

async function readSecrets(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(secretsFile(), "utf8"));
  } catch {
    return {};
  }
}

ipcMain.handle("secret:get", async (_, id: string) => {
  const enc = (await readSecrets())[id];
  if (!enc) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, "base64"));
  } catch {
    return null;
  }
});
ipcMain.handle("secret:set", async (_, id: string, value: string | null) => {
  const all = await readSecrets();
  if (value == null) delete all[id];
  else all[id] = safeStorage.encryptString(value).toString("base64");
  await writeFile(secretsFile(), JSON.stringify(all), { mode: 0o600 });
});

// TV: AirPlay (or HDMI) connected as an extended display. Either the whole window moves
// there in fullscreen, or a second fullscreen window plays a single stream on it.
let tvWin: BrowserWindow | null = null;
let tvReturn: { bounds: Rectangle; fullscreen: boolean } | null = null;

const displayLabel = (d: Electron.Display) => d.label || `Pantalla ${d.size.width}×${d.size.height}`;

/** Displays other than the one the main window is on. */
function tvTargets() {
  // SPORTSVIEW_TV_TEST=1: treat every display (including this one) as a TV, to test without one.
  if (process.env.SPORTSVIEW_TV_TEST) return screen.getAllDisplays().map((d) => ({ id: d.id, label: `${displayLabel(d)} (prueba)` }));
  const here = mainWin ? screen.getDisplayMatching(mainWin.getBounds()).id : screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().filter((d) => d.id !== here).map((d) => ({ id: d.id, label: displayLabel(d) }));
}

/** Leave fullscreen if needed, then run `next` once the macOS transition is over. */
function afterLeavingFullscreen(win: BrowserWindow, next: () => void) {
  if (!win.isFullScreen()) return next();
  win.once("leave-full-screen", () => setTimeout(next, 400));
  win.setFullScreen(false);
}

function setTvMultiview(displayId: number | null) {
  const win = mainWin;
  if (!win) return;
  if (displayId == null) {
    const back = tvReturn;
    if (!back) return;
    tvReturn = null;
    afterLeavingFullscreen(win, () => {
      win.setBounds(back.bounds);
      if (back.fullscreen) win.setFullScreen(true);
    });
    win.webContents.send("tv:multiview", false);
    return;
  }
  const d = screen.getAllDisplays().find((x) => x.id === displayId);
  if (!d) return;
  if (normalBounds) setMini(win, false);
  tvReturn ??= { bounds: win.isFullScreen() ? win.getNormalBounds() : win.getBounds(), fullscreen: win.isFullScreen() };
  afterLeavingFullscreen(win, () => {
    win.setBounds(d.workArea);
    win.setFullScreen(true);
  });
  win.webContents.send("tv:multiview", true);
}

ipcMain.handle("tv:targets", () => tvTargets());
ipcMain.handle("tv:multiview", (_, displayId: number | null) => setTvMultiview(displayId));
ipcMain.handle("tv:close", () => tvWin?.close());
ipcMain.handle("tv:open", async (_, channel: unknown, displayId: number) => {
  if (tvWin) {
    tvWin.webContents.send("tv:channel", channel);
    return;
  }
  const d = screen.getAllDisplays().find((x) => x.id === displayId);
  if (!d) throw new Error("La tele ya no está conectada");
  const win = (tvWin = new BrowserWindow({
    ...d.bounds,
    title: "SportsView · TV",
    backgroundColor: "#000000",
    show: false,
    webPreferences: WEB_PREFS,
  }));
  openLinksExternally(win);
  win.on("closed", () => {
    tvWin = null;
    mainWin?.webContents.send("tv:closed");
  });
  await win.loadURL(`${appUrl}/#tv`);
  win.webContents.send("tv:channel", channel);
  win.show();
  win.setFullScreen(true);
});

function watchDisplays() {
  const changed = () => mainWin?.webContents.send("tv:displays");
  screen.on("display-added", changed);
  screen.on("display-removed", (_, gone) => {
    // TV disconnected: close its window / bring the multiview back to the Mac.
    if (tvWin && screen.getDisplayMatching(tvWin.getBounds()).id === gone.id) tvWin.close();
    if (tvReturn) setTvMultiview(null);
    changed();
  });
}

ipcMain.handle("mini:set", (e, v: boolean) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) setMini(win, v);
});
ipcMain.handle("fullscreen:set", (e, v: boolean) => BrowserWindow.fromWebContents(e.sender)?.setFullScreen(v));
ipcMain.handle("fullscreen:get", (e) => BrowserWindow.fromWebContents(e.sender)?.isFullScreen() ?? false);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = mainWin;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    watchDisplays();
    return createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
