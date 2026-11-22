import type { Report } from "../../contract";
import { Chip, Icon } from "../../design/components";

/** Close calls: mistakes the learner avoided (and ones they fell into), each with what it would have cost. */
export function CloseCalls({ report }: { report: Report }) {
  const calls = report.closeCalls ?? [];
  if (!calls.length) return null;
  const caught = calls.filter((c) => c.caught);
  const missed = calls.filter((c) => !c.caught);
  return (
    <section className="section" aria-labelledby="cc-h">
      <h2 id="cc-h" className="t-tl" style={{ marginBottom: 4 }}>Close calls</h2>
      <p className="t-bm t-secondary" style={{ marginBottom: 16 }}>{caught.length ? `You avoided ${caught.length} real mistake${caught.length === 1 ? "" : "s"} here, not at work.` : "These are the mistakes this scenario was built to catch. Better here than at work."}</p>
      <div className="stack gap-12">
        {caught.map((c) => (
          <div key={c.id} className="card cc-card cc-caught">
            <Icon name="verified" />
            <div className="stack gap-4 grow"><span className="t-lm">You avoided: {c.label}</span><p className="t-bm t-secondary">It would have meant {c.cost}.</p></div>
            <Chip tone="success" icon="check_circle">Caught</Chip>
          </div>
        ))}
        {missed.map((c) => (
          <div key={c.id} className="card cc-card cc-missed">
            <Icon name="warning" />
            <div className="stack gap-4 grow"><span className="t-lm">Missed this time: {c.label}</span><p className="t-bm t-secondary">In real work this means {c.cost}.</p></div>
            <Chip tone="tonal" icon="replay">Try again</Chip>
          </div>
        ))}
      </div>
    </section>
  );
}

const VERDICT: Record<NonNullable<Report["calibration"]>["verdict"], string> = {
  "well-calibrated": "Well calibrated",
  overconfident: "Over-confident",
  underconfident: "Under-confident",
  mixed: "Mixed",
};

/** Calibration: the rating given before the mission against what was shown. It rewards knowing where you stand, not scoring high. */
export function Calibration({ report }: { report: Report }) {
  const c = report.calibration;
  if (!c) return null;
  return (
    <section className="section" aria-labelledby="cal-h">
      <h2 id="cal-h" className="t-tl" style={{ marginBottom: 4 }}>Calibration</h2>
      <p className="t-bm t-secondary" style={{ marginBottom: 16 }}>You rated yourself before the mission. This compares that with what you showed. It is not a skill score.</p>
      <div className="card stack gap-16">
        <div className="row gap-16 wrap" style={{ alignItems: "center" }}>
          <div className="cal-score" aria-label={`Calibration score ${c.score} out of 100`}><span className="num">{c.score}</span><small>/ 100</small></div>
          <div className="stack gap-4 grow"><Chip tone={c.verdict === "well-calibrated" ? "success" : "tonal"} icon="balance">{c.verdict === "overconfident" && c.score >= 65 ? "A little over-confident" : VERDICT[c.verdict]}</Chip><p className="t-bm">{c.summary}</p></div>
        </div>
        <div className="stack gap-8">
          {c.skills.map((s) => (
            <div key={s.skillId} className="cal-row">
              <span className="t-lm cal-label">{s.label}</span>
              <div className="cal-bars" role="img" aria-label={`${s.label}: you said ${s.said} percent, you showed ${s.showed} percent`}>
                <div className="cal-bar said" style={{ width: `${Math.max(3, s.said)}%` }}><span>You said</span></div>
                <div className="cal-bar showed" style={{ width: `${Math.max(3, s.showed)}%` }}><span>You showed</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Where each colleague's trust ended up, from what the learner actually did. */
export function ColleagueTrust({ report }: { report: Report }) {
  const t = report.colleagueTrust ?? [];
  if (!t.length) return null;
  return (
    <section className="section" aria-labelledby="ct-h">
      <h2 id="ct-h" className="t-tl" style={{ marginBottom: 4 }}>How your colleagues see you</h2>
      <p className="t-bm t-secondary" style={{ marginBottom: 16 }}>Trust builds from what you do, such as asking good questions, checking your work and holding your ground. It changes how they talk to you.</p>
      <div className="row gap-8 wrap">
        {t.map((c) => (
          <Chip key={c.personId} tone={c.level === 2 ? "success" : c.level === 1 ? "primary" : "tonal"} icon={c.level === 2 ? "handshake" : c.level === 1 ? "trending_up" : "visibility"}>{c.name}: {c.label}</Chip>
        ))}
      </div>
    </section>
  );
}
