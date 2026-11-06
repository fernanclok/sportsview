interface Series {
  pts: { t: number; v: number }[];
  cls: string;
  step?: boolean;
}

interface Props {
  series: Series[];
  t0: number;
  t1: number;
  marks?: { t: number; label: string }[];
  end?: string;
  bubble?: number;
}

const W = 300;
const H = 100;

/** Probability chart (0-100%) over wall-clock time. Lines in SVG, labels in HTML so they don't stretch. */
export function Chart({ series, t0, t1, marks = [], end, bubble }: Props) {
  const span = Math.max(1, t1 - t0);
  const x = (t: number) => ((Math.min(Math.max(t, t0), t1) - t0) / span) * W;
  const y = (v: number) => H - v * H;
  const path = (s: Series) =>
    s.pts
      .map((p, i) => {
        const X = x(p.t).toFixed(1);
        const Y = y(p.v).toFixed(1);
        if (i === 0) return `M${X},${Y}`;
        return s.step ? `H${X}V${Y}` : `L${X},${Y}`;
      })
      .join("");
  const main = series.find((s) => s.pts.length);
  const last = main?.pts[main.pts.length - 1];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="chart-mid" />
        {marks.map((m) => (
          <line key={m.label} x1={x(m.t)} x2={x(m.t)} y1="0" y2={H} className="chart-mark" />
        ))}
        {series.map((s) => s.pts.length > 1 && <path key={s.cls} d={path(s)} className={`chart-line ${s.cls}`} />)}
      </svg>
      {last && (
        <>
          <span className="chart-dot" style={{ left: `${(x(last.t) / W) * 100}%`, top: `${(y(last.v) / H) * 100}%` }} />
          <span className="chart-bubble" style={{ left: `${(x(last.t) / W) * 100}%`, top: `${(y(last.v) / H) * 100}%` }}>
            {Math.round((bubble ?? last.v) * 100)}%
          </span>
        </>
      )}
      <div className="chart-axis">
        {marks.map((m) => (
          <span key={m.label} style={{ left: `${(x(m.t) / W) * 100}%` }}>{m.label}</span>
        ))}
        {end && <span className="end">{end}</span>}
      </div>
    </div>
  );
}
