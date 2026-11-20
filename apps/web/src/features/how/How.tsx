import { useEffect } from "react";
import { useLocation } from "react-router";
import { api, API_MODE } from "../../api/client";
import type { SystemStatus } from "../../contract";
import { content } from "../../content";
import { useT } from "../../lib/i18n";
import { useAsync, useInterval } from "../../lib/hooks";
import { BackLink, Banner, Chip, Icon, IconTile, Skeleton } from "../../design/components";
import { ArchitectureDiagram } from "./Diagram";

const SECTIONS = [["loop", "The loop"], ["engine", "Architecture"], ["google", "Google stack"], ["scoring", "Scoring"], ["security", "Security"], ["built", "Built vs planned"], ["status", "Live status"]] as const;

function StateChip({ s }: { s: SystemStatus["googleServices"][number]["state"] }) {
  return <Chip tone={s === "live" ? "success" : s === "fallback" ? "warning" : "planned"} icon={s === "live" ? "check_circle" : s === "fallback" ? "sync_problem" : "schedule"}>{s === "live" ? "Live" : s === "fallback" ? "Fallback" : "Planned"}</Chip>;
}

export default function How() {
  const t = useT();
  const loc = useLocation();
  const status = useAsync(() => api.getStatus(), []);
  useInterval(() => { api.getStatus().then(status.setData).catch(() => undefined); }, 15000);
  useEffect(() => {
    if (!loc.hash) return;
    const id = loc.hash.slice(1);
    const tm = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => clearTimeout(tm);
  }, [loc.hash, status.loading]);
  const s = status.data;
  const liveServices = new Set(s?.googleServices.filter((g) => g.state !== "planned").map((g) => g.name) ?? []);
  const securityRows = content.security.filter((r) => liveServices.has(r.service));
  const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); const el = document.getElementById(id); el?.scrollIntoView({ behavior: "smooth", block: "start" }); el?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true }); };

  return (
    <div className="container page">
      <div className="page-head">
        <div className="back-row"><BackLink to="/" label={t("back.home")} /></div>
        <h1 className="t-hl page-title">{t("how.title")}</h1>
        <p className="t-bl t-secondary measure">A reliable engine with a dynamic AI surface. Gemini agents play your colleagues; deterministic code decides what is allowed, what counts, and what happens next.</p>
      </div>
      <div className="how-layout">
        <nav className="how-nav" aria-label="On this page">
          {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} onClick={go(id)}>{label}</a>)}
        </nav>
        <div className="stack gap-48 how-body">
          <section id="loop" aria-labelledby="loop-h">
            <h2 id="loop-h" className="t-hm" tabIndex={-1}>The loop</h2>
            <div className="grid grid-3" style={{ marginTop: 16 }}>
              {content.loop.map((c, i) => <div key={c.title} className="card"><IconTile icon={c.icon} color={["#1a73e8", "#e37400", "#1e8e3e"][i]} size="sm" /><h3 className="t-tm" style={{ marginTop: 12 }}>{c.title}</h3><p className="t-bm t-secondary" style={{ marginTop: 6 }}>{c.body}</p></div>)}
            </div>
          </section>

          <section id="engine" aria-labelledby="engine-h">
            <h2 id="engine-h" className="t-hm" tabIndex={-1}>Architecture</h2>
            <p className="t-bl t-secondary measure" style={{ marginTop: 8 }}>Every colleague reply is a tool call proposal. The engine checks it against the scenario's hidden truth and persona rules, then accepts or rejects it. You can watch this live in the Engine trace inside any mission.</p>
            <div className="card" style={{ marginTop: 16, padding: 16, overflowX: "auto" }} tabIndex={0} role="region" aria-label="Architecture diagram"><div style={{ minWidth: 640 }}><ArchitectureDiagram /></div></div>
          </section>

          <section id="google" aria-labelledby="google-h">
            <h2 id="google-h" className="t-hm" tabIndex={-1}>Google stack</h2>
            {status.error ? <Banner kind="warning" icon="cloud_off">{t("how.unavailable")}</Banner> : !s ? <Skeleton h={240} r={16} style={{ marginTop: 16 }} /> : (
              <>
                <div className="table-scroll" style={{ marginTop: 16 }} tabIndex={0} role="region" aria-labelledby="google-h">
                  <table className="data-table">
                    <thead><tr><th scope="col">Service</th><th scope="col">State</th><th scope="col">What it does here</th></tr></thead>
                    <tbody>{s.googleServices.map((g) => <tr key={g.name}><td style={{ fontWeight: 500 }}>{g.name}</td><td><StateChip s={g.state} /></td><td>{g.detail}</td></tr>)}</tbody>
                  </table>
                </div>
                <h3 className="t-tm" style={{ marginTop: 24 }}>Models</h3>
                <div className="grid grid-3" style={{ marginTop: 12 }}>
                  {s.models.map((m) => <div key={m.id} className="card"><p className="t-label t-secondary">{m.role}</p><p className="mono t-bm" style={{ marginTop: 4, fontWeight: 500 }}>{m.id}</p><p className="t-bm t-secondary" style={{ marginTop: 6 }}>{m.purpose}</p></div>)}
                </div>
              </>
            )}
            <p className="t-bm t-secondary" style={{ marginTop: 16 }}>Built with Antigravity and Agent Skills that encode our coding standards, plus AI Studio for prompt work.</p>
          </section>

          <section id="scoring" aria-labelledby="scoring-h">
            <h2 id="scoring-h" className="t-hm" tabIndex={-1}>Scoring</h2>
            <div className="grid grid-2" style={{ marginTop: 16 }}>
              {content.scoring.map((c) => <div key={c.title} className="card row gap-16" style={{ alignItems: "flex-start" }}><IconTile icon={c.icon} color="#1a73e8" size="sm" /><div><h3 className="t-tm">{c.title}</h3><p className="t-bm t-secondary" style={{ marginTop: 4 }}>{c.body}</p></div></div>)}
            </div>
            <p className="t-bm t-secondary" style={{ marginTop: 12 }}>Scores are formative practice feedback. They are not validated against job performance.</p>
          </section>

          <section id="security" aria-labelledby="security-h">
            <h2 id="security-h" className="t-hm" tabIndex={-1}>Security</h2>
            {status.error ? <Banner kind="warning" icon="cloud_off">{t("how.unavailable")}</Banner> : !s ? <Skeleton h={200} r={16} style={{ marginTop: 16 }} /> : (
              <div className="table-scroll" style={{ marginTop: 16 }} tabIndex={0} role="region" aria-labelledby="security-h">
                <table className="data-table">
                  <thead><tr><th scope="col">Area</th><th scope="col">How we protect it</th><th scope="col">Service</th></tr></thead>
                  <tbody>{securityRows.map((r) => <tr key={r.area}><td style={{ fontWeight: 500 }}>{r.area}</td><td>{r.how}</td><td>{r.service}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>

          <section id="built" aria-labelledby="built-h">
            <h2 id="built-h" className="t-hm" tabIndex={-1}>Built vs planned</h2>
            <div className="grid grid-2" style={{ marginTop: 16 }}>
              <div className="card"><h3 className="t-tm row gap-8"><Icon name="check_circle" style={{ color: "var(--success)" }} />Built at the event</h3><ul className="stack gap-8" style={{ margin: "12px 0 0", paddingLeft: 20 }}>{content.built.map((b) => <li key={b} className="t-bm">{b}</li>)}</ul></div>
              <div className="card" style={{ borderStyle: "dashed" }}><h3 className="t-tm row gap-8"><Icon name="schedule" style={{ color: "var(--text-secondary)" }} />Planned</h3><ul className="stack gap-8" style={{ margin: "12px 0 0", paddingLeft: 20 }}>{content.planned.map((b) => <li key={b} className="t-bm t-secondary">{b}</li>)}</ul></div>
            </div>
          </section>

          <section id="status" aria-labelledby="status-h">
            <div className="row gap-8 wrap"><h2 id="status-h" className="t-hm grow" tabIndex={-1}>Live status</h2>{s && <Chip tone={s.runtime === "live" ? "success" : "warning"} icon="sensors">{s.runtime}</Chip>}</div>
            {API_MODE === "mock" && <div style={{ marginTop: 12 }}><Banner kind="warning" icon="science">Development mock: these counters come from this browser, not the live server.</Banner></div>}
            {status.error ? <div style={{ marginTop: 16 }}><Banner kind="warning" icon="cloud_off">{t("how.unavailable")}</Banner></div> : !s ? <Skeleton h={120} r={16} style={{ marginTop: 16 }} /> : (
              <>
                <div className="grid grid-3" style={{ marginTop: 16 }} aria-live="polite">
                  {([["Missions started", s.counters.missionsStarted], ["Missions completed", s.counters.missionsCompleted], ["Model calls", s.counters.modelCalls], ["Fallbacks", s.counters.fallbacks], ["Quotes verified", s.counters.quotesVerified], ["Quotes rejected", s.counters.quotesRejected]] as const).map(([k, v]) => (
                    <div key={k} className="card tonal"><p className="t-hm tnum">{v.toLocaleString("en-IN")}</p><p className="t-bm t-secondary">{k}</p></div>
                  ))}
                </div>
                <p className="t-label t-secondary" style={{ marginTop: 12 }}>v{s.version}{s.commit ? ` · ${s.commit}` : ""} · {s.region} · refreshes every 15 s</p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
