export function LogoGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="14" fill="var(--primary)" />
      <path d="M13 31.5 24 14l11 17.5" fill="none" stroke="var(--on-primary)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="34" r="3.2" fill="var(--on-primary)" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="row gap-8" style={{ color: "var(--text)" }}>
      <LogoGlyph size={size} />
      <span style={{ fontSize: size * 0.8, fontWeight: 500, letterSpacing: "-0.3px", lineHeight: 1 }}>Ayden</span>
    </span>
  );
}
