import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import "./role.css";
import { api } from "../../api/client";
import type { RampMilestone, RoleDetail as RD } from "../../contract";
import { useAsync } from "../../lib/hooks";
import { useT, errorText } from "../../lib/i18n";
import { useApp } from "../../app/store";
import { Avatar, BackLink, Banner, Breadcrumbs, Button, Chip, ErrorState, Icon, IconTile, Skeleton, Tabs, TabPanel, SlowNote } from "../../design/components";

export function RampTimeline({ items, onStart }: { items: RampMilestone[]; onStart?: (m: RampMilestone) => void }) {
  const t = useT();
  return (
    <ol className="timeline">
      {items.map((m) => (
        <li key={m.id} className={m.state}>
          <span className="node" aria-hidden="true"><Icon name={m.state === "achieved" ? "check" : m.state === "next" ? "arrow_forward" : "more_horiz"} /></span>
          <div className="row gap-8 wrap">
            <Chip tone="tonal">{t("ramp.week", { n: m.typicalWeek })}</Chip>
            <Chip tone={m.state === "achieved" ? "success" : m.state === "next" ? "primary" : "planned"} icon={m.state === "achieved" ? "check_circle" : m.state === "next" ? "flag" : "schedule"}>{t(`ramp.${m.state}`)}</Chip>
          </div>
          <h3 className="t-tm" style={{ marginTop: 8 }}>{m.title}</h3>
          <p className="t-bm t-secondary">{m.description}</p>
          {m.state === "next" && onStart && m.coveredBy && <Button variant="tonal" size="sm" icon="play_arrow" style={{ marginTop: 10 }} onClick={() => onStart(m)}>{t("common.start")}</Button>}
        </li>
      ))}
    </ol>
  );
}

function DetailSkeleton() {
  return (
    <div className="stack gap-16" aria-busy="true">
      <div className="row gap-16"><Skeleton h={56} w={56} r={16} /><div className="grow stack gap-8"><Skeleton h={32} w="60%" /><Skeleton h={16} w="40%" /></div></div>
      <Skeleton h={48} /><Skeleton h={160} r={16} /><Skeleton h={160} r={16} />
    </div>
  );
}

export default function RoleDetail() {
  const { roleId = "" } = useParams();
  const t = useT();
  const nav = useNavigate();
  const me = useApp((s) => s.me);
  const lang = useApp((s) => s.lang);
  const toast = useApp((s) => s.toast);
  const ensure = useApp((s) => s.ensureSession);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  const role = useAsync(() => api.getRole(roleId), [roleId, me?.userId]);
  const onboarded = !!me?.onboardings.some((o) => o.roleId === roleId);
  const progress = useAsync(() => (onboarded ? api.getProgress(roleId as RD["id"]) : Promise.resolve(null)), [roleId, onboarded]);
  const active = useMemo(() => progress.data?.attempts.find((a) => a.status === "active" && a.kind === "mission"), [progress.data]);
  useEffect(() => { setErr(undefined); }, [roleId]);

  const start = async (opts: { drillId?: string } = {}) => {
    setBusy(true); setErr(undefined);
    try {
      const u = await ensure();
      if (!u.consent?.age18 || !u.consent.storeWork || !u.onboardings.some((o) => o.roleId === roleId)) { nav(`/onboarding/${roleId}`); return; }
      const m = await api.createMission({ roleId: roleId as RD["id"], mode: "quick", ...opts });
      nav(`/mission/${m.id}`);
    } catch (e) { setErr(e); toast(errorText(t, e)); } finally { setBusy(false); }
  };

  if (role.error) return <div className="container page"><BackLink to="/roles" label={t("back.roles")} /><ErrorState error={role.error} retry={role.reload} /></div>;
  const r = role.data;
  const ready = r?.status === "ready";
  return (
    <div className="container page">
      <div className="page-head">
        <div className="back-row"><BackLink to="/roles" label={t("back.roles")} />{r && <Breadcrumbs items={[{ label: t("nav.roles"), to: "/roles" }, { label: r.title }]} />}</div>
      </div>
      {!r ? <><DetailSkeleton /><SlowNote active={role.loading} /></> : (
        <div className="role-layout">
          <div className="stack gap-24" style={{ minWidth: 0 }}>
            <div className="role-hero">
              <IconTile icon={r.icon} color={r.accentHex} />
              <div className="grow stack gap-4" style={{ minWidth: 220 }}>
                <h1 className="t-hl page-title">{r.title}</h1>
                <p className="t-bm t-secondary">{r.company}</p>
                <p className="t-bl" style={{ marginTop: 4 }}>{r.tagline}</p>
              </div>
            </div>
            {r.safetyNote && <Banner kind="warning" icon="health_and_safety">{r.safetyNote}</Banner>}
            {lang !== "en" && <Banner kind="info" icon="translate">{t("role.englishOnly")}</Banner>}
            <div>
              <Tabs idPrefix="role" label={r.title} value={tab} onChange={setTab} tabs={[
                { id: "overview", label: t("role.tabs.overview") }, { id: "skills", label: t("role.tabs.skills") },
                { id: "team", label: t("role.tabs.team") }, { id: "ramp", label: t("role.tabs.ramp") },
              ]} />
              <div style={{ paddingTop: 24 }}>
                {tab === "overview" && (
                  <TabPanel idPrefix="role" id="overview" className="stack gap-24">
                    <p className="t-bl measure">{r.description}</p>
                    <div>
                      <h2 className="t-tm">{t("role.practise")}</h2>
                      <ul className="stack gap-8" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
                        {r.whatYouWillPractise.map((w) => <li key={w} className="row gap-12" style={{ alignItems: "flex-start" }}><Icon name="check_circle" style={{ color: "var(--success)" }} /><span className="t-bl">{w}</span></li>)}
                      </ul>
                    </div>
                    <div>
                      <h2 className="t-tm">{t("role.missions")}</h2>
                      <div className="stack gap-12" style={{ marginTop: 12 }}>
                        {r.missions.map((m) => (
                          <div key={m.id} className="card">
                            <div className="row gap-8 wrap"><h3 className="t-tm grow">{m.title}</h3><Chip icon="schedule">{t("common.minutes", { n: m.estMinutes })}</Chip></div>
                            <p className="t-bm t-secondary" style={{ marginTop: 6 }}>{m.description}</p>
                            <div className="row gap-8 wrap" style={{ marginTop: 12 }}>{m.skillIds.map((s) => <Chip key={s} tone="tonal">{r.skills.find((k) => k.id === s)?.label ?? s}</Chip>)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabPanel>
                )}
                {tab === "skills" && (
                  <TabPanel idPrefix="role" id="skills" className="stack gap-12">
                    {r.skills.map((s, i) => (
                      <details key={s.id} className="card accordion skill-card" open={i === 0}>
                        <summary><span className="stack gap-4"><span className="t-tm">{s.label}</span><span className="t-bm t-secondary" style={{ fontWeight: 400 }}>{s.description}</span></span><Icon name="expand_more" className="chev" /></summary>
                        <h3 className="t-label t-secondary" style={{ marginTop: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("role.lookFor")}</h3>
                        <ul>{s.anchors.map((a) => <li key={a} className="t-bm">{a}</li>)}</ul>
                        <p className="t-label t-secondary" style={{ marginTop: 8 }}>{t("role.target", { n: s.targetLevel })}</p>
                      </details>
                    ))}
                  </TabPanel>
                )}
                {tab === "team" && (
                  <TabPanel idPrefix="role" id="team" className="grid grid-2">
                    {r.cast.map((p, i) => (
                      <div key={p.id} className="card cast-card">
                        <Avatar name={p.name} hue={(i * 83 + 200) % 360} size="lg" />
                        <div className="stack gap-4 grow">
                          <h3 className="t-tm">{p.name}</h3>
                          <p className="t-bm t-secondary">{p.title}</p>
                          <p className="t-bm" style={{ marginTop: 4 }}>{p.blurb}</p>
                          {p.modelLabel && <div style={{ marginTop: 8 }}><Chip tone="primary" icon="auto_awesome">{p.modelLabel}</Chip></div>}
                        </div>
                      </div>
                    ))}
                  </TabPanel>
                )}
                {tab === "ramp" && (
                  <TabPanel idPrefix="role" id="ramp">
                    <RampTimeline items={r.rampMap} onStart={(m) => (m.coveredBy?.kind === "drill" ? start({ drillId: m.coveredBy.id }) : start())} />
                  </TabPanel>
                )}
              </div>
            </div>
          </div>

          <aside className="card start-panel" aria-label={t("role.start")}>
            <div className="stack gap-12 mode-group" role="radiogroup" aria-label={t("role.mode")}>
              <h2 className="t-tm">{t("role.mode")}</h2>
              <div className="mode-opt selected" role="radio" aria-checked="true" tabIndex={-1}><Icon name="radio_button_checked" style={{ color: "var(--primary)" }} /><span className="grow t-bm" style={{ fontWeight: 500 }}>{t("role.quick", { n: r.estMinutes })}</span></div>
              <div className="mode-opt disabled" role="radio" aria-checked="false" aria-disabled="true"><Icon name="radio_button_unchecked" /><span className="grow t-bm">{t("role.full")}</span><Chip tone="planned">{t("common.planned")}</Chip></div>
            </div>
            <div className="stack gap-8" style={{ marginTop: 16 }}>
              {!ready ? <Button block disabledReason={t("common.planned")}>{t("role.start")}</Button>
                : active ? (
                  <>
                    <Button block size="lg" icon="play_arrow" onClick={() => nav(`/mission/${active.missionId}`)}>{t("role.resume")}</Button>
                    <Button block variant="text" loading={busy} onClick={() => start()}>{t("role.startNew")}</Button>
                  </>
                ) : <Button block size="lg" icon="play_arrow" loading={busy} onClick={() => start()}>{t("role.start")}</Button>}
              {err !== undefined && <p className="t-bm" role="alert" style={{ color: "var(--error)" }}>{errorText(t, err)}</p>}
            </div>
            <p className="t-label t-secondary row gap-8 panel-extra" style={{ marginTop: 16 }}><Icon name="lock" className="xs" />{t("role.privateNote")}</p>
          </aside>
        </div>
      )}
    </div>
  );
}
