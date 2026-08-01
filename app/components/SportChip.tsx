// A small tinted chip + glyph for a market's category. Colour aids scanning a
// mixed board (football, tennis, golf, …); unknown categories fall back to the
// brand indigo + a generic trophy. Icons are simple inline strokes.

type IconProps = { className?: string };

const Football = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.2l3.6 2.7-1.4 4.4H9.8L8.4 9.9z" />
  </svg>
);
const Tennis = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5 5.5c4 3 4 10 0 13M19 5.5c-4 3-4 10 0 13" />
  </svg>
);
const Golf = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M8 21V3l8 2.8L8 8.6" />
    <path d="M8 21h9" />
  </svg>
);
const Basketball = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3v18M5.5 5.5c3 3.2 3 9.8 0 13M18.5 5.5c-3 3.2-3 9.8 0 13" />
  </svg>
);
const Cricket = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M13.5 4l6.5 6.5-8 8L5.5 12z" />
    <circle cx="6" cy="18" r="2.2" />
  </svg>
);
const Trophy = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M8 4h8v4a4 4 0 01-8 0z" />
    <path d="M6 5H4v1.5a3 3 0 003 3M18 5h2v1.5a3 3 0 01-3 3M9.5 20h5M12 14v3" />
  </svg>
);

type Cfg = { Icon: (p: IconProps) => React.JSX.Element; chip: string; icon: string };

const CONFIG: Record<string, Cfg> = {
  football:   { Icon: Football,   chip: "bg-emerald-500/15 border-emerald-500/20", icon: "text-emerald-300" },
  tennis:     { Icon: Tennis,     chip: "bg-lime-500/15 border-lime-500/20",       icon: "text-lime-300" },
  golf:       { Icon: Golf,       chip: "bg-sky-500/15 border-sky-500/20",         icon: "text-sky-300" },
  basketball: { Icon: Basketball, chip: "bg-orange-500/15 border-orange-500/20",   icon: "text-orange-300" },
  cricket:    { Icon: Cricket,    chip: "bg-pink-500/15 border-pink-500/20",       icon: "text-pink-300" },
};
const FALLBACK: Cfg = { Icon: Trophy, chip: "bg-inj/15 border-inj/25", icon: "text-inj-soft" };

export default function SportChip({ category, size = 28 }: { category: string; size?: number }) {
  const cfg = CONFIG[category.trim().toLowerCase()] ?? FALLBACK;
  const { Icon } = cfg;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg border ${cfg.chip}`}
      style={{ width: size, height: size }}
    >
      <Icon className={`${cfg.icon} w-[60%] h-[60%]`} />
    </span>
  );
}
