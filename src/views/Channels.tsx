import { useMemo, useState } from "react";
import type { Channel, Source } from "../types";
import { ChannelCard } from "../components/Cards";
import { SearchIcon, StarIcon } from "../components/Icons";

const LIMIT = 300;

interface Props {
  sources: Source[];
  channels: Channel[];
  initialSource?: string;
  favorites: Set<string>;
  favKey: (c: Channel) => string;
  onPlay: (c: Channel) => void;
  onToggleFav: (c: Channel) => void;
}

export function Channels({ sources, channels, initialSource = "", favorites, favKey, onPlay, onToggleFav }: Props) {
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState(initialSource);
  const [group, setGroup] = useState("");
  const [onlyFavs, setOnlyFavs] = useState(false);
  const m3uSources = sources.filter((s) => s.kind !== "addon");

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const c of channels) if ((!sourceId || c.sourceId === sourceId) && c.group) set.add(c.group);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [channels, sourceId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter(
      (c) =>
        (!sourceId || c.sourceId === sourceId) &&
        (!group || c.group === group) &&
        (!onlyFavs || favorites.has(favKey(c))) &&
        (!q || c.name.toLowerCase().includes(q) || c.group?.toLowerCase().includes(q)),
    );
  }, [channels, sourceId, group, onlyFavs, favorites, favKey, query]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Canales</h1>
        <label className="search">
          <SearchIcon />
          <input placeholder="Buscar canal o grupo…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select value={sourceId} onChange={(e) => { setSourceId(e.target.value); setGroup(""); }}>
          <option value="">Todas las playlists</option>
          {m3uSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">Todos los grupos</option>
          {groups.map((g) => <option key={g}>{g}</option>)}
        </select>
        <button className={onlyFavs ? "active" : ""} onClick={() => setOnlyFavs((f) => !f)}><StarIcon on={onlyFavs} /> Favoritos</button>
      </div>
      <div className="page-body">
        {!m3uSources.length && <p className="muted">No tienes playlists M3U ni cuentas Xtream. Agrégalas en Fuentes.</p>}
        <div className="card-grid channels-grid">
          {filtered.slice(0, LIMIT).map((c) => (
            <ChannelCard key={c.id} channel={c} fav={favorites.has(favKey(c))} onPlay={onPlay} onToggleFav={onToggleFav} />
          ))}
        </div>
        {filtered.length > LIMIT && <p className="muted center">+{filtered.length - LIMIT} más — afina la búsqueda</p>}
        {!filtered.length && channels.length > 0 && <p className="muted">Sin resultados.</p>}
      </div>
    </div>
  );
}
