import { Link } from "react-router";
import "./landing.css";
import { content } from "../../content";
import { api } from "../../api/client";
import { useAsync } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { Avatar, Chip, Icon, IconTile, LinkButton, ErrorState, Bar } from "../../design/components";
import { RoleCard, RoleCardSkeleton } from "../roles/RoleCard";

function Preview() {
  return (
    <div className="preview" aria-hidden="true">
      <div className="preview-card pv-chat">
        <div className="pv-head"><Avatar name="Priya Nair" hue={210} size="sm" presence="online" /><span className="t-tm">Priya Nair</span><Chip tone="tonal">AI</Chip><span className="spacer" /><span className="t-label t-secondary">Wed 09:30</span></div>
        <div className="pv-bubble">Morning! I've put <b>INV-142</b> on your board. Customers are getting a double discount. Release is Friday.</div>
        <div className="pv-mine">Before I start: does the discount apply per line or to the whole order?</div>
      </div>
      <div className="preview-card pv-review">
        <div className="row gap-8"><Chip tone="error" icon="block">Blocker</Chip><span className="t-label t-secondary mono">src/pricing.py:6</span></div>
        <div className="pv-code"><span className="del">-    subtotal = subtotal * (1 - rate)</span>{"\n"}<span className="add">+    return price * quantity</span></div>
        <p className="t-bm" style={{ marginTop: 8 }}>Could you add a test for quantity 0? It has regressed before.</p>
      </div>
      <div className="preview-card pv-xray">
        <div className="row gap-8"><Icon name="radiology" style={{ color: "var(--primary)" }} /><span className="t-tm">Skill X-ray</span><span className="spacer" /><Chip tone="warning">Developing</Chip></div>
        <p className="t-bm t-secondary" style={{ marginTop: 6 }}>Commits teammates can follow</p>
        <div className="pv-line"><Bar value={80} thin /><span className="t-label t-secondary">You said</span></div>
        <div className="pv-line"><Bar value={40} marker={60} thin color="var(--warning)" /><span className="t-label t-secondary">You showed</span></div>
      </div>
    </div>
  );
}

export default function Landing() {
  const t = useT();
  const roles = useAsync(() => api.getRoles(), []);
  const stats = content.whyNow.stats.filter((s) => s.verified);
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="hero-eyebrow"><span className="dot" />MVP in progress · built at the Delhi City Buildathon</span>
            <h1 className="t-display page-title">Rehearse your <span className="accent">first 90 days.</span></h1>
            <p className="hero-sub">{content.hero.sub}</p>
            <div className="hero-cta">
              <LinkButton to="/demo" size="lg" icon="play_arrow">{content.hero.cta}</LinkButton>
              <LinkButton to="/how-it-works" size="lg" variant="outlined">{content.hero.secondary}</LinkButton>
            </div>
            <p className="hero-note"><Icon name="lock" className="sm" />{content.hero.note}</p>
          </div>
          <Preview />
        </div>
      </section>

      <div className="container">
        <section className="section" aria-labelledby="loop-h">
          <div className="section-head"><span className="kicker">The loop</span><h2 id="loop-h" className="t-hl">Diagnose, train, prove.</h2></div>
          <div className="grid grid-3">
            {content.loop.map((c, i) => (
              <div key={c.title} className="card loop-card">
                <span className="loop-step">0{i + 1}</span>
                <IconTile icon={c.icon} color={["#1a73e8", "#e37400", "#1e8e3e"][i]} />
                <h3 className="t-tl" style={{ marginTop: 16 }}>{c.title}</h3>
                <p className="t-bm t-secondary" style={{ marginTop: 8 }}>{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="never-h">
          <div className="section-head"><span className="kicker">The gap</span><h2 id="never-h" className="t-hm">What new hires are never taught</h2></div>
          <div className="strip">{content.neverTaught.map((x) => <Chip key={x} tone="tonal">{x}</Chip>)}</div>
        </section>

        <section className="section" aria-labelledby="roles-h">
          <div className="section-head row" style={{ flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div className="stack gap-8 grow"><span className="kicker">Five roles, one engine</span><h2 id="roles-h" className="t-hl">Pick a first job to rehearse</h2></div>
            <Link to="/roles" className="t-bm row gap-4" style={{ fontWeight: 500, minHeight: 44 }}>{t("common.browseRoles")}<Icon name="arrow_forward" className="sm" /></Link>
          </div>
          {roles.error ? <ErrorState error={roles.error} retry={roles.reload} /> : (
            <div className="grid grid-3">
              {roles.loading || !roles.data ? Array.from({ length: 5 }, (_, i) => <RoleCardSkeleton key={i} />) : roles.data.map((r) => <RoleCard key={r.id} role={r} />)}
            </div>
          )}
        </section>

        <section className="section split" aria-label="Why now and privacy">
          <div className="card tonal" style={{ padding: 28 }}>
            <span className="kicker" style={{ fontSize: 13, fontWeight: 500, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--primary)" }}>{content.whyNow.title}</span>
            <h2 className="t-tl" style={{ marginTop: 8 }}>Start on day zero, not day one.</h2>
            {stats.length > 0 ? (
              <ul className="stack gap-12" style={{ margin: "16px 0 0", padding: 0, listStyle: "none" }}>
                {stats.map((s) => <li key={s.text} className="t-bl">{s.text} <a href={s.url} target="_blank" rel="noopener noreferrer" className="t-label">{s.source}</a></li>)}
              </ul>
            ) : <p className="t-bl t-secondary" style={{ marginTop: 12 }}>{content.whyNow.qualitative}</p>}
          </div>
          <div className="card" style={{ padding: 28 }}>
            <h2 className="t-tl">Private by design</h2>
            <ul className="stack gap-16" style={{ margin: "20px 0 0", padding: 0, listStyle: "none" }}>
              {content.privacy.map((p) => <li key={p.text} className="bullet"><IconTile icon={p.icon} color="#1a73e8" size="sm" /><span className="t-bl" style={{ paddingTop: 8 }}>{p.text}</span></li>)}
            </ul>
            <Link to="/privacy" className="row gap-4 t-bm" style={{ marginTop: 20, fontWeight: 500, minHeight: 44 }}>Read how privacy works<Icon name="arrow_forward" className="sm" /></Link>
          </div>
        </section>

        <section className="section" aria-labelledby="g-h">
          <h2 id="g-h" className="t-label t-secondary" style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>{t("footer.built")}</h2>
          <div className="google-row" style={{ marginTop: 12 }}>
            {content.google.map((g, i) => <span key={g} className="row gap-24"><span className="svc t-tm">{g}</span>{i < content.google.length - 1 && <span className="t-secondary" aria-hidden="true">·</span>}</span>)}
            <Link to="/how-it-works" className="row gap-4 t-bm" style={{ fontWeight: 500, minHeight: 44 }}>See the architecture<Icon name="arrow_forward" className="sm" /></Link>
          </div>
        </section>

        <section className="section cta-band">
          <h2 className="t-hm">Your first 90 days, in 25 minutes.</h2>
          <p className="t-bl" style={{ marginTop: 8, opacity: 0.85 }}>No sign-up. Private to you. Formative feedback, not a hiring score.</p>
          <div style={{ marginTop: 24 }}><LinkButton to="/demo" size="lg" icon="play_arrow">Try the demo</LinkButton></div>
        </section>
      </div>
    </>
  );
}
