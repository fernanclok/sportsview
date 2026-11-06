import { useRef, type ReactNode } from "react";
import { ChevronIcon } from "./Icons";

interface Props {
  title: string;
  onSeeAll?: () => void;
  error?: string;
  children?: ReactNode;
}

export function Row({ title, onSeeAll, error, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <section className="row-section">
      <header>
        <h2>{title}</h2>
        {onSeeAll && (
          <button className="see-all" onClick={onSeeAll}>
            Ver todo <ChevronIcon />
          </button>
        )}
      </header>
      {error ? (
        <p className="row-error">{error}</p>
      ) : (
        <div className="row-wrap">
          <button className="row-arrow left" onClick={() => scroll(-1)} aria-label="Anterior">‹</button>
          <div className="row-scroll" ref={ref}>
            {children}
          </div>
          <button className="row-arrow right" onClick={() => scroll(1)} aria-label="Siguiente">›</button>
        </div>
      )}
    </section>
  );
}
