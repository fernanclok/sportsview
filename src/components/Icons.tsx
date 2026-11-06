// Thin line icons (24x24, 1.5 stroke, mitred) — same drawing language as fernando-portfolio.
const I = ({ d, size = 20, fill }: { d: string; size?: number; fill?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor"
    strokeWidth={1.5} strokeLinejoin="miter" aria-hidden="true" focusable="false">
    <path d={d} />
  </svg>
);

// navigation
export const HomeIcon = () => <I d="M3.5 10 12 3.5 20.5 10v10.5h-6v-6h-5v6h-6z" />;
export const GridIcon = () => <I d="M3.5 4.5h7.5v7H3.5zM13 4.5h7.5v7H13zM3.5 13.5h7.5v6H3.5zM13 13.5h7.5v6H13z" />;
export const TvIcon = ({ size = 20 }: { size?: number }) => <I d="M3 6.5h18v12H3zM8 21.5h8M8.5 2.5 12 6l3.5-3.5" size={size} />;
export const PuzzleIcon = () => <I d="M4 4h16v16H4zM4 10h16M10 4v16" />; // "fuentes": a source matrix
export const BackIcon = () => <I d="M15 18 9 12l6-6" />;
export const ChevronIcon = () => <I d="m9 18 6-6-6-6" size={16} />;
export const ChevronUpIcon = () => <I d="m6 15 6-6 6 6" size={14} />;
export const SearchIcon = () => <I d="M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM15.5 15.5l5 5" size={16} />;
export const PlusIcon = () => <I d="M12 4.5v15M4.5 12h15" size={16} />;

// player / slot
export const FullscreenIcon = () => <I d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" size={16} />;
export const ExpandIcon = () => <I d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" size={16} />;
export const CollapseIcon = () => <I d="M19.5 10h-6V4M4.5 14h6v6M13.5 10 20 3.5M10.5 14 4 20.5" size={16} />;
export const PlayIcon = ({ size = 16 }: { size?: number }) => <I d="M7 4.5v15l12-7.5z" size={size} fill />;
export const PauseIcon = () => <I d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" size={16} fill />;
export const ExternalIcon = () => <I d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" size={14} />;
export const ArrowUpRightIcon = () => <I d="M7 17 17 7M8.5 7H17v8.5" size={12} />;
export const PipIcon = () => <I d="M3 5h18v14H3zM12 12h7v5h-7z" size={16} />;
export const MiniIcon = () => <I d="M3 5h12M3 5v14h18v-6M14 13h7v6h-7zM17 3l4 4M21 3v4h-4" size={16} />;
export const SwapIcon = () => <I d="M4 8h15l-4-4M20 16H5l4 4" size={16} />;
export const ReloadIcon = () => <I d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 3.5v4h-4" size={16} />;
export const CloseIcon = () => <I d="M5.5 5.5l13 13M18.5 5.5l-13 13" size={14} />;
// a scoreboard: two scores under a header strip — "link a game"
export const ScoreboardIcon = () => <I d="M3 7.5h18v11H3zM12 10.5v5M7 3.5v4M17 3.5v4M6 12.5h3M15 12.5h3" size={16} />;
// crosshair — "follow this player"
export const TargetIcon = ({ size = 14 }: { size?: number }) => (
  <I d="M12 19.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" size={size} />
);
export const StarIcon = ({ on, size = 14 }: { on?: boolean; size?: number }) => (
  <I d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.8l-5.3 2.8 1.1-5.8-4.3-4.1 5.9-.8z" size={size} fill={on} />
);

export function VolumeIcon({ muted, level }: { muted: boolean; level: number }) {
  const body = "M4 9.5h3.5L12 5.5v13l-4.5-4H4z";
  const waves = muted || level === 0 ? "M15.5 9.5l5 5M20.5 9.5l-5 5" : level < 0.5 ? "M15.5 9.5a3.5 3.5 0 0 1 0 5" : "M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10";
  return <I d={`${body}${waves}`} size={16} />;
}
