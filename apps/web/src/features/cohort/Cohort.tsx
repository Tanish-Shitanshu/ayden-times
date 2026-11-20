import { useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../../api/client";
import type { Cohort as C, CohortInsights } from "../../contract";
import { useApp } from "../../app/store";
import { useT, errorText } from "../../lib/i18n";
import { useAsync, copyText } from "../../lib/hooks";
import { BackLink, Banner, Bar, Button, Chip, Dialog, EmptyState, ErrorState, Icon, Skeleton, Tabs, TabPanel, TextField } from "../../design/components";
import { JoinSuccess } from "./Join";

export function joinLink(code: string) {
  const base = import.meta.env.VITE_ROUTER === "hash" ? `${location.origin}${location.pathname}#` : location.origin;
  return `${base}/join/${code}`;
}

function Insights({ c }: { c: C }) {
  const t = useT();
  const ins = useAsync<CohortInsights>(() => api.getInsights(c.id), [c.id]);
  if (ins.error) return <ErrorState error={ins.error} retry={ins.reload} />;
  if (!ins.data) return <div className="stack gap-12"><Skeleton h={80} r={16} /><Skeleton h={200} r={16} /></div>;
  const d = ins.data;
  return (
    <div className="stack gap-24">
      <div className="row gap-8 wrap"><h3 className="t-tl grow">{t("cohort.insights")}</h3><Chip tone={d.dataSource === "live" ? "success" : "warning"} icon={d.dataSource === "live" ? "sensors" : "science"}>{d.dataSource === "live" ? t("cohort.live") : t("cohort.seeded")}</Chip></div>
      <div className="grid grid-3">
        {([["group", "members"], ["play_circle", "started"], ["task_alt", "completed"]] as const).map(([ic, k]) => (
          <div key={k} className="card tonal"><Icon name={ic} style={{ color: "var(--primary)" }} /><p className="t-hm tnum" style={{ marginTop: 8 }}>{d.participation[k]}</p><p className="t-bm t-secondary" style={{ textTransform: "capitalize" }}>{k}</p></div>
        ))}
      </div>
      {d.suppressed ? (
        <EmptyState icon="visibility_lock" title={t("cohort.suppressed")} body={`k ≥ ${d.minGroupSize}`} />
      ) : (
        <>
          <div>
            <h4 className="t-tm" style={{ marginBottom: 12 }}>Skill patterns</h4>
            <ul className="stack gap-12" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {d.skillPatterns.map((s) => (
                <li key={s.roleId + s.skillId} className="stack gap-4">
                  <span className="t-bm"><b className="tnum">{s.pctAtTarget}%</b> showed “{s.label.toLowerCase()}” at target <span className="t-secondary tnum">(n={s.n})</span></span>
                  <Bar value={s.pctAtTarget} label={s.label} />
                </li>
              ))}
            </ul>
          </div>
          {d.trapPatterns.length > 0 && (
            <div>
              <h4 className="t-tm" style={{ marginBottom: 12 }}>Common traps</h4>
              <ul className="stack gap-12" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {d.trapPatterns.map((tp) => <li key={tp.trapId} className="stack gap-4"><span className="t-bm"><b className="tnum">{tp.pctMissed}%</b> {tp.label.toLowerCase()} <span className="t-secondary tnum">(n={tp.n})</span></span><Bar value={tp.pctMissed} color="var(--warning)" label={tp.label} /></li>)}
              </ul>
            </div>
          )}
        </>
      )}
      <Banner kind="info" icon="shield_person">{d.note}</Banner>
    </div>
  );
}

export default function Cohort() {
  const t = useT();
  const toast = useApp((s) => s.toast);
  const ensure = useApp((s) => s.ensureSession);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "join" ? "join" : "lead";
  const list = useAsync(async () => { await ensure(); return api.listCohorts(); }, []);
  const [sel, setSel] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");
  const [joined, setJoined] = useState<C | null>(null);
  const [joinErr, setJoinErr] = useState("");
  const owned = list.data?.filter((c) => c.role === "owner") ?? [];
  const selected = owned.find((c) => c.id === sel) ?? owned[0];

  const create = async () => {
    setBusy(true); setErr("");
    try { const c = await api.createCohort({ name: name.trim() }); setCreateOpen(false); setName(""); list.setData([...(list.data ?? []), c]); setSel(c.id); toast(c.name); }
    catch (e) { setErr(errorText(t, e)); } finally { setBusy(false); }
  };
  const join = async () => {
    setBusy(true); setJoinErr("");
    try { setJoined(await api.joinCohort({ code: code.trim() })); list.reload(); }
    catch (e) { setJoinErr(errorText(t, e)); } finally { setBusy(false); }
  };
  const copy = async (s: string) => { await copyText(s); toast(t("common.copied")); };

  return (
    <div className="container page">
      <div className="page-head">
        <div className="back-row"><BackLink to="/" label={t("back.home")} /></div>
        <h1 className="t-hl page-title">{t("cohort.title")}</h1>
        <p className="t-bl t-secondary measure">{t("cohort.sub")}</p>
      </div>
      <Tabs idPrefix="co" label={t("cohort.title")} value={tab} onChange={(v) => setParams(v === "join" ? { tab: "join" } : {})} tabs={[{ id: "lead", label: t("cohort.lead"), icon: "school" }, { id: "join", label: t("cohort.join"), icon: "group_add" }]} />
      <div style={{ paddingTop: 24 }}>
        {tab === "lead" ? (
          <TabPanel idPrefix="co" id="lead">
            {list.error ? <ErrorState error={list.error} retry={list.reload} /> : !list.data ? <Skeleton h={160} r={16} /> : (
              <div className="stack gap-24">
                <div><Button icon="add" onClick={() => { setErr(""); setCreateOpen(true); }}>{t("cohort.create")}</Button></div>
                {owned.length === 0 ? <EmptyState icon="groups" title={t("cohort.none")} /> : (
                  <div className="role-layout" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", paddingBottom: 0 }}>
                    <div className="stack gap-12">
                      {owned.map((c) => (
                        <div key={c.id} className="card" style={c.id === selected?.id ? { borderColor: "var(--primary)", boxShadow: "0 0 0 1px var(--primary)" } : undefined}>
                          <button type="button" className="row gap-8" onClick={() => setSel(c.id)} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", width: "100%", textAlign: "left", color: "inherit", minHeight: 44 }} aria-pressed={c.id === selected?.id}>
                            <Icon name="groups" style={{ color: "var(--primary)" }} /><span className="t-tm grow">{c.name}</span><Chip tone="tonal">{t("cohort.members", { n: c.memberCount })}</Chip>
                          </button>
                          <div className="row gap-8 wrap" style={{ marginTop: 12 }}>
                            <span className="chip mono" style={{ fontSize: 14, height: 32 }} aria-label={`${t("cohort.code")}: ${c.code}`}>{c.code}</span>
                            <Button variant="text" size="sm" icon="content_copy" onClick={() => copy(c.code)}>{t("cohort.copyCode")}</Button>
                            <Button variant="text" size="sm" icon="link" onClick={() => copy(joinLink(c.code))}>{t("cohort.copyLink")}</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {selected && <div className="card" style={{ padding: 24 }}><Insights key={selected.id} c={selected} /></div>}
                  </div>
                )}
              </div>
            )}
          </TabPanel>
        ) : (
          <TabPanel idPrefix="co" id="join">
            {joined ? <JoinSuccess c={joined} /> : (
              <form className="card stack gap-16" style={{ maxWidth: 520, padding: 28 }} onSubmit={(e) => { e.preventDefault(); join(); }}>
                <TextField label={t("cohort.code")} value={code} onChange={(v) => setCode(v.toUpperCase())} error={joinErr || undefined} helper="SNU-7K2" maxLength={16} onSurface mono />
                <div><Button type="submit" icon="login" loading={busy} disabledReason={!code.trim() ? t("cohort.code") : false} onClick={join}>{t("cohort.joinBtn")}</Button></div>
              </form>
            )}
          </TabPanel>
        )}
      </div>
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t("cohort.create")} icon="group_add"
        actions={<><Button variant="text" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button><Button loading={busy} onClick={create}>{t("cohort.create")}</Button></>}>
        <TextField label={t("cohort.name")} value={name} onChange={setName} error={err || undefined} maxLength={60} onSurface autoFocus onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
      </Dialog>
    </div>
  );
}
