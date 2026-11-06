import { useCallback, useEffect, useState } from "react";
import type { LoadState, MetaItem, StreamOption } from "../types";
import { fetchMeta, fetchStreams } from "../lib/addon";
import { BackIcon, ExternalIcon, PlayIcon, ReloadIcon } from "../components/Icons";

interface Props {
  item: MetaItem;
  targetLabel: string;
  onPlay: (stream: StreamOption, meta: MetaItem) => void;
  onBack: () => void;
}

export function Detail({ item, targetLabel, onPlay, onBack }: Props) {
  const [meta, setMeta] = useState(item);
  const [streams, setStreams] = useState<LoadState<StreamOption[]>>({ status: "loading" });

  const loadStreams = useCallback(() => {
    setStreams({ status: "loading" });
    let off = false;
    fetchStreams(item)
      .then((data) => !off && setStreams({ status: "ok", data }))
      .catch((e: Error) => !off && setStreams({ status: "error", error: e.message }));
    return () => {
      off = true;
    };
  }, [item]);

  useEffect(() => {
    let off = false;
    setMeta(item);
    fetchMeta(item).then((m) => !off && setMeta(m));
    const cancelStreams = loadStreams();
    return () => {
      off = true;
      cancelStreams();
    };
  }, [item, loadStreams]);

  const bg = meta.background || meta.poster;

  function pick(s: StreamOption) {
    if (s.url) onPlay(s, meta);
    else if (s.externalUrl) window.open(s.externalUrl, "_blank");
  }

  return (
    <div className="detail">
      {bg && <div className="detail-bg" style={{ backgroundImage: `url("${bg}")` }} />}
      <div className="detail-shade" />

      <div className="page-header detail-header">
        <button className="back" onClick={onBack}><BackIcon /></button>
      </div>

      <div className="detail-content">
        <div className="detail-info">
          {meta.logo && <img className="detail-logo" src={meta.logo} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />}
          <h1>{meta.name}</h1>
          {meta.releaseInfo && <div className="release">{meta.releaseInfo}</div>}
          {!!meta.genres?.length && (
            <>
              <h3>Géneros</h3>
              <div className="chips">
                {meta.genres.map((g) => <span key={g} className="chip">{g}</span>)}
              </div>
            </>
          )}
          {meta.description && (
            <>
              <h3>Resumen</h3>
              <p className="summary">{meta.description}</p>
            </>
          )}
        </div>

        <aside className="streams">
          <div className="streams-head">
            <span>Streams</span>
            <small>{targetLabel}</small>
            <button className="icon" title="Recargar streams" onClick={loadStreams}><ReloadIcon /></button>
          </div>
          {streams.status === "loading" && <div className="center"><div className="spinner" /></div>}
          {streams.status === "error" && <p className="row-error">No se pudieron cargar los streams: {streams.error}</p>}
          {streams.status === "ok" && !streams.data?.length && <p className="muted pad">No hay streams disponibles ahora.</p>}
          <ul>
            {streams.data?.map((s, i) => {
              const kind = s.url ? "play" : s.externalUrl ? "external" : "disabled";
              return (
                <li key={i}>
                  <button className={`stream ${kind}`} onClick={() => pick(s)} disabled={kind === "disabled"}
                    title={s.note ?? (kind === "external" ? "Se abre en el navegador" : "Ver en multiview")}>
                    <span className="stream-name">{s.name}</span>
                    <span className="stream-title">{s.note ?? s.title}</span>
                    <span className="stream-icon">
                      {kind === "play" ? <PlayIcon /> : kind === "external" ? <ExternalIcon /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
