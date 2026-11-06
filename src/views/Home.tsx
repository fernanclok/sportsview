import { useEffect, useMemo, useState } from "react";
import { useGameFilter } from "../lib/schedule";
import type { AddonCatalog, Channel, LoadState, MetaItem, Source } from "../types";
import { fetchCatalog } from "../lib/addon";
import type { Manifest } from "../lib/addon";
import { Row } from "../components/Row";
import { ChannelCard, MetaCard, SkeletonCards } from "../components/Cards";
import { PlayIcon, SearchIcon } from "../components/Icons";
import { isYouTubeUrl } from "../lib/youtube";

const ROW_LIMIT = 20;

interface Props {
  sources: Source[];
  manifests: Record<string, LoadState<{ manifest: Manifest; catalogs: AddonCatalog[] }>>;
  rows: Record<string, LoadState<MetaItem[]>>;
  channels: Record<string, LoadState<Channel[]>>;
  favorites: Set<string>;
  favKey: (c: Channel) => string;
  onOpen: (item: MetaItem) => void;
  onSeeAll: (key: string) => void;
  onSeeChannels: (sourceId: string) => void;
  onPlayChannel: (c: Channel) => void;
  onPlayUrl: (url: string) => void;
  onToggleFav: (c: Channel) => void;
  onAddSource: () => void;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Home(p: Props) {
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<LoadState<MetaItem[]>>({ status: "ok", data: [] });
  const youtube = isYouTubeUrl(q.trim());
  const query = youtube ? "" : q.trim().toLowerCase();

  const catalogs = useMemo(
    () => p.sources.flatMap((s) => p.manifests[s.id]?.data?.catalogs ?? []),
    [p.sources, p.manifests],
  );
  const allChannels = useMemo(
    () => p.sources.flatMap((s) => p.channels[s.id]?.data ?? []),
    [p.sources, p.channels],
  );

  // Addon-side search on catalogs that support it (debounced).
  useEffect(() => {
    const searchable = catalogs.filter((c) => c.search);
    if (!query || !searchable.length) return setRemote({ status: "ok", data: [] });
    setRemote({ status: "loading", data: [] });
    const t = window.setTimeout(async () => {
      const res = await Promise.allSettled(searchable.map((c) => fetchCatalog(c, { search: q.trim() })));
      setRemote({ status: "ok", data: res.flatMap((r) => (r.status === "fulfilled" ? r.value : [])) });
    }, 400);
    return () => clearTimeout(t);
  }, [query, catalogs]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    if (!query) return null;
    const seen = new Set<string>();
    const items: MetaItem[] = [];
    const local = catalogs.flatMap((c) => p.rows[c.key]?.data ?? []);
    for (const it of [...local, ...(remote.data ?? [])]) {
      const k = `${it.base}|${it.type}|${it.id}`;
      if (seen.has(k) || !it.name.toLowerCase().includes(query)) continue;
      seen.add(k);
      items.push(it);
    }
    const chans = allChannels.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 60);
    return { items, chans };
  }, [query, catalogs, p.rows, remote, allChannels]);

  const favChannels = allChannels.filter((c) => p.favorites.has(p.favKey(c)));
  // Sports catalogs: only today's games, and they drop off as they finish.
  const rowItems = useMemo(() => catalogs.flatMap((c) => p.rows[c.key]?.data ?? []), [catalogs, p.rows]);
  const showGame = useGameFilter(rowItems);

  return (
    <div className="page">
      <div className="page-header">
        <label className="search">
          <SearchIcon />
          <input placeholder="Buscar partidos, equipos, canales… o pega un link de YouTube" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && youtube) { p.onPlayUrl(q.trim()); setQ(""); } }} />
        </label>
      </div>

      <div className="page-body">
        {!p.sources.length && (
          <div className="empty-state">
            <h2>Bienvenido a SportsView</h2>
            <p>Agrega un addon de Stremio o una playlist M3U para empezar.</p>
            <button className="primary" onClick={p.onAddSource}>Agregar fuente</button>
          </div>
        )}

        {youtube && (
          <div className="yt-paste">
            <span>Link de YouTube detectado</span>
            <button className="primary" onClick={() => { p.onPlayUrl(q.trim()); setQ(""); }}>
              <PlayIcon /> Ver en multiview
            </button>
          </div>
        )}

        {results ? (
          <>
            <h2 className="section-title">
              Resultados {remote.status === "loading" && <span className="spinner small" />}
            </h2>
            <div className="card-grid">
              {results.items.map((it) => (
                <MetaCard key={`${it.base}|${it.id}`} item={it} onOpen={p.onOpen} />
              ))}
              {results.chans.map((c) => (
                <ChannelCard key={c.id} channel={c} fav={p.favorites.has(p.favKey(c))}
                  onPlay={p.onPlayChannel} onToggleFav={p.onToggleFav} />
              ))}
            </div>
            {!results.items.length && !results.chans.length && remote.status !== "loading" && (
              <p className="muted">Sin resultados para “{q}”.</p>
            )}
          </>
        ) : (
          <>
            {favChannels.length > 0 && (
              <Row title="Canales favoritos">
                {favChannels.map((c) => (
                  <ChannelCard key={c.id} channel={c} fav onPlay={p.onPlayChannel} onToggleFav={p.onToggleFav} />
                ))}
              </Row>
            )}

            {p.sources.map((s) => {
              if (s.kind !== "addon") {
                const st = p.channels[s.id];
                if (st?.status === "error") return <Row key={s.id} title={s.name} error={st.error} />;
                return (
                  <Row key={s.id} title={`${s.name} - Canales`} onSeeAll={() => p.onSeeChannels(s.id)}>
                    {st?.status === "loading" && !st.data?.length ? (
                      <SkeletonCards shape="channel" />
                    ) : (
                      (st?.data ?? []).slice(0, ROW_LIMIT).map((c) => (
                        <ChannelCard key={c.id} channel={c} fav={p.favorites.has(p.favKey(c))}
                          onPlay={p.onPlayChannel} onToggleFav={p.onToggleFav} />
                      ))
                    )}
                  </Row>
                );
              }

              const m = p.manifests[s.id];
              if (!m || m.status === "loading")
                return (
                  <Row key={s.id} title={s.name}>
                    <SkeletonCards />
                  </Row>
                );
              if (m.status === "error") return <Row key={s.id} title={s.name} error={m.error} />;

              return m.data!.catalogs
                .filter((c) => c.browsable)
                .map((c) => {
                  const r = p.rows[c.key];
                  const title = `${c.name} - ${capitalize(c.type)}`;
                  if (r?.status === "error") return <Row key={c.key} title={title} error={r.error} />;
                  const shown = r?.data?.filter(showGame);
                  if (r?.status === "ok" && !shown?.length) return null;
                  return (
                    <Row key={c.key} title={title} onSeeAll={() => p.onSeeAll(c.key)}>
                      {!r?.data ? (
                        <SkeletonCards />
                      ) : (
                        shown!.slice(0, ROW_LIMIT).map((it) => <MetaCard key={it.id} item={it} onOpen={p.onOpen} />)
                      )}
                    </Row>
                  );
                });
            })}
          </>
        )}
      </div>
    </div>
  );
}
