import { useId, type ReactNode } from "react";

/**
 * Ayden badge: a drawn medal, the same in every browser and offline. The accent comes from the role, the
 * symbol from the skill, and the metal from how far the learner got:
 *   earned   – gold rim, the behaviours were shown once
 *   mastered – brighter gold with a crown star and sparkles: shown again on a fresh variant
 *   locked   – grey, with a lock
 * Nothing here is shared or ranked; it only restates what the report already proved.
 */

export type BadgeTier = "earned" | "mastered" | "locked";

const ROLE_ACCENT: Record<string, string> = {
  "software-engineer": "#2f5fd0",
  "tech-consulting": "#7b3fc4",
  nurse: "#0f8a6a",
  "banking-ops": "#c26a00",
  executive: "#129eaf",
  "data-analyst": "#5b6678",
};

type GlyphName = "search" | "shield" | "code" | "chat" | "chart" | "clock" | "target" | "heart" | "scale" | "flag" | "bolt" | "star" | "lock";

const GLYPHS: Record<GlyphName, ReactNode> = {
  search: <><circle cx="10.5" cy="10.5" r="5.8" /><path d="M15 15l5.2 5.2" /></>,
  shield: <><path d="M12 3l7.2 3v5.2c0 4.6-3 8-7.2 9.8-4.2-1.8-7.2-5.2-7.2-9.8V6z" /><path d="M8.6 12.1l2.5 2.5 4.4-4.8" /></>,
  code: <path d="M8 7.5L3.5 12 8 16.5M16 7.5l4.5 4.5-4.5 4.5M13.6 5.5l-3.2 13" />,
  chat: <><path d="M4 5h16v11.5H9.4L4 20.5z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  chart: <path d="M5 20v-8M12 20V5M19 20v-5.5" />,
  clock: <><circle cx="12" cy="12" r="8.2" /><path d="M12 7v5.2l3.4 2" /></>,
  target: <><circle cx="12" cy="12" r="8.2" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="0.9" fill="currentColor" /></>,
  heart: <path d="M12 20.3S4.8 16 4.8 10.1a4.1 4.1 0 0 1 7.2-2.7 4.1 4.1 0 0 1 7.2 2.7c0 5.9-7.2 10.2-7.2 10.2z" />,
  scale: <><path d="M12 4v16M7 20h10M5 7h14" /><path d="M5 7l-3 7a3.2 3.2 0 0 0 6 0zM19 7l-3 7a3.2 3.2 0 0 0 6 0z" /></>,
  flag: <path d="M6 21V4M6 5h11.5l-2.2 4 2.2 4H6" />,
  bolt: <path d="M13.2 3L5 13.4h6.2L10.2 21 19 10.4h-6.3z" />,
  star: <path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6 6.9 19.3l1-5.7-4.1-4 5.7-.8z" />,
  lock: <><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
};

const RULES: [RegExp, GlyphName][] = [
  [/verif|check|test|accura|safe|reconcil|ident|secur|complian|privacy|consent/i, "shield"],
  [/escalat|urgent|triage|prior|deadline|time|schedul/i, "clock"],
  [/commun|updat|sbar|hand.?off|explain|clar|ask|question|invest|report|brief|write/i, "chat"],
  [/data|number|analy|margin|metric|runway|financ|forecast|decid|risk/i, "chart"],
  [/code|debug|fix|review|engineer|implement|refactor/i, "code"],
  [/honest|transpar|ethic|trust|integrity|truth/i, "flag"],
  [/fair|lead|people|team|care|empath|patient/i, "heart"],
  [/frame|goal|focus|target|scope|recommend|plan|strategy/i, "target"],
  [/balance|trade|option|judg|weigh/i, "scale"],
];
const FALLBACK: GlyphName[] = ["target", "bolt", "flag", "star", "chart", "shield"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Chooses the symbol from the skill, so new roles and renamed skills still get a sensible badge. */
export function glyphFor(skillId: string, title = ""): GlyphName {
  const text = `${skillId.replace(/[_-]/g, " ")} ${title}`;
  for (const [re, g] of RULES) if (re.test(text)) return g;
  return FALLBACK[hash(skillId) % FALLBACK.length]!;
}

function mix(hexColor: string, other: string, t: number): string {
  const a = hexColor.replace("#", ""), b = other.replace("#", "");
  const ch = (s: string, i: number) => parseInt(s.slice(i * 2, i * 2 + 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, "0"));
  return `#${out.join("")}`;
}

/** Points of a pointy-top hexagon. */
function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

export interface BadgeArtProps {
  roleId: string;
  skillId: string;
  /** The badge title, used to choose the symbol and for the accessible name. */
  title?: string;
  size?: number;
  tier?: BadgeTier;
  /** Kept for older call sites. */
  locked?: boolean;
  /** Play the small pop and shine, for a badge that was just earned. */
  fresh?: boolean;
}

export function BadgeArt({ roleId, skillId, title, size = 72, tier, locked = false, fresh = false }: BadgeArtProps) {
  const uid = useId().replace(/:/g, "");
  const t: BadgeTier = locked ? "locked" : tier ?? "earned";
  const accent = ROLE_ACCENT[roleId] ?? "#2f5fd0";
  const g = t === "locked" ? "lock" : glyphFor(skillId, title);
  const rim = t === "mastered" ? ["#fff1b8", "#f2c14e", "#c9890f"] : t === "earned" ? ["#f4e3b0", "#d9ac4a", "#a9772a"] : ["#eceef1", "#cfd3d9", "#aab0b8"];
  const face = t === "locked" ? ["#e6e8ec", "#c9cdd4"] : [mix(accent, "#ffffff", 0.28), mix(accent, "#000000", 0.28)];
  const ribbon = t === "locked" ? "#c3c7ce" : mix(accent, "#000000", 0.18);
  const ink = t === "locked" ? "#7b8390" : "#ffffff";
  return (
    <svg className={`medal ${t}${fresh ? " fresh" : ""}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={t === "locked" ? "Locked badge" : `${t === "mastered" ? "Mastered" : "Earned"} badge${title ? `: ${title}` : ""}`} focusable="false">
      <defs>
        <linearGradient id={`${uid}r`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={rim[0]} /><stop offset=".5" stopColor={rim[1]} /><stop offset="1" stopColor={rim[2]} /></linearGradient>
        <linearGradient id={`${uid}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={face[0]} /><stop offset="1" stopColor={face[1]} /></linearGradient>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <clipPath id={`${uid}c`}><polygon points={hexPoints(50, 45, 36)} /></clipPath>
      </defs>
      {/* ribbon tails */}
      <path d="M33 70l-9 24 12-6 6 9 6-26z" fill={ribbon} />
      <path d="M67 70l9 24-12-6-6 9-6-26z" fill={mix(ribbon, "#000000", 0.12)} />
      {/* rim, face and inner ring */}
      <polygon points={hexPoints(50, 45, 42)} fill={`url(#${uid}r)`} stroke={mix(rim[2]!, "#000000", 0.2)} strokeWidth="1.2" strokeLinejoin="round" />
      <polygon points={hexPoints(50, 45, 36)} fill={`url(#${uid}f)`} stroke="#fff" strokeOpacity=".5" strokeWidth="1.2" strokeLinejoin="round" />
      <polygon points={hexPoints(50, 45, 31)} fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="1" strokeLinejoin="round" />
      {/* gloss */}
      <path d="M20 34Q50 8 80 34Q50 24 20 34z" fill="#fff" opacity={t === "locked" ? 0.35 : 0.28} clipPath={`url(#${uid}c)`} />
      {/* symbol */}
      <g transform="translate(34 29) scale(1.35)" fill="none" stroke={ink} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" color={ink}>{GLYPHS[g]}</g>
      {/* crown star and sparkles for mastered */}
      {t === "mastered" && (
        <>
          <g transform="translate(41 -1) scale(.75)" fill="#ffe27a" stroke="#b8820f" strokeWidth="1.2" strokeLinejoin="round">{GLYPHS.star}</g>
          <path className="sparkle s1" d="M10 20l1.6 3.6L15 25l-3.4 1.4L10 30l-1.6-3.6L5 25l3.4-1.4z" fill="#ffe27a" />
          <path className="sparkle s2" d="M90 58l1.3 2.9 2.7 1.1-2.7 1.1L90 66l-1.3-2.9-2.7-1.1 2.7-1.1z" fill="#ffe27a" />
        </>
      )}
      {/* shine sweep */}
      {t !== "locked" && <g clipPath={`url(#${uid}c)`}><g className="shine"><rect x="-30" y="0" width="26" height="100" fill={`url(#${uid}s)`} transform="skewX(-18)" /></g></g>}
    </svg>
  );
}

export const TIER_LABEL: Record<BadgeTier, string> = { earned: "Earned", mastered: "Mastered", locked: "Locked" };
