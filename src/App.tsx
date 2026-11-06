import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AddonCatalog, Channel, GameRef, Layout, LoadState, MetaItem, Source, StreamOption, View } from "./types";
import { GROW_ORDER, LAYOUT_SLOTS } from "./types";
import { load, save } from "./lib/storage";
import { parseM3U } from "./lib/m3u";
import { catalogsOf, fetchCatalog, fetchManifest, isAddonUrl, type Manifest } from "./lib/addon";
import { fetchText } from "./lib/proxy";
import { getSecret, setSecret } from "./lib/secrets";
import { isYouTubeUrl, resolveYouTube } from "./lib/youtube";
import { identifyGame } from "./lib/identify";
import { fetchXtreamChannels, normalizeServer, xtreamLogin } from "./lib/xtream";
import { setAppFullscreen, setMiniPlayer, subscribeAppFullscreen, subscribeMiniPlayer, type TvTarget } from "./lib/fullscreen";
import { onTvClosed, onTvMultiview, tvClose, tvMultiview, tvOpen, tvTargets } from "./lib/tv";
import { TvPicker } from "./components/TvPicker";
import { GridIcon, HomeIcon, PuzzleIcon } from "./components/Icons";
import { Home } from "./views/Home";
import { CatalogView } from "./views/CatalogView";
import { Detail } from "./views/Detail";
import { Channels } from "./views/Channels";
import { Sources } from "./views/Sources";
import { Multiview } from "./views/Multiview";

const MAX_SLOTS = 9;
const ROWS_REFRESH_MS = 5 * 60_000; // live events change status (TODAY -> LIVE)
const RELINK_MS = 4 * 60_000; // retry identifying unlinked streams (the game may start later)

type AddonState = LoadState<{ manifest: Manifest; catalogs: AddonCatalog[] }>;

const favKey = (c: Channel) => `${c.sourceId}|${c.name}`;
const uid = () => Math.random().toString(36).slice(2, 10);

export default function App() {
  // --- sources & data ---
  const [sources, setSources] = useState<Source[]>(() => load("sources", []));
  const [addons, setAddons] = useState<Record<string, AddonState>>({});
  const [rows, setRows] = useState<Record<string, LoadState<MetaItem[]>>>({});
  const [m3u, setM3u] = useState<Record<string, LoadState<Channel[]>>>({});
  const [favorites, setFavorites] = useState<string[]>(() => load("favorites", []));

  // --- multiview ---
  // Always start as a single big player; the grid grows as streams are added.
  const [layout, setLayout] = useState<Layout>("1");
  // Slots are intentionally not persisted: live streams/URLs don't survive a restart.
  const [slots, setSlots] = useState<(Channel | null)[]>(() => Array(MAX_SLOTS).fill(null));
  const [focused, setFocused] = useState(0);
  const [masterMuted, setMasterMuted] = useState(false);
  const [masterVolume, setMasterVolume] = useState<number>(() => load("volume", 1));
  // Picking a stream from Home/Detail: for a specific slot, or (slot: null) to add a new one.
  const [pick, setPick] = useState<{ slot: number | null } | null>(null);
  const [mini, setMini] = useState(false);
  // TV: id of the slot's channel playing on the TV window, and whether the whole multiview is there.
  const [tvSlotId, setTvSlotId] = useState<string | null>(null);
  const [tvMulti, setTvMulti] = useState(false);
  const [tvAsk, setTvAsk] = useState<{ slot: number | null } | null>(null);
  const [watchMounted, setWatchMounted] = useState(false);

  // --- navigation ---
  const [stack, setStack] = useState<View[]>([{ name: "home" }]);
  const view = stack[stack.length - 1];
  const [immersive, setImmersive] = useState(false);
  const [toast, setToast] = useState("");

  const slotCount = LAYOUT_SLOTS[layout];

  useEffect(() => save("sources", sources), [sources]);
  useEffect(() => save("favorites", favorites), [favorites]);
  useEffect(() => save("volume", masterVolume), [masterVolume]);
  useEffect(() => subscribeAppFullscreen(setImmersive), []);
  useEffect(
    () =>
      subscribeMiniPlayer((on) => {
        setMini(on);
        if (on) {
          setPick(null);
          setStack([{ name: "watch" }]);
        }
      }),
    [],
  );
  useEffect(() => onTvClosed(() => setTvSlotId(null)), []);
  useEffect(
    () =>
      onTvMultiview((on) => {
        setTvMulti(on);
        if (on) {
          setPick(null);
          setStack([{ name: "watch" }]);
        }
      }),
    [],
  );
  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? "" : t)), 3500);
  }, []);

  // Auto-link streams to an ESPN game (title → IPTV guide → network). `game === undefined` means "not
  // linked yet"; null means the user said it isn't a game. Misses retry: the game may not have started.
  const [unmatched, setUnmatched] = useState<Set<string>>(new Set());
  const linkTried = useRef(new Set<string>());
  const identifying = useRef(new Set<string>());
  const identify = useCallback(
    async (c: Channel) => {
      if (identifying.current.has(c.id)) return;
      identifying.current.add(c.id);
      try {
        const hit = await identifyGame(c, sources.find((s) => s.id === c.sourceId)).catch(() => null);
        setUnmatched((u) => {
          const n = new Set(u);
          if (hit) n.delete(c.id);
          else n.add(c.id);
          return n;
        });
        if (!hit) return;
        let linked = false;
        setSlots((s) =>
          s.map((x) => {
            if (x?.id !== c.id || x.game !== undefined) return x;
            linked = true;
            return { ...x, game: hit.game.ref };
          }),
        );
        if (linked) notify(`Partido identificado por ${hit.via}: ${hit.game.away.name} @ ${hit.game.home.name} · G para cambiarlo`);
      } finally {
        identifying.current.delete(c.id);
      }
    },
    [sources, notify],
  );
  useEffect(() => {
    for (const c of slots) {
      if (!c || c.game !== undefined || linkTried.current.has(c.id)) continue;
      linkTried.current.add(c.id);
      identify(c);
    }
  }, [slots, identify]);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  useEffect(() => {
    const t = window.setInterval(() => {
      for (const c of slotsRef.current) if (c && c.game === undefined && unmatched.has(c.id)) identify(c);
    }, RELINK_MS);
    return () => clearInterval(t);
  }, [unmatched, identify]);

  // The slot that was on the TV got closed or replaced: stop the TV too.
  useEffect(() => {
    if (tvSlotId && !slots.some((c) => c?.id === tvSlotId)) tvClose();
  }, [slots, tvSlotId]);
  useEffect(() => {
    if (focused >= slotCount) setFocused(0);
  }, [slotCount, focused]);
  useEffect(() => {
    if (view.name === "watch") setWatchMounted(true);
  }, [view.name]);


  const navigate = (v: View) => setStack((s) => [...s, v]);
  const goTab = (v: View) => setStack([v]);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  // --- loading ---
  const loadRow = useCallback(async (cat: AddonCatalog) => {
    setRows((r) => ({ ...r, [cat.key]: { status: "loading", data: r[cat.key]?.data } }));
    try {
      const data = await fetchCatalog(cat);
      setRows((r) => ({ ...r, [cat.key]: { status: "ok", data } }));
    } catch (e) {
      setRows((r) => ({ ...r, [cat.key]: { status: "error", error: (e as Error).message } }));
    }
  }, []);

  const loadSource = useCallback(
    async (src: Source) => {
      if (src.kind === "m3u" || src.kind === "xtream") {
        setM3u((s) => ({ ...s, [src.id]: { status: "loading", data: s[src.id]?.data } }));
        try {
          let data: Channel[];
          if (src.kind === "m3u") data = parseM3U(await fetchText(src.url), src.id);
          else {
            const pass = await getSecret(src.id);
            if (!pass) throw new Error("Falta la contraseña · quita y vuelve a agregar la cuenta");
            data = await fetchXtreamChannels(src.url, src.username!, pass, src.id);
          }
          setM3u((s) => ({ ...s, [src.id]: { status: "ok", data } }));
        } catch (e) {
          setM3u((s) => ({ ...s, [src.id]: { status: "error", error: (e as Error).message } }));
        }
        return;
      }
      setAddons((a) => ({ ...a, [src.id]: { status: "loading", data: a[src.id]?.data } }));
      try {
        const manifest = await fetchManifest(src.url);
        const catalogs = catalogsOf(manifest, src.url, src.id);
        setAddons((a) => ({ ...a, [src.id]: { status: "ok", data: { manifest, catalogs } } }));
        catalogs.filter((c) => c.browsable).forEach(loadRow);
      } catch (e) {
        setAddons((a) => ({ ...a, [src.id]: { status: "error", error: (e as Error).message } }));
      }
    },
    [loadRow],
  );

  useEffect(() => {
    sources.forEach(loadSource);
    // only on mount; new sources are loaded when added
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catalogs = useMemo(
    () => sources.flatMap((s) => addons[s.id]?.data?.catalogs ?? []),
    [sources, addons],
  );
  const allChannels = useMemo(() => sources.flatMap((s) => m3u[s.id]?.data ?? []), [sources, m3u]);
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  useEffect(() => {
    const t = window.setInterval(() => catalogs.filter((c) => c.browsable).forEach(loadRow), ROWS_REFRESH_MS);
    return () => clearInterval(t);
  }, [catalogs, loadRow]);

  async function addSource(raw: string) {
    const url = raw.trim();
    if (!/^(https?|stremio):\/\//i.test(url)) {
      notify("URL inválida");
      return false;
    }
    if (sources.some((s) => s.url === url)) {
      notify("Esa fuente ya está agregada");
      return false;
    }
    const kind = isAddonUrl(url) ? "addon" : "m3u";
    let name = new URL(url.replace(/^stremio:/i, "https:")).hostname;
    if (kind === "addon") {
      try {
        name = (await fetchManifest(url)).name;
      } catch (e) {
        notify(`No se pudo leer el manifest: ${(e as Error).message}`);
        return false;
      }
    }
    const src: Source = { id: uid(), kind, name, url };
    setSources((s) => [...s, src]);
    loadSource(src);
    notify(`“${name}” agregado`);
    return true;
  }

  async function addXtream(rawServer: string, username: string, password: string) {
    const server = normalizeServer(rawServer);
    if (sources.some((s) => s.kind === "xtream" && s.url === server && s.username === username)) {
      notify("Esa cuenta ya está agregada");
      return false;
    }
    let info;
    try {
      info = await xtreamLogin(server, username, password);
    } catch (e) {
      notify(`No se pudo iniciar sesión: ${(e as Error).message}`);
      return false;
    }
    const src: Source = {
      id: uid(), kind: "xtream", name: new URL(server).hostname, url: server, username,
      maxConnections: info.maxConnections,
    };
    await setSecret(src.id, password);
    setSources((s) => [...s, src]);
    loadSource(src);
    const exp = info.expires ? ` · vence ${info.expires.toLocaleDateString()}` : "";
    notify(`Cuenta Xtream agregada · ${info.maxConnections} conexión${info.maxConnections === 1 ? "" : "es"}${exp}`);
    return true;
  }

  function removeSource(id: string) {
    if (sources.find((s) => s.id === id)?.kind === "xtream") setSecret(id, null);
    setSources((s) => s.filter((x) => x.id !== id));
    setAddons(({ [id]: _, ...rest }) => rest);
    setM3u(({ [id]: _, ...rest }) => rest);
  }

  function sourceStatus(s: Source) {
    const st = s.kind === "addon" ? addons[s.id] : m3u[s.id];
    if (!st || st.status === "loading") return { label: "Cargando…", error: false };
    if (st.status === "error") return { label: st.error ?? "Error", error: true };
    if (s.kind !== "addon") {
      const n = (st.data as Channel[]).length.toLocaleString();
      const cons = s.maxConnections ? ` · ${s.maxConnections} conexión${s.maxConnections === 1 ? "" : "es"}` : "";
      return { label: `${n} canales${cons}`, error: false };
    }
    const n = (st.data as { catalogs: AddonCatalog[] }).catalogs.length;
    return { label: `${n} catálogo${n === 1 ? "" : "s"}`, error: false };
  }

  // --- multiview slot placement ---
  // Picked slot > first free slot > grow the layout > replace the focused slot.
  function planTarget(): { slot: number; layout: Layout; replaces: boolean } {
    if (pick?.slot != null) return { slot: pick.slot, layout, replaces: !!slots[pick.slot] };
    const free = slots.slice(0, slotCount).findIndex((s) => !s);
    if (free >= 0) return { slot: free, layout, replaces: false };
    const bigger = GROW_ORDER.find((l) => LAYOUT_SLOTS[l] > slotCount);
    if (bigger) return { slot: slotCount, layout: bigger, replaces: false };
    return { slot: focused, layout, replaces: true };
  }

  function targetLabel() {
    const t = planTarget();
    return t.replaces ? `Reemplaza el slot ${t.slot + 1}` : `Se abrirá en el slot ${t.slot + 1}`;
  }

  function addToMultiview(incoming: Channel) {
    let t = planTarget();
    const visible = slots.slice(0, slotCount);
    // IPTV plans cap simultaneous streams: past the cap, a new one from the same account
    // would get kicked (or kick the other), so it replaces that account's slot instead.
    const src = sources.find((s) => s.id === incoming.sourceId);
    if (src?.maxConnections) {
      const using = visible.flatMap((c, i) => (c?.sourceId === src.id && !(t.replaces && i === t.slot) ? [i] : []));
      if (using.length >= src.maxConnections) {
        const slot = using.includes(focused) ? focused : using[0];
        t = { slot, layout, replaces: true };
        notify(`${src.name}: tu plan permite ${src.maxConnections} conexión${src.maxConnections === 1 ? "" : "es"} · reemplaza el slot ${slot + 1}`);
      }
    }
    const replaced = t.replaces ? slots[t.slot] : null;
    // Audio: a replacement keeps the slot's audio settings; a new stream starts muted
    // if something else is already audible, so two commentaries don't overlap.
    const someoneAudible = visible.some((c, i) => c && i !== t.slot && !c.muted);
    const ch: Channel = {
      ...incoming,
      volume: replaced?.volume ?? 1,
      muted: replaced ? replaced.muted : someoneAudible,
    };
    if (!replaced && someoneAudible) notify("Agregado sin sonido · activa el audio en el slot");
    setSlots((s) =>
      s.map((x, i) => {
        if (i === t.slot) return ch;
        // slots revealed by auto-grow may hold stale channels from an earlier, bigger layout
        if (t.layout !== layout && i >= slotCount && i < LAYOUT_SLOTS[t.layout]) return null;
        return x;
      }),
    );
    if (t.layout !== layout) setLayout(t.layout);
    if (!visible.some(Boolean)) setFocused(t.slot);
    setPick(null);
    goTab({ name: "watch" });
  }

  function playStream(s: StreamOption, meta: MetaItem) {
    addToMultiview({
      id: uid(),
      name: meta.name,
      subtitle: s.name.replace(/\s*\n\s*/g, " · "),
      url: s.url!,
      headers: s.headers,
      logo: meta.poster,
      sourceId: meta.sourceId,
    });
  }

  async function playDirect(url: string) {
    if (!/^https?:\/\//i.test(url)) return notify("URL inválida");
    if (isYouTubeUrl(url)) {
      try {
        const yt = await resolveYouTube(url);
        addToMultiview({
          id: uid(), kind: "youtube", name: yt.title, subtitle: yt.author ? `YouTube · ${yt.author}` : "YouTube",
          url: yt.url, logo: yt.thumbnail, sourceId: "youtube",
        });
      } catch (e) {
        notify(`YouTube: ${(e as Error).message}`);
      }
      return;
    }
    addToMultiview({ id: uid(), name: new URL(url).hostname, url, sourceId: "direct" });
  }

  // slot === null sends the whole multiview.
  async function sendToTv(slot: number | null) {
    const targets = await tvTargets();
    if (targets.length === 1) sendToDisplay(slot, targets[0]);
    else setTvAsk({ slot });
  }

  async function sendToDisplay(slot: number | null, t: TvTarget) {
    setTvAsk(null);
    if (slot === null) return tvMultiview(t.id);
    const ch = slots[slot];
    if (!ch) return;
    // Stop it on the Mac first: 1-connection IPTV plans would reject the TV otherwise.
    setTvSlotId(ch.id);
    try {
      await tvOpen({ ...ch, muted: false }, t.id);
      notify(`“${ch.name}” en ${t.label}`);
    } catch (e) {
      setTvSlotId(null);
      notify(`No se pudo mandar a la tele: ${(e as Error).message}`);
    }
  }

  function pickFor(slot: number | null) {
    setPick({ slot });
    goTab({ name: "home" });
  }

  // Closing a stream compacts the remaining ones and shrinks the grid to fit them.
  function closeSlot(i: number) {
    const kept = slots.slice(0, slotCount).filter((c, j) => c && j !== i) as Channel[];
    const fit = GROW_ORDER.find((l) => LAYOUT_SLOTS[l] >= Math.max(kept.length, 1))!;
    const nextFocus = Math.min(focused > i ? focused - 1 : focused, Math.max(kept.length - 1, 0));
    // If the audible stream was closed, the newly focused one takes over the audio.
    if (kept.length && kept.every((c) => c.muted)) kept[nextFocus] = { ...kept[nextFocus], muted: false };
    setSlots(Array.from({ length: MAX_SLOTS }, (_, j) => kept[j] ?? null));
    if (LAYOUT_SLOTS[fit] < slotCount) setLayout(fit);
    setFocused(nextFocus);
    if (!kept.length && mini) setMiniPlayer(false);
  }

  // Audio follows focus: selecting a different slot unmutes it and mutes the rest.
  // (Per-slot mute buttons can still mix several streams until the focus changes again.)
  const focusSlot = (i: number) => {
    if (i === focused) return;
    setFocused(i);
    if (!slots[i]) return; // empty slot: don't silence what's playing
    setSlots((s) => s.map((c, j) => (c ? { ...c, muted: j !== i } : c)));
  };

  const setSlotGame = (i: number, game: GameRef | null) =>
    setSlots((s) => s.map((x, j) => (j === i && x ? { ...x, game } : x)));
  const setSlotAudio = (i: number, patch: Pick<Channel, "volume" | "muted">) =>
    setSlots((s) => s.map((x, j) => (j === i && x ? { ...x, ...patch } : x)));
  const swapSlots = (a: number, b: number) =>
    setSlots((s) => {
      const n = [...s];
      [n[a], n[b]] = [n[b], n[a]];
      return n;
    });
  const toggleFav = (c: Channel) => {
    const k = favKey(c);
    setFavorites((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  };

  // Esc goes back on detail/catalog pages (Multiview handles its own keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || view.name === "watch") return;
      if ((e.target as HTMLElement).tagName === "INPUT") return (e.target as HTMLElement).blur();
      if (stack.length > 1) back();
      else if (pick) setPick(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const activeSlots = slots.slice(0, slotCount).filter(Boolean).length;
  const inWatch = view.name === "watch";

  // Closed the last stream (or landed on an empty multiview): back to the menu.
  useEffect(() => {
    if (!inWatch || activeSlots || mini) return;
    if (immersive) setAppFullscreen(false);
    setStack([{ name: "home" }]);
  }, [inWatch, activeSlots, mini, immersive]);

  useEffect(() => {
    if (immersive && inWatch) notify("Esc para salir · mueve el mouse para ver controles");
  }, [immersive, inWatch, notify]);

  const NAV: { view: View; label: string; icon: React.ReactNode; badge?: number }[] = [
    { view: { name: "home" }, label: "Inicio", icon: <HomeIcon /> },
    // Multiview only shows up while something is playing.
    ...(activeSlots ? [{ view: { name: "watch" } as View, label: "Multiview", icon: <GridIcon />, badge: activeSlots }] : []),
    { view: { name: "sources" }, label: "Fuentes", icon: <PuzzleIcon /> },
  ];
  const tabOf = (v: View) => (["catalog", "detail", "channels"].includes(v.name) ? "home" : v.name);

  let page: React.ReactNode = null;
  if (view.name === "home")
    page = (
      <Home sources={sources} manifests={addons} rows={rows} channels={m3u} favorites={favSet} favKey={favKey}
        onOpen={(item) => navigate({ name: "detail", item })}
        onSeeAll={(key) => navigate({ name: "catalog", key })}
        onSeeChannels={(sourceId) => navigate({ name: "channels", sourceId })}
        onPlayChannel={(c) => addToMultiview({ ...c, id: uid() })}
        onPlayUrl={playDirect}
        onToggleFav={toggleFav}
        onAddSource={() => goTab({ name: "sources" })} />
    );
  else if (view.name === "catalog") {
    const cat = catalogs.find((c) => c.key === view.key);
    page = cat ? (
      <CatalogView key={cat.key} catalog={cat} initial={rows[cat.key]?.data ?? []}
        onOpen={(item) => navigate({ name: "detail", item })} onBack={back} />
    ) : null;
  } else if (view.name === "detail")
    page = <Detail item={view.item} targetLabel={targetLabel()} onPlay={playStream} onBack={back} />;
  else if (view.name === "channels")
    page = (
      <Channels sources={sources} channels={allChannels} initialSource={view.sourceId} favorites={favSet}
        favKey={favKey} onPlay={(c) => addToMultiview({ ...c, id: uid() })} onToggleFav={toggleFav} />
    );
  else if (view.name === "sources")
    page = (
      <Sources sources={sources} status={sourceStatus} onAdd={addSource} onAddXtream={addXtream} onRemove={removeSource}
        onReload={loadSource} onPlayDirect={playDirect} />
    );

  return (
    <div className={`app ${inWatch && immersive ? "immersive" : ""} ${mini ? "mini" : ""}`}>
      <nav className="rail">
        {NAV.map((n) => (
          <button key={n.label} className={tabOf(view) === n.view.name ? "active" : ""} onClick={() => goTab(n.view)}>
            {n.icon}
            <span>{n.label}</span>
            {!!n.badge && <em className="rail-badge">{n.badge}</em>}
          </button>
        ))}
      </nav>

      <div className="content">
        {(watchMounted || inWatch) && (
          <Multiview active={inWatch} immersive={immersive} mini={mini} layout={layout} setLayout={setLayout}
            slots={slots} setSlotAudio={setSlotAudio} closeSlot={closeSlot} swapSlots={swapSlots}
            focused={focused} setFocused={focusSlot} masterMuted={masterMuted} setMasterMuted={setMasterMuted}
            masterVolume={masterVolume} setMasterVolume={setMasterVolume} onPick={pickFor}
            tvSlotId={tvSlotId} tvMulti={tvMulti} onTvSlot={sendToTv} onTvBack={tvClose}
            onTvMultiview={() => (tvMulti ? tvMultiview(null) : sendToTv(null))} setSlotGame={setSlotGame}
            unmatched={unmatched} />
        )}

        {!inWatch && (
          <div className="pages">
            {pick && (
              <div className="pick-banner">
                {pick.slot === null ? (
                  <>Elige un stream para <strong>agregar al multiview</strong></>
                ) : (
                  <>Elige un stream para el <strong>slot {pick.slot + 1}</strong></>
                )}
                <button onClick={() => { setPick(null); goTab({ name: "watch" }); }}>Cancelar</button>
              </div>
            )}
            {page}
          </div>
        )}
      </div>

      {tvAsk && (
        <TvPicker what={tvAsk.slot === null ? "el multiview" : `“${slots[tvAsk.slot]?.name ?? "stream"}”`}
          onPick={(t) => sendToDisplay(tvAsk.slot, t)} onCancel={() => setTvAsk(null)} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
