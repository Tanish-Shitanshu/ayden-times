import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import "./debrief.css";
import "../roles/role.css";
import { api, ApiFailure } from "../../api/client";
import type { NextStep, Report, SkillResult } from "../../contract";
import { useApp } from "../../app/store";
import { useT, errorText } from "../../lib/i18n";
import { copyText, reportMap, useAsync } from "../../lib/hooks";
import { BackLink, Banner, Bar, Breadcrumbs, Button, Chip, Dialog, ErrorState, Icon, LinkButton, LogoGlyph, Tooltip } from "../../design/components";
import { TranscriptDrawer } from "../common/TranscriptDrawer";
import type { I18nKey } from "../../i18n/en";
import { Celebrate } from "../game/Celebrate";
import { FeedbackForm } from "../feedback/FeedbackForm";

const STATE: Record<SkillResult["state"], { tone: "success" | "warning" | "error" | "tonal"; icon: string; color: string }> = {
  strong: { tone: "success", icon: "verified", color: "var(--success)" },
  developing: { tone: "warning", icon: "trending_up", color: "var(--warning)" },
  gap: { tone: "error", icon: "error", color: "var(--error)" },
  uncertain: { tone: "tonal", icon: "help", color: "var(--text-secondary)" },
};

async function findReportId(missionId: string): Promise<string> {
  const known = reportMap.get(missionId);
  if (known) return known;
  const m = await api.getMission(missionId);
  const p = await api.getProgress(m.roleId);
  const a = p.attempts.find((x) => x.missionId === missionId);
  if (!a?.reportId) throw new ApiFailure("not_found", "This mission has no report yet. Finish it first.", 404);
  reportMap.set(missionId, a.reportId);
  return a.reportId;
}

function Reading() {
  const t = useT();
  return (
    <div className="reading" role="status" aria-live="polite">
      <div className="demo-glyph"><LogoGlyph size={64} /></div>
      <h1 className="t-hm page-title">{t("debrief.reading")}</h1>
      <div className="reading-lines t-bl"><span>{t("debrief.r1")}</span><span>{t("debrief.r2")}</span><span>{t("debrief.r3")}</span></div>
    </div>
  );
}

function SkillCard({ s, onQuote }: { s: SkillResult; onQuote: (seq: number) => void }) {
  const t = useT();
  const st = STATE[s.state];
  const self = s.selfRating ? ((s.selfRating - 1) / 4) * 100 : null;
  return (
    <article className="card skill-res">
      <div className="row gap-8" style={{ alignItems: "flex-start" }}>
        <h3 className="t-tm grow">{s.label}</h3>
        <Chip tone={st.tone} icon={st.icon}>{t(`state.${s.state}` as I18nKey)}</Chip>
      </div>
      <div className="bars">
        <span className="lbl">{t("debrief.youSaid")}</span>{self === null ? <span className="t-label t-secondary">—</span> : <Bar value={self} thin color="var(--outline-strong)" label={t("debrief.youSaid")} />}<span className="val">{s.selfRating ? `${s.selfRating}/5` : "—"}</span>
        <span className="lbl">{t("debrief.youShowed")}</span><Bar value={s.anchorsMet} max={s.anchorsTotal} marker={s.target} thin color={st.color} label={t("debrief.youShowed")} /><span className="val">{s.anchorsMet}/{s.anchorsTotal}</span>
        <span className="lbl">{t("debrief.target")}</span><span className="t-label t-secondary row gap-4"><span style={{ width: 2, height: 12, background: "var(--text)", display: "inline-block" }} aria-hidden="true" />{s.target}/{s.anchorsTotal}</span><span />
      </div>
      {s.confidenceGap && <p className="t-bm row gap-8"><Icon name={s.confidenceGap === "aligned" ? "balance" : s.confidenceGap === "overestimated" ? "arrow_downward" : "arrow_upward"} className="sm" style={{ color: "var(--text-secondary)" }} />{t(`gap.${s.confidenceGap}` as I18nKey)}</p>}
      {(s.signals.length > 0 || s.evidence.length > 0 || s.missedFact) && (
        <details className="accordion">
          <summary className="t-bm">{t("debrief.whatWeSaw")}<Icon name="expand_more" className="chev" /></summary>
          <ul className="sig-list">
            {s.signals.map((g) => (
              <li key={g.id}>
                <Icon name={g.met ? "check_circle" : "cancel"} fill className="sm" style={{ color: g.met ? "var(--success)" : "var(--text-secondary)" }} />
                <span className="grow">{g.anchor}<span className="sr-only">{g.met ? " met" : " not met"}</span></span>
                <Tooltip text={g.source === "code" ? "Checked by code" : "Observed by the judge with a quote"}><Icon name={g.source === "code" ? "code" : "rate_review"} className="xs" style={{ color: "var(--text-secondary)" }} label={g.source === "code" ? "code" : "reviewer"} /></Tooltip>
              </li>
            ))}
          </ul>
          {s.evidence.length > 0 && <h4 className="t-label t-secondary" style={{ marginTop: 16, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("debrief.evidence")}</h4>}
          {s.evidence.map((e, i) => (
            <blockquote key={i} className={`quote ${e.tone}`}>
              <q>{e.quote}</q>
              <p className="t-bm t-secondary" style={{ marginTop: 6 }}>{e.note}</p>
              <div className="row gap-8 wrap" style={{ marginTop: 6 }}>
                {e.verifiedBySystem && <Chip tone="success" icon="verified">{t("debrief.verified")}</Chip>}
                <Button variant="text" size="sm" icon="forum" onClick={() => onQuote(e.eventSeq)}>{t("debrief.viewInConv")}</Button>
              </div>
            </blockquote>
          ))}
          {s.missedFact && <div style={{ marginTop: 12 }}><Banner kind="info" icon="lightbulb"><b>{t("debrief.missed")}:</b> {s.missedFact}</Banner></div>}
        </details>
      )}
    </article>
  );
}

export default function Debrief() {
  const { missionId = "" } = useParams();
  const t = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useApp((s) => s.toast);
  const ensure = useApp((s) => s.ensureSession);
  const stateId = (loc.state as { reportId?: string } | null)?.reportId;
  if (stateId) reportMap.set(missionId, stateId);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<unknown>();
  const [tick, setTick] = useState(0);
  const [transcript, setTranscript] = useState<number | null>(null);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const role = useAsync(() => (report ? api.getRole(report.roleId) : Promise.resolve(null)), [report?.roleId]);
  const started = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    setErr(undefined); setReport(null);
    started.current = Date.now();
    const poll = async (id: string) => {
      try {
        const r = await api.getReport(id);
        if (!alive) return;
        if (r.status === "processing") {
          if (Date.now() - started.current > 60000) { setErr(new ApiFailure("internal", "Judging is taking longer than usual.", 504)); return; }
          timer = setTimeout(() => poll(id), 2000);
        } else setReport(r);
      } catch (e) { if (alive) setErr(e); }
    };
    ensure().then(() => findReportId(missionId)).then((id) => { if (alive) poll(id); }).catch((e) => alive && setErr(e));
    return () => { alive = false; clearTimeout(timer); };
  }, [missionId, tick, ensure]);

  const startDrill = async (n: NextStep) => {
    if (!report) return;
    setBusy(n.drillId);
    try { const m = await api.createMission({ roleId: report.roleId, drillId: n.drillId, mode: "quick" }); nav(`/mission/${m.id}`); }
    catch (e) { toast(errorText(t, e)); } finally { setBusy(null); }
  };

  const roleHref = report ? `/roles/${report.roleId}` : "/roles";
  if (err !== undefined) return <div className="container page"><BackLink to={roleHref} label={t("back.role")} /><ErrorState error={err} retry={() => setTick((x) => x + 1)} extra={<LinkButton to={roleHref} variant="outlined">{t("back.role")}</LinkButton>} /></div>;
  if (!report) return <div className="container page"><Reading /></div>;
  if (report.status === "failed") return <div className="container page"><BackLink to={roleHref} label={t("back.role")} /><ErrorState error={{ code: "internal", message: t("debrief.failed") }} retry={() => setTick((x) => x + 1)} extra={<LinkButton to={roleHref} variant="outlined">{t("back.role")}</LinkButton>} /></div>;

  const first = report.nextSteps[0];
  return (
    <div className="container page" style={{ paddingBottom: 0 }}>
      <div className="page-head">
        <div className="back-row"><BackLink to={roleHref} label={t("back.role")} /><Breadcrumbs items={[{ label: t("nav.roles"), to: "/roles" }, { label: role.data?.title ?? "…", to: roleHref }, { label: "Report" }]} /></div>
        <div className="row gap-8 wrap">
          <Tooltip text={report.privacyNote}><Chip tone="primary" icon="lock">{t("debrief.onlyYou")}</Chip></Tooltip>
          <Chip tone="tonal" icon="school">{t("debrief.formative")}</Chip>
          {report.integrity.mode !== "live" && <Chip tone="warning" icon="cloud_off">{report.integrity.mode}</Chip>}
        </div>
        <h1 className="t-hm page-title measure" style={{ marginTop: 12 }}>{report.headline}</h1>
        <p className="t-bl t-secondary measure">{report.summary}</p>
      </div>

      <Celebrate report={report} missionId={missionId} />

      <section aria-labelledby="sm-h">
        <h2 id="sm-h" className="t-tl" style={{ marginBottom: 16 }}>{t("debrief.skillMap")}</h2>
        <div className="skill-grid">{report.skills.map((s) => <SkillCard key={s.skillId} s={s} onQuote={setTranscript} />)}</div>
      </section>

      {report.keyMoments.length > 0 && (
        <section className="section" aria-labelledby="km-h">
          <h2 id="km-h" className="t-tl" style={{ marginBottom: 16 }}>{t("debrief.keyMoments")}</h2>
          <div className="stack gap-12">
            {report.keyMoments.map((k) => (
              <div key={k.eventSeq + k.quote} className="card moment">
                <Icon name="format_quote" style={{ color: "var(--primary)" }} />
                <div className="stack gap-4 grow"><q className="t-bl">{k.quote}</q><p className="t-bm t-secondary">{k.why}</p></div>
                <Button variant="text" size="sm" onClick={() => setTranscript(k.eventSeq)}>{t("debrief.viewInConv")}</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {report.consequences.length > 0 && (
        <section className="section" aria-labelledby="cq-h">
          <h2 id="cq-h" className="t-tl" style={{ marginBottom: 16 }}>{t("debrief.consequences")}</h2>
          <ol className="timeline">
            {report.consequences.map((c) => (
              <li key={c.eventSeq} className="next"><span className="node" aria-hidden="true"><Icon name="schedule" /></span><h3 className="t-tm">{c.title}</h3><p className="t-bm t-secondary">{c.detail}</p></li>
            ))}
          </ol>
        </section>
      )}

      <section className="section" aria-labelledby="ns-h">
        <h2 id="ns-h" className="t-tl" style={{ marginBottom: 16 }}>{t("debrief.nextSteps")}</h2>
        <div className="grid grid-2">
          {report.nextSteps.map((n) => (
            <div key={n.drillId} className="card next-card">
              <div className="row gap-8 wrap"><Chip tone="purple" icon="fitness_center">Drill</Chip><Chip icon="schedule">{t("common.minutes", { n: n.estMinutes })}</Chip><Chip tone={n.scaffold === "hinted" ? "primary" : "tonal"} icon={n.scaffold === "hinted" ? "tips_and_updates" : "lightbulb_outline"}>{n.scaffold === "hinted" ? t("debrief.hinted") : t("debrief.unhinted")}</Chip></div>
              <h3 className="t-tm">{n.title}</h3>
              <p className="t-bm t-secondary grow">{n.why}</p>
              <div><Button icon="play_arrow" loading={busy === n.drillId} onClick={() => startDrill(n)}>{t("debrief.startDrill")}</Button></div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <details className="card accordion">
          <summary><Icon name="policy" style={{ color: "var(--primary)" }} />{t("debrief.how")}<Icon name="expand_more" className="chev" /></summary>
          <dl className="record-grid" style={{ marginTop: 8 }}>
            <div className="record-row"><dt>Judge model</dt><dd className="mono">{report.integrity.judgeModel}</dd></div>
            <div className="record-row"><dt>Mode</dt><dd>{report.integrity.mode}</dd></div>
            <div className="record-row"><dt>Quotes verified</dt><dd className="tnum">{report.integrity.quotesVerified}</dd></div>
            <div className="record-row"><dt>Quotes rejected</dt><dd className="tnum">{report.integrity.quotesRejected}</dd></div>
            <div className="record-row"><dt>Uncertain skills</dt><dd>{report.integrity.uncertainSkills.length ? report.integrity.uncertainSkills.map((id) => report.skills.find((s) => s.skillId === id)?.label ?? id).join(", ") : "None"}</dd></div>
          </dl>
          <ul className="stack gap-8" style={{ margin: "16px 0 0", paddingLeft: 20 }}>{report.integrity.notes.map((n) => <li key={n} className="t-bm">{n}</li>)}</ul>
          <Link to="/how-it-works#scoring" className="row gap-4 t-bm" style={{ marginTop: 12, fontWeight: 500, minHeight: 44 }}>{t("debrief.howLink")}<Icon name="arrow_forward" className="sm" /></Link>
        </details>
        <div style={{ marginTop: 16 }}><Button variant="tonal" icon="ios_share" onClick={() => setShare(true)}>{t("debrief.share")}</Button></div>
      </section>

      <section className="stack gap-12" style={{ marginTop: 32 }} aria-label="Feedback"><FeedbackForm roleId={report.roleId} missionId={report.missionId} /></section>

      <div className="debrief-foot">
        <div className="row gap-8 wrap">
          {first && <Button icon="play_arrow" loading={busy === first.drillId} onClick={() => startDrill(first)}>{t("debrief.startRecommended")}</Button>}
          <LinkButton to={`/progress/${report.roleId}`} variant="outlined" icon="timeline">{t("debrief.seeProgress")}</LinkButton>
          <LinkButton to={roleHref} variant="text">{t("back.role")}</LinkButton>
        </div>
      </div>

      <Dialog open={share} onClose={() => setShare(false)} title={t("debrief.shareTitle")} icon="ios_share"
        actions={<><Button variant="text" onClick={() => setShare(false)}>{t("common.close")}</Button><Button icon="content_copy" onClick={async () => { await copyText(report.shareSummary); toast(t("common.copied")); setShare(false); }}>{t("common.copy")}</Button></>}>
        <blockquote className="quote good" style={{ margin: 0 }}>{report.shareSummary}</blockquote>
        <p className="t-bm t-secondary row gap-8" style={{ marginTop: 12 }}><Icon name="info" className="sm" />{t("debrief.shareNote")}</p>
      </Dialog>
      <TranscriptDrawer missionId={missionId} seq={transcript} open={transcript !== null} onClose={() => setTranscript(null)} />
    </div>
  );
}
