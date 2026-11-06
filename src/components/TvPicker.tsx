import { useEffect, useState } from "react";
import type { TvTarget } from "../lib/fullscreen";
import { onDisplaysChanged, tvTargets } from "../lib/tv";
import { TvIcon } from "./Icons";

interface Props {
  what: string;
  onPick: (t: TvTarget) => void;
  onCancel: () => void;
}

const isMac = () => document.documentElement.dataset.platform === "mac";

/**
 * Asks which display is the TV. With no second display it explains how to connect one
 * and continues on its own as soon as macOS reports it.
 */
export function TvPicker({ what, onPick, onCancel }: Props) {
  const [targets, setTargets] = useState<TvTarget[] | null>(null);

  useEffect(() => {
    const refresh = () => tvTargets().then(setTargets);
    refresh();
    return onDisplaysChanged(refresh);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2><TvIcon /> Mandar {what} a la tele</h2>
        {targets == null ? (
          <div className="spinner" />
        ) : targets.length ? (
          <>
            <p className="muted">Elige la pantalla de la tele:</p>
            <div className="tv-targets">
              {targets.map((t) => (
                <button key={t.id} className="primary" onClick={() => onPick(t)}>{t.label}</button>
              ))}
            </div>
          </>
        ) : isMac() ? (
          <>
            <p>Conecta la tele como <strong>pantalla extendida</strong>:</p>
            <ol>
              <li>Abre el <strong>Centro de control</strong> → <strong>Duplicar pantalla</strong> y elige tu Apple TV o tele.</li>
              <li>Si la tele muestra lo mismo que la Mac: <strong>Ajustes del Sistema → Pantallas</strong>, elige la tele y en
                “Usar como” pon <strong>Pantalla extendida</strong>.</li>
            </ol>
            <p className="muted waiting"><span className="spinner small" /> Esperando la tele… sigue sola cuando se conecte.</p>
            <button onClick={() => window.open("x-apple.systempreferences:com.apple.Displays-Settings.extension")}>
              Abrir ajustes de Pantallas
            </button>
          </>
        ) : (
          <>
            <p>Conecta la tele por HDMI (o <strong>Win + K</strong> si es inalámbrica) y elige <strong>Extender</strong> con <strong>Win + P</strong>.</p>
            <p className="muted waiting"><span className="spinner small" /> Esperando la tele…</p>
          </>
        )}
        <div className="modal-actions">
          <button onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
