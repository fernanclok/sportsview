import { useEffect, useMemo, useRef, useState } from "react";
import type { AddonCatalog, MetaItem } from "../types";
import { fetchCatalog } from "../lib/addon";
import { allAfterToday, useGameFilter } from "../lib/schedule";
import { MetaCard } from "../components/Cards";
import { BackIcon } from "../components/Icons";

interface Props {
  catalog: AddonCatalog;
  initial: MetaItem[];
  onOpen: (item: MetaItem) => void;
  onBack: () => void;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const CHANNELS = "Canales 24/7";
const OTHER = "Otros";
// Sports addons tag games with [sport, league] ("Football", "UEFA Europa League") and 24/7 channels
// with a feed code ("VIP-SKY-SPORTS-PREMIER-LEAGUE").
const isFeedCode = (g: string) => /^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(g);

/** Splits a catalog by league, using the genres that not every item shares (the sport itself is shared). */
function groupByLeague(items: MetaItem[]): [string, MetaItem[]][] {
  const shared = items.length > 1 ? new Set(items[0].genres ?? []) : new Set<string>();
  for (const it of items) for (const g of shared) if (!it.genres?.includes(g)) shared.delete(g);
  const groups = new Map<string, MetaItem[]>();
  for (const it of items) {
    const rest = (it.genres ?? []).filter((g) => !shared.has(g));
    const key = rest.some(isFeedCode) ? CHANNELS : (rest[0] ?? OTHER);
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  const rank = (k: string) => (k === CHANNELS ? 2 : k === OTHER ? 1 : 0);
  return [...groups].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length);
}

export function CatalogView({ catalog, initial, onOpen, onBack }: Props) {
  const [items, setItems] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(!catalog.skip);
  const [league, setLeague] = useState("");
  const showGame = useGameFilter(items);
  const today = useMemo(() => items.filter(showGame), [items, showGame]);
  const groups = useMemo(() => groupByLeague(today), [today]);
  const split = groups.length > 1;
  // A league filter whose games all ended falls back to "Todas".
  const active = groups.some(([k]) => k === league) ? league : "";
  const shown = split ? (active ? groups.filter(([k]) => k === active) : groups) : [["", today] as [string, MetaItem[]]];

  async function loadMore() {
    setLoading(true);
    try {
      const more = await fetchCatalog(catalog, { skip: String(items.length) });
      const known = new Set(items.map((i) => i.id));
      const fresh = more.filter((m) => !known.has(m.id));
      setItems((prev) => [...prev, ...fresh]);
      // Sorted by date: once a page is all future days, the rest won't be shown anyway.
      if (!fresh.length || allAfterToday(fresh)) setDone(true);
    } catch {
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  // Infinite scroll: fetch the next page when the bottom sentinel comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  const more = useRef(loadMore);
  more.current = loadMore;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || loading) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && more.current(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [done, loading, items.length]);

  return (
    <div className="page">
      <div className="page-header">
        <button className="back" onClick={onBack}><BackIcon /></button>
        <h1>{catalog.name} - {capitalize(catalog.type)}</h1>
      </div>
      {split && (
        <div className="league-chips">
          <button className={active ? "" : "on"} onClick={() => setLeague("")}>Todas <small>{today.length}</small></button>
          {groups.map(([k, list]) => (
            <button key={k} className={active === k ? "on" : ""} onClick={() => setLeague(k)}>{k} <small>{list.length}</small></button>
          ))}
        </div>
      )}
      <div className="page-body">
        {shown.map(([k, list]) => (
          <section key={k || "all"} className="league-group">
            {k && !active && <h2 className="league-title">{k} <small>{list.length}</small></h2>}
            <div className="card-grid">
              {list.map((it) => <MetaCard key={it.id} item={it} onOpen={onOpen} />)}
            </div>
          </section>
        ))}
        {done && !today.length && <p className="muted">No quedan juegos hoy en esta categoría.</p>}
        {!done && (
          <div className="center" ref={sentinel}>
            {loading && <div className="spinner small" />}
          </div>
        )}
      </div>
    </div>
  );
}
