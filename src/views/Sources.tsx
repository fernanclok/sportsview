import { useState } from "react";
import type { Source } from "../types";

interface Props {
  sources: Source[];
  status: (s: Source) => { label: string; error: boolean };
  onAdd: (url: string) => Promise<boolean>;
  onAddXtream: (server: string, username: string, password: string) => Promise<boolean>;
  onRemove: (id: string) => void;
  onReload: (s: Source) => void;
  onPlayDirect: (url: string) => void;
}

export function Sources({ sources, status, onAdd, onAddXtream, onRemove, onReload, onPlayDirect }: Props) {
  const [url, setUrl] = useState("");
  const [direct, setDirect] = useState("");
  const [busy, setBusy] = useState(false);
  const [xt, setXt] = useState({ server: "", username: "", password: "" });
  const xtReady = xt.server.trim() && xt.username.trim() && xt.password;

  async function addXtream() {
    if (!xtReady) return;
    setBusy(true);
    if (await onAddXtream(xt.server, xt.username.trim(), xt.password)) setXt({ server: "", username: "", password: "" });
    setBusy(false);
  }

  async function add() {
    setBusy(true);
    if (await onAdd(url)) setUrl("");
    setBusy(false);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Fuentes</h1>
      </div>
      <div className="page-body narrow">
        <section className="panel">
          <h2>Agregar fuente</h2>
          <p className="muted">URL del <code>manifest.json</code> de un addon de Stremio (o <code>stremio://…</code>) o de una playlist M3U.</p>
          <div className="form-row">
            <input placeholder="https://…/manifest.json  ·  https://…/lista.m3u" value={url}
              onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <button className="primary" onClick={add} disabled={busy || !url.trim()}>{busy ? "…" : "Agregar"}</button>
          </div>
        </section>

        <section className="panel">
          <h2>Cuenta IPTV (Xtream Codes)</h2>
          <p className="muted">Servidor, usuario y contraseña de tu proveedor. La contraseña se guarda cifrada en el Llavero de macOS.</p>
          <div className="form-row xtream-form" onKeyDown={(e) => e.key === "Enter" && addXtream()}>
            <input placeholder="http://servidor.com" value={xt.server} onChange={(e) => setXt({ ...xt, server: e.target.value })} />
            <input placeholder="Usuario" autoComplete="off" value={xt.username} onChange={(e) => setXt({ ...xt, username: e.target.value })} />
            <input placeholder="Contraseña" type="password" autoComplete="off" value={xt.password}
              onChange={(e) => setXt({ ...xt, password: e.target.value })} />
            <button className="primary" onClick={addXtream} disabled={busy || !xtReady}>{busy ? "…" : "Conectar"}</button>
          </div>
        </section>

        <section className="panel">
          <h2>Instaladas</h2>
          {!sources.length && <p className="muted">Todavía no hay fuentes.</p>}
          <ul className="source-list">
            {sources.map((s) => {
              const st = status(s);
              return (
                <li key={s.id}>
                  <span className={`badge ${s.kind}`}>{s.kind}</span>
                  <div className="source-text">
                    <strong>{s.name}</strong>
                    <small className="muted">{s.kind === "xtream" ? `${s.url} · ${s.username}` : s.url}</small>
                  </div>
                  <small className={st.error ? "err" : "muted"}>{st.label}</small>
                  <button onClick={() => onReload(s)}>Recargar</button>
                  <button className="danger" onClick={() => onRemove(s.id)}>Quitar</button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel">
          <h2>Reproducir URL directa</h2>
          <div className="form-row">
            <input placeholder="https://…/stream.m3u8  ·  http://…/123.ts  ·  link de YouTube" value={direct}
              onChange={(e) => setDirect(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && direct.trim() && (onPlayDirect(direct.trim()), setDirect(""))} />
            <button onClick={() => { onPlayDirect(direct.trim()); setDirect(""); }} disabled={!direct.trim()}>Ver</button>
          </div>
        </section>
      </div>
    </div>
  );
}
