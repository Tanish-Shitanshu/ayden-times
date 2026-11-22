import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../api/client";
import { useAsync } from "../../lib/hooks";
import { Chip, ErrorState, Icon, LinkButton } from "../../design/components";
import { BadgeArt } from "../game/BadgeArt";
import { Certificate } from "./Certificate";
import "./share.css";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Public, read-only work sample. Reached from a link the learner chose to share. */
export default function Sample() {
  const { token = "" } = useParams();
  const q = useAsync(() => api.getSample(token), [token]);
  const s = q.data;
  useEffect(() => { if (s) document.title = `${s.name}: ${s.roleTitle} work sample · Ayden`; }, [s]);

  if (q.error) return <div className="container page"><ErrorState error={q.error} retry={q.reload} extra={<LinkButton to="/" variant="outlined">Go to Ayden</LinkButton>} /></div>;
  if (!s) return <div className="container page" role="status" aria-live="polite"><p className="t-bl t-secondary">Loading the work sample…</p></div>;

  return (
    <div className="container page">
      <div className="sample" style={{ ["--accent" as string]: s.accentHex }}>
        <section className="card sample-hero">
          <div className="row gap-8 wrap"><Chip tone="tonal" icon="verified">Work sample</Chip><Chip tone="tonal">{s.roleTitle}</Chip></div>
          <h1 className="t-hm page-title">{s.name}</h1>
          <p className="t-bl">{s.headline}</p>
          <p className="t-label t-secondary">Practice simulation completed {fmt(s.issuedAt)} · ID {s.certificateId}</p>
        </section>

        {s.badges.length > 0 && (
          <section aria-labelledby="sb-h" className="stack gap-12">
            <h2 id="sb-h" className="t-tl">Badges earned</h2>
            <div className="sample-badges">{s.badges.map((b) => <figure key={b.id}><BadgeArt roleId={s.roleId} skillId={b.skillId} title={b.title} size={96} tier="earned" /><figcaption>{b.title}</figcaption></figure>)}</div>
          </section>
        )}

        <section aria-labelledby="ss-h" className="stack gap-12">
          <h2 id="ss-h" className="t-tl">Skills shown</h2>
          <div className="sample-skills">
            {s.skills.map((k) => (
              <div key={k.skillId} className="card sample-skill">
                <div className="row gap-8"><h3 className="t-tm grow">{k.label}</h3><Chip tone={k.state === "strong" ? "success" : "warning"} icon={k.state === "strong" ? "verified" : "trending_up"}>{k.state === "strong" ? "At target" : "Developing"}</Chip></div>
                <p className="t-bm t-secondary">{k.anchorsMet} of {k.anchorsTotal} behaviours shown (target {k.target}).</p>
              </div>
            ))}
          </div>
        </section>

        {s.moments.length > 0 && (
          <section aria-labelledby="sm-h" className="stack gap-12">
            <h2 id="sm-h" className="t-tl">In their own words</h2>
            {s.moments.map((m, i) => (
              <blockquote key={i} className="quote"><p>“{m.quote}”</p><small>{m.skillLabel}{m.why ? ` · ${m.why}` : ""}</small></blockquote>
            ))}
            <p className="t-label t-secondary row gap-4"><Icon name="fact_check" className="sm" />{s.integrity.mode === "live" && s.integrity.quotesVerified > 0 ? `Each quote was checked against the learner's transcript (${s.integrity.quotesVerified} verified).` : "Quotes come from the learner's transcript."}</p>
          </section>
        )}

        <section aria-labelledby="sc-h" className="stack gap-12">
          <h2 id="sc-h" className="t-tl">Certificate</h2>
          <Certificate sample={s} />
        </section>

        <p className="t-label t-secondary">{s.notice} <Link to="/how-it-works">How Ayden works</Link></p>
        <div><LinkButton to="/roles" icon="play_arrow">Try your own first 90 days</LinkButton></div>
      </div>
    </div>
  );
}
