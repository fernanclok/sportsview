import { useState } from "react";
import type { Channel, MetaItem } from "../types";
import { StarIcon } from "./Icons";

export function MetaCard({ item, onOpen }: { item: MetaItem; onOpen: (item: MetaItem) => void }) {
  const [broken, setBroken] = useState(false);
  const shape = item.posterShape ?? "poster";
  return (
    <button className={`card ${shape}`} onClick={() => onOpen(item)} title={item.name}>
      <div className="card-img">
        {item.poster && !broken ? (
          <img src={item.poster} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <div className="card-ph">{item.name}</div>
        )}
      </div>
      <div className="card-title">{item.name}</div>
    </button>
  );
}

interface ChannelCardProps {
  channel: Channel;
  fav: boolean;
  onPlay: (c: Channel) => void;
  onToggleFav: (c: Channel) => void;
}

export function ChannelCard({ channel, fav, onPlay, onToggleFav }: ChannelCardProps) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="card channel" onClick={() => onPlay(channel)} title={channel.name} role="button">
      <div className="card-img">
        {channel.logo && !broken ? (
          <img src={channel.logo} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <div className="card-ph">{channel.name}</div>
        )}
        <button
          className={`fav-btn ${fav ? "on" : ""}`}
          title={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav(channel);
          }}
        >
          <StarIcon on={fav} />
        </button>
      </div>
      <div className="card-title">{channel.name}</div>
      {channel.group && <div className="card-sub">{channel.group}</div>}
    </div>
  );
}

export function SkeletonCards({ shape = "landscape", n = 6 }: { shape?: string; n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`card ${shape} skeleton`}>
          <div className="card-img" />
          <div className="card-title">&nbsp;</div>
        </div>
      ))}
    </>
  );
}
