import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import "../roles/role.css";
import "../debrief/debrief.css";
import { api } from "../../api/client";
import type { Progress as P, RoleId, SkillProgress } from "../../contract";
import { useApp } from "../../app/store";
import { useT, errorText } from "../../lib/i18n";
import { useAsync, reportMap } from "../../lib/hooks";
import { formatDate } from "../../lib/time";
import { BackLink, Bar, Breadcrumbs, Button, Chip, EmptyState, ErrorState, Icon, LinkButton, Skeleton, IconTile } from "../../design/components";
import { RampTimeline } from "../roles/RoleDetail";
import { TranscriptDrawer } from "../common/TranscriptDrawer";

function Sparkline({ s }: { s: SkillProgress }) {
  const lang = useApp((x) => x.lang);
  const pts = s.history;
  if (pts.length === 0) return <span className="t-label t-secondary">—</span>;
  const w = 120, h = 32, max = Math.max(1, s.anchorsTotal);
  const xy = pts.map((p, i) => [pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * (w - 8) + 4, h - 4 - (p.anchorsMet / max) * (h - 8)] as const);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${s.label}: ${pts.map((p) => `${p.anchorsMet} of ${max} on ${formatDate(p.at, lang)}`).join(", ")}`}>
      <line x1="0" x2={w} y1={h - 4 - (s.target / max) * (h - 8)} y2={h - 4 - (s.target / max) * (h - 8)} stroke="var(--outline-strong)" strokeDasharray="3 3" />
      {pts.length > 1 && <polyline fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" points={xy.map((p) => p.join(",")).join(" ")} />}
      {xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="var(--primary)"><title>{`${formatDate(pts[i].at, lang)} · ${pts[i].kind} · ${pts[i].anchorsMet}/${max}`}</title></circle>)}
    </svg>
  );
}

export default function Progress() {
  const { roleId: param } = useParams();
  const t = useT();
  const nav = useNavigate();
  const lang = useApp((s) => s.lang);
  const toast = useApp((s) => s.toast);
  const ensure = useApp((s) => s.ensureSession);
  const me = useAsync(() => ensure(), []);
  const tried = me.data?.onboardings.map((o) => o.roleId) ?? [];
  const roleId = (param ?? tried[0]) as RoleId | undefined;
  const roles = useAsync(() => api.getRoles(), []);
  const prog = useAsync<P | null>(() => (roleId && tried.includes(roleId) ? api.getProgress(roleId) : Promise.resolve(null)), [roleId, tried.join(",")]);
  const [busy, setBusy] = useState<string | null>(null);
  const [ev, setEv] = useState<{ missionId: string; seq: number } | null>(null);

  const startMission = async (opts: { drillId?: string }) => {
    if (!roleId) return;
    setBusy(opts.drillId ?? "mission");
    try { const m = await api.createMission({ roleId, mode: "quick", ...opts }); nav(`/mission/${m.id}`); }
    catch (e) { toast(errorText(t, e)); } finally { setBusy(null); }
  };
  const roleTitle = (id?: string) => roles.data?.find((r) => r.id === id)?.title ?? id ?? "";
  const role = roles.data?.find((r) => r.id === roleId);

  if (me.error || prog.error) return <div className="container page"><BackLink to="/roles" label={t("back.roles")} /><ErrorState error={me.error ?? prog.error} retry={() => { me.reload(); prog.reload(); }} /></div>;
  const loading = me.loading || prog.loading;
  const p = prog.data;
  return (
    <div className="container page">
      <div className="page-head">
        <div className="back-row"><BackLink to="/roles" label={t("back.roles")} />{role && <Breadcrumbs items={[{ label: t("nav.roles"), to: "/roles" }, { label: role.title, to: `/roles/${role.id}` }, { label: t("nav.progress") }]} />}</div>
        <h1 className="t-hl page-title">{t("progress.title")}</h1>
        {tried.length > 1 && (
          <div className="row gap-8 wrap" role="group" aria-label={t("nav.roles")} style={{ marginTop: 8 }}>
            {tried.map((r) => <Link key={r} to={`/progress/${r}`} className="chip chip-btn" aria-pressed={r === roleId} style={{ textDecoration: "none" }}>{roleTitle(r)}</Link>)}
          </div>
        )}
      </div>

      {loading ? <div className="stack gap-16"><Skeleton h={120} r={16} /><Skeleton h={260} r={16} /><Skeleton h={200} r={16} /></div>
        : !p ? <EmptyState icon="route" title={t("progress.empty")} body={t("progress.emptyBody")} action={<LinkButton to={param ? `/roles/${param}` : "/roles"} icon="arrow_forward" iconRight>{t("common.browseRoles")}</LinkButton>} />
        : (
          <div className="stack gap-32">
            <section className="card" style={{ padding: 28 }} aria-labelledby="sum-h">
              <div className="row gap-16 wrap">
                {role && <IconTile icon={role.icon} color={role.accentHex} />}
                <div className="grow stack gap-4"><h2 id="sum-h" className="t-hm tnum">{t("progress.summary", { a: p.milestonesAchieved, b: p.milestonesTotal })}</h2><p className="t-bm t-secondary">{role?.title}</p></div>
                {p.streakDays > 0 && (
                  <div className="stack gap-4" style={{ alignItems: "flex-end" }}>
                    <span className="t-tm row gap-4"><Icon name="local_fire_department" style={{ color: "var(--warning)" }} />{t("progress.streak", { n: p.streakDays })}</span>
                    <span className="row gap-4" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 5, background: i >= 7 - Math.min(7, p.streakDays) ? "var(--warning)" : "var(--surface-variant)" }} />)}</span>
                  </div>
                )}
              </div>
              <div className="seg-bar" style={{ marginTop: 20 }} aria-hidden="true">{p.rampMap.map((r) => <span key={r.id} className={r.state === "achieved" ? "on" : r.state === "next" ? "next" : ""} />)}</div>
            </section>

            <div className="split" style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" }}>
              <section aria-labelledby="ramp-h">
                <h2 id="ramp-h" className="t-tl" style={{ marginBottom: 16 }}>Ramp Map</h2>
                <RampTimeline items={p.rampMap} onStart={(m) => startMission(m.coveredBy?.kind === "drill" ? { drillId: m.coveredBy.id } : {})} />
              </section>
              <section aria-labelledby="tv-h">
                <h2 id="tv-h" className="t-tl" style={{ marginBottom: 16 }}>{t("progress.targetVs")}</h2>
                <div className="stack gap-12">
                  {p.skills.map((s) => (
                    <div key={s.skillId} className="card" style={{ padding: 16 }}>
                      <div className="row gap-8 wrap"><h3 className="t-tm grow">{s.label}</h3><span className="row gap-4" aria-label={t("progress.variants", { n: s.freshVariantsDemonstrated })}>{[0, 1].map((i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 5, background: i < s.freshVariantsDemonstrated ? "var(--success)" : "var(--surface-variant)", border: "1px solid var(--outline)" }} />)}<span className="t-label t-secondary" style={{ marginLeft: 4 }}>{t("progress.variants", { n: s.freshVariantsDemonstrated })}</span></span></div>
                      <div className="bars" style={{ marginTop: 10 }}>
                        <span className="lbl">{t("debrief.youShowed")}</span><Bar value={s.latestAnchorsMet} max={s.anchorsTotal} marker={s.target} thin label={s.label} /><span className="val">{s.latestAnchorsMet}/{s.anchorsTotal}</span>
                        <span className="lbl">{t("debrief.youSaid")}</span>{s.selfRating ? <Bar value={s.selfRating - 1} max={4} thin color="var(--outline-strong)" /> : <span>—</span>}<span className="val">{s.selfRating ? `${s.selfRating}/5` : "—"}</span>
                        <span className="lbl">{t("progress.history")}</span><Sparkline s={s} /><span />
                      </div>
                    </div>
                  ))}
                  <p className="t-label t-secondary">{t("progress.mastery")}</p>
                </div>
              </section>
            </div>

            {p.nextBestDrill && (
              <section className="card tonal row gap-16 wrap" style={{ padding: 24 }} aria-labelledby="nd-h">
                <IconTile icon="fitness_center" color="#9334e6" />
                <div className="grow stack gap-4" style={{ minWidth: 220 }}><span className="t-label t-secondary" id="nd-h">{t("progress.nextDrill")}</span><h3 className="t-tm">{p.nextBestDrill.title}</h3><p className="t-bm t-secondary">{p.nextBestDrill.why}</p></div>
                <Button icon="play_arrow" loading={busy === p.nextBestDrill.drillId} onClick={() => startMission({ drillId: p.nextBestDrill!.drillId })}>{t("common.start")}</Button>
              </section>
            )}

            <section aria-labelledby="b-h">
              <h2 id="b-h" className="t-tl" style={{ marginBottom: 16 }}>{t("progress.badges")}</h2>
              {p.badges.length === 0 ? <p className="t-bm t-secondary card tonal">{t("progress.badgesEmpty")}</p> : (
                <div className="grid grid-3">
                  {p.badges.map((b) => (
                    <div key={b.id} className="card stack gap-8">
                      <div className="row gap-12"><span className="icon-tile sm" style={{ background: "var(--success-bg)", color: "var(--success)" }}><Icon name="workspace_premium" fill /></span><h3 className="t-tm">{b.title}</h3></div>
                      <p className="t-bm t-secondary">{b.description}</p>
                      <p className="t-label t-secondary">{t("progress.earned", { d: formatDate(b.earnedAt, lang) })}</p>
                      {b.evidenceSeq ? <div><Button variant="text" size="sm" icon="format_quote" onClick={() => setEv({ missionId: b.missionId, seq: b.evidenceSeq! })}>{t("progress.seeEvidence")}</Button></div> : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="a-h">
              <h2 id="a-h" className="t-tl" style={{ marginBottom: 16 }}>{t("progress.attempts")}</h2>
              <ul className="card" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {p.attempts.map((a, i) => (
                  <li key={a.missionId} className="row gap-12 wrap" style={{ padding: "14px 20px", borderTop: i ? "1px solid var(--outline)" : 0 }}>
                    <Icon name={a.kind === "drill" ? "fitness_center" : "work"} style={{ color: "var(--text-secondary)" }} />
                    <div className="grow stack" style={{ minWidth: 180 }}><span className="t-bm" style={{ fontWeight: 500 }}>{a.title}</span><span className="t-label t-secondary">{formatDate(a.at, lang)}</span></div>
                    <Chip tone={a.status === "done" ? "success" : a.status === "judging" ? "warning" : "primary"}>{a.status === "done" ? "Done" : a.status === "judging" ? "Judging" : t("common.inProgress")}</Chip>
                    {a.status === "active"
                      ? <LinkButton to={`/mission/${a.missionId}`} variant="tonal" size="sm" icon="play_arrow">{t("common.resume")}</LinkButton>
                      : <Button variant="outlined" size="sm" icon="radiology" onClick={() => { if (a.reportId) reportMap.set(a.missionId, a.reportId); nav(`/mission/${a.missionId}/debrief`); }}>{t("progress.openReport")}</Button>}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      {ev && <TranscriptDrawer missionId={ev.missionId} seq={ev.seq} open onClose={() => setEv(null)} />}
    </div>
  );
}
