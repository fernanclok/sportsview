import type { GameData } from "../../lib/espn";

export function ScorePill({ game, big }: { game: GameData; big?: boolean }) {
  const { away, home } = game;
  const live = game.state === "in";
  const score = game.state === "pre" ? "vs" : `${away.score ?? 0} – ${home.score ?? 0}`;
  return (
    <div className={`score-pill ${big ? "big" : "mini"}`}>
      <div className="sp-main">
        {big && away.record && <span className="sp-rec">({away.record})</span>}
        {big && <span className="sp-name">{away.name}</span>}
        {away.logo && <img src={away.logo} alt={away.abbr} />}
        <span className="sp-score">{score}</span>
        {home.logo && <img src={home.logo} alt={home.abbr} />}
        {big && <span className="sp-name">@{home.name}</span>}
        {big && home.record && <span className="sp-rec">({home.record})</span>}
        {!big && <span className={`sp-detail ${live ? "live" : ""}`}>{game.detail}</span>}
      </div>
      {big && (
        <div className="sp-sub">
          {game.series && <span>{game.series.toUpperCase()}</span>}
          {game.series && <span className="sep">|</span>}
          <span className={live ? "live" : ""}>{game.detail}</span>
        </div>
      )}
    </div>
  );
}
