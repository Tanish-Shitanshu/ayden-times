import { Link } from "react-router";
import { Icon } from "../../design/components";
import { LEVELS, XP_RULES, type Quest, type XpState } from "./xp";
import "./game.css";

export function LevelCard({ xp, quests, compact = false }: { xp: XpState; quests?: Quest[]; compact?: boolean }) {
  const pct = xp.span ? Math.min(100, Math.round((xp.into / xp.span) * 100)) : 100;
  return (
    <section className={`card level-card${compact ? " compact" : ""}`} aria-labelledby="lvl-h">
      <div className="level-top">
        <span className="level-medal" aria-hidden="true"><b>{xp.level + 1}</b></span>
        <div className="grow stack gap-4">
          <span className="t-label t-secondary">Ramp level {xp.level + 1} of {LEVELS.length}</span>
          <h2 id="lvl-h" className="t-tl">{xp.title}</h2>
          <p className="t-bm t-secondary">{xp.blurb}</p>
        </div>
        <span className="level-xp tnum"><b>{xp.xp}</b> XP</span>
      </div>
      <div className="level-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={xp.next ? `Progress to ${xp.next}` : "Top level reached"}><div style={{ width: `${pct}%` }} /></div>
      <p className="t-label t-secondary" style={{ marginTop: 6 }}>{xp.next ? `${xp.toNext} XP to ${xp.next}` : "Top level. Keep proving it on fresh variants."}</p>

      {quests && quests.length > 0 && (
        <div className="quests">
          <h3 className="t-label" style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>Today</h3>
          <ul>
            {quests.map((q) => (
              <li key={q.id} className={q.done ? "done" : ""}>
                <Icon name={q.done ? "check_circle" : "radio_button_unchecked"} fill={q.done} className="sm" />
                <span className="grow"><b>{q.title}</b><span className="t-secondary"> · {q.hint}</span></span>
                {q.to && !q.done && <Link to={q.to} className="t-bm" style={{ fontWeight: 500 }}>Go</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && (
        <details className="accordion" style={{ marginTop: 12 }}>
          <summary className="t-bm">How XP works<Icon name="expand_more" className="chev" /></summary>
          <p className="t-bm t-secondary" style={{ margin: "8px 0" }}>XP only comes from things that really happened. It is private to you. Nothing is ranked or shared.</p>
          <ul className="xp-rules">{XP_RULES.map((r) => <li key={r.label}><span>{r.label}</span><b>+{r.xp}</b></li>)}</ul>
        </details>
      )}
    </section>
  );
}
