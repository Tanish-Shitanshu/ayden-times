import { api, type TractionData } from "../../api/client";
import { useAsync, useInterval } from "../../lib/hooks";
import { Avatar, BackLink, Bar, Chip, EmptyState, ErrorState, Icon, LinkButton, Skeleton } from "../../design/components";
import "./traction.css";

const ROLE_NAMES: Record<string, string> = {
  "software-engineer": "Software Engineer",
  "banking-ops": "Banking Operations",
  nurse: "Staff Nurse",
  "tech-consulting": "Consulting Analyst",
  executive: "Startup CEO",
  "data-analyst": "Data Analyst",
  "finance-analyst": "Junior Financial Analyst",
  procurement: "Procurement Trainee",
  marketing: "Digital Marketing Associate",
};

export function Stars({ n }: { n: number }) {
  return <span className="tr-stars" role="img" aria-label={`${n} out of 5 stars`}>{[1, 2, 3, 4, 5].map((i) => <Icon key={i} name="star" fill={i <= n} />)}</span>;
}

function Kpi({ num, unit, label, hint }: { num: string; unit?: string; label: string; hint?: string }) {
  return (
    <div className="card tr-kpi">
      <div className="num">{num}{unit && <small> {unit}</small>}</div>
      <div className="t-lm">{label}</div>
      {hint && <div className="t-label t-secondary">{hint}</div>}
    </div>
  );
}

export default function Traction() {
  const state = useAsync<TractionData>(() => api.getTraction(), []);
  useInterval(() => { api.getTraction().then(state.setData).catch(() => undefined); }, 15000);
  const d = state.data;
  const maxRating = d ? Math.max(1, ...d.ratings) : 1;

  return (
    <div className="container page">
      <div className="page-head">
        <div className="back-row"><BackLink to="/" label="Home" /></div>
        <div className="row gap-12 wrap"><h1 className="t-hl page-title">Real people, real rehearsals</h1><span className="tr-live t-label"><i />Live</span></div>
        <p className="t-bl t-secondary measure">Every number here comes straight from our database and refreshes every few seconds. We do not invent, round up or hard-code anything. A tester only appears below if they ticked the box to show their feedback.</p>
      </div>

      {state.loading && !d && <div className="stack gap-16"><Skeleton h={120} /><Skeleton h={220} /></div>}
      {!!state.error && !d && <ErrorState error={state.error} retry={state.reload} />}

      {d && (
        <div className="stack gap-24">
          <div className="tr-kpis" aria-label="Key numbers">
            <Kpi num={String(d.testers)} label="Testers who gave feedback" hint="Each counted once" />
            <Kpi num={d.avgRating === null ? "–" : d.avgRating.toFixed(1)} unit={d.avgRating === null ? undefined : "/ 5"} label="Average rating" hint={`${d.feedbackCount} response${d.feedbackCount === 1 ? "" : "s"}`} />
            <Kpi num={d.nps === null ? "–" : String(d.nps)} label="Would recommend (NPS)" hint={d.nps === null ? "Shown after 5 answers" : "Promoters minus detractors"} />
            <Kpi num={String(d.platform.missionsCompleted)} label="Missions completed, all time" hint="Includes our own testing" />
          </div>

          {d.platform.visits !== undefined && (
            <section aria-labelledby="tr-t" className="stack gap-12">
              <h2 id="tr-t" className="t-tl">Traffic and funnel</h2>
              <div className="tr-kpis">
                <Kpi num={String(d.platform.visits)} label="Visits" hint="Page loads, one per browser tab session" />
                <Kpi num={String(d.platform.uniqueVisitors ?? 0)} label="New browsers" hint="Seen for the first time" />
                <Kpi num={String(d.platform.missionsStarted)} label="Simulations started" hint={d.platform.visits ? `${Math.round((d.platform.missionsStarted / d.platform.visits) * 100)}% of visits` : undefined} />
                <Kpi num={String(d.platform.missionsCompleted)} label="Simulations finished" hint={d.platform.missionsStarted ? `${Math.round((d.platform.missionsCompleted / d.platform.missionsStarted) * 100)}% of those started` : undefined} />
              </div>
              <p className="t-label t-secondary">Counted without cookies, names or IP addresses. Bots are excluded. Includes our own visits while building and testing.</p>
            </section>
          )}

          {d.feedbackCount === 0 ? (
            <EmptyState icon="reviews" title="No feedback yet" body="Be the first. Try a rehearsal and tell us how it went." action={<LinkButton to="/roles" icon="play_arrow">Try Ayden</LinkButton>} />
          ) : (
            <div className="tr-split">
              <section className="card stack gap-12" aria-labelledby="tr-r">
                <h2 id="tr-r" className="t-tl">Ratings</h2>
                <div className="tr-bars">
                  {[5, 4, 3, 2, 1].map((s) => (
                    <div className="tr-bar-row" key={s}>
                      <span className="t-bm row gap-4">{s}<Icon name="star" fill className="sm" /></span>
                      <Bar value={d.ratings[s - 1]!} max={maxRating} thin label={`${d.ratings[s - 1]} ratings of ${s} stars`} />
                      <span className="t-bm t-secondary" style={{ textAlign: "right" }}>{d.ratings[s - 1]}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="card stack gap-12" aria-labelledby="tr-role">
                <h2 id="tr-role" className="t-tl">Which roles people tried</h2>
                {d.byRole.length === 0 ? <p className="t-bm t-secondary">Role breakdown appears once testers pick a role.</p> : (
                  <div className="tr-bars">
                    {d.byRole.map((r) => (
                      <div className="tr-bar-row role" key={r.roleId}>
                        <span className="t-bm">{ROLE_NAMES[r.roleId] ?? r.roleId}</span>
                        <Bar value={r.count} max={Math.max(...d.byRole.map((x) => x.count))} thin label={`${r.count} responses`} />
                        <span className="t-bm t-secondary" style={{ textAlign: "right" }}>{r.count} · {r.avgRating.toFixed(1)}★</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          <section className="card stack gap-12" aria-labelledby="tr-econ">
            <h2 id="tr-econ" className="t-tl">What a rehearsal costs us (measured)</h2>
            {d.economics.aiCostPerMissionUsd === null ? (
              <p className="t-bm t-secondary">Measured from real model usage once a few missions are complete.</p>
            ) : (
              <div className="tr-kpis">
                <Kpi num={"$" + d.economics.aiCostPerMissionUsd.toFixed(3)} label="AI cost per completed mission" hint="About 22 minutes of practice" />
                <Kpi num={"$" + (d.economics.aiCostPerHourUsd ?? 0).toFixed(2)} label="AI cost per hour of use" hint="Gemini, the biggest cost" />
                <Kpi num={Math.round(d.economics.tokens / 1000).toLocaleString() + "k"} label="Tokens processed" hint="Counted from every response" />
                <Kpi num={"$" + d.economics.totalAiCostUsd.toFixed(2)} label="Total AI cost so far" hint="At published paid prices" />
              </div>
            )}
            <p className="t-label t-secondary">Counted from the token usage Gemini reports for each call, priced at Google&apos;s published paid-tier rates. Our testing is included, and today we run on free quota, so what we actually pay is lower.</p>
          </section>

          <section className="stack gap-12" aria-labelledby="tr-wall">
            <h2 id="tr-wall" className="t-tl">What testers said</h2>
            {d.wall.length === 0 ? (
              <p className="t-bm t-secondary">Quotes appear here when a tester chooses to show their feedback.</p>
            ) : (
              <div className="tr-wall">
                {d.wall.map((w) => (
                  <figure className="card tr-quote" key={w.id} style={{ margin: 0 }}>
                    <Stars n={w.rating} />
                    <blockquote>“{w.comment}”</blockquote>
                    <figcaption className="tr-who">
                      {w.photo ? <img className="tr-photo" src={w.photo} alt="" width={48} height={48} loading="lazy" /> : <Avatar name={w.name} hue={(w.name.length * 47) % 360} />}
                      <div className="stack">
                        <span className="t-lm">{w.name}</span>
                        <span className="t-label t-secondary">{[w.college, w.roleId ? ROLE_NAMES[w.roleId] : undefined].filter(Boolean).join(" · ") || "Tester"}</span>
                      </div>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>

          <div className="row gap-8 wrap">
            <LinkButton to="/feedback" icon="rate_review">Leave your feedback</LinkButton>
            <LinkButton to="/roles" variant="outlined" icon="play_arrow">Try a rehearsal</LinkButton>
            <Chip icon="lock" tone="tonal">Reports stay private to each tester</Chip>
          </div>
        </div>
      )}
    </div>
  );
}
