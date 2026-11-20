/** Hand-built architecture diagram. Colours come from CSS tokens so it follows light/dark. */
export function ArchitectureDiagram() {
  const box = (x: number, y: number, w: number, h: number, title: string, sub: string[], opts: { accent?: string; dashed?: boolean } = {}) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={16} fill="var(--surface)" stroke={opts.accent ?? "var(--outline-strong)"} strokeWidth={opts.accent ? 2 : 1.25} strokeDasharray={opts.dashed ? "6 5" : undefined} />
      <text x={x + 16} y={y + 28} fontSize="15" fontWeight="500" fill="var(--text)">{title}</text>
      {sub.map((s, i) => <text key={s} x={x + 16} y={y + 50 + i * 19} fontSize="12.5" fill="var(--text-secondary)">{s}</text>)}
    </g>
  );
  const arrow = (d: string, label: string, lx: number, ly: number, color = "var(--primary)") => (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={2} markerEnd="url(#ah)" />
      <rect x={lx - 4} y={ly - 13} width={label.length * 7.2 + 8} height={18} rx={9} fill="var(--bg)" />
      <text x={lx} y={ly} fontSize="12" fontWeight="500" fill={color}>{label}</text>
    </g>
  );
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox="0 0 980 470" width="100%" role="img" aria-labelledby="arch-t arch-d" style={{ display: "block", maxWidth: "100%", height: "auto" }}>
        <title id="arch-t">Ayden architecture</title>
        <desc id="arch-d">The browser talks to one Cloud Run service that hosts the API and the deterministic engine. Gemini colleague agents propose actions, the engine validates them and emits events. Firestore stores sessions, Secret Manager holds the key, Cloud Logging records calls, learner code runs in Google's sandbox. BigQuery is planned.</desc>
        <defs>
          <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke" /></marker>
        </defs>
        {box(16, 150, 170, 110, "Browser", ["React web app", "Mobile and desktop"])}
        <rect x={268} y={40} width={330} height={300} rx={22} fill="var(--primary-container)" opacity={0.55} />
        <text x={288} y={70} fontSize="13" fontWeight="500" fill="var(--on-primary-container)">Cloud Run</text>
        {box(288, 86, 290, 92, "API (Fastify)", ["Sessions, missions, reports", "Serves the web app"])}
        {box(288, 200, 290, 122, "Engine (pure TypeScript)", ["Clock, beats, hidden truth", "Validates every tool call", "Signals, checks, consequences"], { accent: "var(--primary)" })}
        {box(690, 24, 274, 150, "Gemini API", ["Hydrogen: colleague agents", "  (function calling)", "Argon: judge + scenario director", "Embeddings: drill matching"], { accent: "var(--purple)" })}
        {box(690, 196, 274, 74, "Google code sandbox", ["Runs learner code and tests"])}
        {box(268, 372, 152, 80, "Firestore", ["Sessions, events,", "reports"])}
        {box(436, 372, 162, 80, "Secret Manager", ["Model API key"])}
        {box(614, 372, 160, 80, "Cloud Logging", ["Structured logs"])}
        {box(790, 372, 174, 80, "BigQuery", ["Planned: analytics"], { dashed: true })}
        {arrow("M186 190 L282 150", "requests", 196, 152)}
        {arrow("M282 236 L192 236", "events", 208, 230, "var(--success)")}
        {arrow("M690 120 L584 236", "proposes", 600, 162, "var(--purple)")}
        {arrow("M578 262 L684 232", "runs checks", 600, 278)}
        <g>
          <path d="M520 322 Q 560 345 520 340 Q 470 336 486 322" fill="none" stroke="var(--primary)" strokeWidth={2} markerEnd="url(#ah)" />
          <rect x={524} y={330} width={66} height={18} rx={9} fill="var(--bg)" /><text x={528} y={343} fontSize="12" fontWeight="500" fill="var(--primary)">validates</text>
        </g>
        <path d="M344 340 L344 368" stroke="var(--outline-strong)" strokeWidth={1.5} markerEnd="url(#ah)" />
        <path d="M516 340 L516 368" stroke="var(--outline-strong)" strokeWidth={1.5} markerEnd="url(#ah)" />
        <path d="M590 330 L690 368" stroke="var(--outline-strong)" strokeWidth={1.5} markerEnd="url(#ah)" />
        <path d="M596 336 L860 368" stroke="var(--outline-strong)" strokeWidth={1.5} strokeDasharray="5 4" markerEnd="url(#ah)" />
      </svg>
      <figcaption className="t-bm t-secondary" style={{ marginTop: 12, textAlign: "center" }}>The model proposes. The engine decides.</figcaption>
    </figure>
  );
}
