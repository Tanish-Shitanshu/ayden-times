import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import "./workspace.css";
import { api, drillOf } from "../../api/client";
import type { MissionEvent, MissionState, Person, WorkItem } from "../../contract";
import { useApp } from "../../app/store";
import { useT, errorText } from "../../lib/i18n";
import { useAsync, useMedia, copyText, reportMap } from "../../lib/hooks";
import { simLabel } from "../../lib/time";
import { type MenuItem, Avatar, Banner, Button, Chip, ConfirmDialog, Dialog, ErrorState, Icon, IconButton, MenuButton, PendingDots, Popover, Skeleton, Tooltip, LogoGlyph, LinkButton } from "../../design/components";
import { useMission, type UiEvent } from "./useMission";
import { EventView, threadOf } from "./EventView";
import { WorkPanel, ITEM_ICON } from "./WorkPanel";
import { TraceDrawer } from "./TraceDrawer";

type Pane = "chat" | "work" | "team";
interface UiPersist { thread?: string; centerTab?: "chat" | "email"; workTab?: string; itemId?: string; artifactId?: string; lastSeen?: Record<string, number>; scroll?: number; pinned?: boolean }
const uiKey = (id: string) => `ayden_ws_${id}`;
const loadUi = (id: string): UiPersist => { try { return JSON.parse(sessionStorage.getItem(uiKey(id)) ?? "{}") as UiPersist; } catch { return {}; } };
const saveUi = (id: string, v: UiPersist) => { try { sessionStorage.setItem(uiKey(id), JSON.stringify(v)); } catch { /* blocked */ } };

function threadKey(e: UiEvent): string | null {
  if (e.kind !== "message") return null;
  if (e.from !== "you" && e.from !== "system" && !e.to) return "team";
  return threadOf(e);
}

function useDark() {
  return false;
}

/* ───────────────────────── top bar ───────────────────────── */

function BeatDots({ m }: { m: MissionState }) {
  return (
    <div className="beat" aria-label={m.beat.title}>
      <div className="beat-dots" aria-hidden="true">{Array.from({ length: m.beat.total }, (_, i) => <span key={i} className={i < m.beat.index ? "done" : i === m.beat.index ? "on" : ""} />)}</div>
      <span className="beat-title">{m.beat.title}</span>
    </div>
  );
}

function Clock({ m }: { m: MissionState }) {
  const t = useT();
  return (
    <Tooltip text={t("ws.clockTip")} below>
      <span className="clock" tabIndex={0} aria-label={`${m.clock.label}. ${t("ws.clockTip")}`}>
        <Icon name="schedule" className="sm" /><span className="tnum">{m.clock.label}</span>
        <span className="clock-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (m.clock.minute / Math.max(1, m.clock.minutesTotal)) * 100)}%` }} /></span>
      </span>
    </Tooltip>
  );
}

function ObjectivesBody({ m, onArtifact }: { m: MissionState; onArtifact: (id: string) => void }) {
  const t = useT();
  return (
    <div className="stack gap-12">
      <div><p className="t-label t-secondary">{m.beat.title}</p><p className="t-bl" style={{ marginTop: 4 }}>{m.beat.objective}</p></div>
      {m.artifacts.length > 0 && (
        <ul className="obj-list">
          {m.artifacts.map((a) => (
            <li key={a.id}><button type="button" className="obj-item" onClick={() => onArtifact(a.id)}>
              <Icon name={a.submitted ? "check_circle" : "radio_button_unchecked"} fill={a.submitted} style={{ color: a.submitted ? "var(--success)" : "var(--text-secondary)" }} />
              <span className="grow">{a.title}</span>{a.required && !a.submitted && <span className="t-label t-secondary">{t("onb.required")}</span>}
            </button></li>
          ))}
        </ul>
      )}
      {m.beat.hint && <Banner kind="info" icon="tips_and_updates"><b>{t("ws.hint")}:</b> {m.beat.hint}</Banner>}
    </div>
  );
}

/* ───────────────────────── main ───────────────────────── */

export default function Workspace() {
  const { missionId = "" } = useParams();
  const t = useT();
  const nav = useNavigate();
  const toast = useApp((s) => s.toast);
  const dark = useDark();
  const desktop = useMedia("(min-width: 900px)");
  const M = useMission(missionId);
  const m = M.mission;
  const role = useAsync(() => (m ? api.getRole(m.roleId) : Promise.resolve(null)), [m?.roleId]);

  const persisted = useRef<UiPersist>(loadUi(missionId));
  const [thread, setThread] = useState<string | null>(persisted.current.thread ?? null);
  const [centerTab, setCenterTab] = useState<"chat" | "email">(persisted.current.centerTab ?? "chat");
  const [workTab, setWorkTab] = useState(persisted.current.workTab ?? "items");
  const [itemId, setItemId] = useState<string | null>(persisted.current.itemId ?? null);
  const [artifactId, setArtifactId] = useState<string | null>(persisted.current.artifactId ?? null);
  const [lastSeen, setLastSeen] = useState<Record<string, number>>(persisted.current.lastSeen ?? {});
  const [pane, setPane] = useState<Pane>("chat");
  const [gotoLine, setGotoLine] = useState<{ line: number; token: number } | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [pinned, setPinned] = useState(!!persisted.current.pinned);
  const [objOpen, setObjOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [variantOpen, setVariantOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [mobileObj, setMobileObj] = useState(false);
  const [judging, setJudging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [checksRunning, setChecksRunning] = useState(false);
  const checksMark = useRef(0);
  const runChecksFn = useRef<() => void>(() => undefined);
  const objBtn = useRef<HTMLDivElement>(null);
  // Items the server changed mid-mission (delta.changedItems), e.g. a patient record with new observations.
  const [updated, setUpdated] = useState<Set<string>>(new Set());
  const itemSnap = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!m) return;
    const next = new Map(m.items.filter((i) => i.type !== "file").map((i) => [i.id, JSON.stringify(i)]));
    if (itemSnap.current) {
      const changed = [...next].filter(([id, v]) => itemSnap.current!.has(id) && itemSnap.current!.get(id) !== v).map(([id]) => id);
      const added = [...next.keys()].filter((id) => !itemSnap.current!.has(id));
      if (changed.length || added.length) setUpdated((u) => new Set([...u, ...changed, ...added]));
    }
    itemSnap.current = next;
  }, [m]);

  // redirect finished missions to the report
  useEffect(() => {
    if (m && (m.status === "done" || m.status === "judging")) nav(`/mission/${m.id}/debrief`, { replace: true });
  }, [m, nav]);

  // defaults once loaded
  useEffect(() => {
    if (!m) return;
    if (!thread) {
      const first = M.events.find((e) => e.kind === "message" && e.from !== "you");
      setThread((first && threadKey(first)) || m.people[0]?.id || null);
    }
    if (!itemId && m.items[0]) setItemId(m.items[0].id);
    if (!artifactId && m.artifacts[0]) setArtifactId(m.artifacts[0].id);
  }, [m, M.events, thread, itemId, artifactId]);

  useEffect(() => { saveUi(missionId, { ...loadUi(missionId), thread: thread ?? undefined, centerTab, workTab, itemId: itemId ?? undefined, artifactId: artifactId ?? undefined, lastSeen, pinned }); }, [missionId, thread, centerTab, workTab, itemId, artifactId, lastSeen, pinned]);

  const hasEmail = M.events.some((e) => e.channel === "email");
  const hasTeam = M.events.some((e) => threadKey(e) === "team");
  const people = m?.people ?? [];
  const personOf = useCallback((id: string | null) => people.find((p) => p.id === id), [people]);

  // mark thread seen
  useEffect(() => {
    if (!thread) return;
    const max = M.events.filter((e) => threadKey(e) === thread).reduce((a, e) => Math.max(a, e.seq), 0);
    if (max > (lastSeen[thread] ?? 0)) setLastSeen((s) => ({ ...s, [thread]: max }));
  }, [M.events, thread, lastSeen]);
  const unread = (id: string) => M.events.some((e) => threadKey(e) === id && e.from !== "you" && e.seq > (lastSeen[id] ?? 0)) && id !== thread;

  // checks finished?
  useEffect(() => {
    if (!checksRunning) return;
    if (M.events.some((e) => e.kind === "check_result" && e.seq > checksMark.current)) setChecksRunning(false);
  }, [M.events, checksRunning]);
  const setRunning = (v: boolean) => { if (v) checksMark.current = M.events.reduce((a, e) => Math.max(a, e.seq), 0); setChecksRunning(v); };

  const openItem = useCallback((id: string) => {
    setItemId(id); setWorkTab("items"); setPane("work");
    setUpdated((u) => { if (!u.has(id)) return u; const n = new Set(u); n.delete(id); return n; });
  }, []);
  // Log open_item for an item the learner can actually see (desktop: always visible; mobile: once the Work pane shows it).
  const loggedOpen = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!m || m.status !== "active" || !itemId || workTab !== "items") return;
    if (!desktop && pane !== "work") return;
    if (loggedOpen.current.has(itemId)) return;
    loggedOpen.current.add(itemId);
    M.act({ kind: "open_item", itemId }).catch(() => undefined);
  }, [m, itemId, workTab, pane, desktop, M]);

  const openFileAt = (path: string, line: number) => {
    const f = m?.items.find((i) => i.type === "file" && i.path === path);
    if (!f) { toast(t("err.not_found")); return; }
    openItem(f.id);
    setGotoLine({ line, token: Date.now() });
  };
  const openArtifact = (id: string) => { setArtifactId(id); setWorkTab("write"); setPane("work"); setObjOpen(false); setMobileObj(false); };

  // keyboard shortcuts
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable;
      if (e.altKey && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        if (e.key === "1") { setPane("chat"); setCenterTab("chat"); requestAnimationFrame(() => document.getElementById("composer")?.focus()); }
        if (e.key === "2") { setPane("work"); setWorkTab("items"); requestAnimationFrame(() => document.getElementById("work-panel")?.focus()); }
        if (e.key === "3") { setPane("work"); setWorkTab("checks"); requestAnimationFrame(() => document.getElementById("work-panel")?.focus()); }
      } else if (e.key === "?" && !typing) { e.preventDefault(); setKeysOpen(true); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  if (M.error) {
    return (
      <div className="container page">
        <LinkButton to="/roles" variant="text" icon="arrow_back">{t("back.roles")}</LinkButton>
        <ErrorState error={M.error} retry={M.reload} extra={<LinkButton to="/progress" variant="outlined">{t("nav.progress")}</LinkButton>} />
      </div>
    );
  }
  if (!m || M.loading) return <WorkspaceSkeleton />;

  const active = m.status === "active";
  const noLearnerYet = !M.events.some((e) => e.from === "you");
  const variantOk = m.beat.index === 0 && noLearnerYet && active;
  const roleTitle = role.data?.title ?? "";
  const exitTo = `/roles/${m.roleId}`;

  const doAdvance = async () => {
    setBusy("advance");
    try { await M.act({ kind: "advance" }); } catch (e) { toast(errorText(t, e)); } finally { setBusy(null); }
  };
  const doFinish = async () => {
    setBusy("finish");
    try {
      const r = await api.finishMission(m.id);
      reportMap.set(m.id, r.reportId);
      setFinishOpen(false);
      setJudging(true);
      nav(`/mission/${m.id}/debrief`, { replace: true, state: { reportId: r.reportId } });
    } catch (e) { toast(errorText(t, e)); setBusy(null); }
  };
  const doVariant = async () => {
    setBusy("variant");
    try {
      const drillId = m.kind === "drill" ? drillOf.get(m.id) : null;
      const n = await api.createMission({ roleId: m.roleId, mode: "quick", reseed: true, ...(drillId ? { drillId } : { missionId: m.missionId }) });
      setVariantOpen(false);
      nav(`/mission/${n.id}`, { replace: true });
    } catch (e) { toast(errorText(t, e)); } finally { setBusy(null); }
  };

  const menuItems: MenuItem[] = [
    ...(!desktop ? [
      { id: "obj", label: t("ws.objectives"), icon: "checklist", onSelect: () => setMobileObj(true) },
      { id: "trace", label: t("ws.trace"), icon: "account_tree", onSelect: () => setTraceOpen(true) },
    ] : []),
    { id: "variant", label: t("ws.newVariant"), icon: "shuffle", sub: m.variantLabel, disabled: variantOk ? false : t("ws.newVariantOff"), onSelect: () => setVariantOpen(true) },
    { id: "report", label: t("ws.report"), icon: "flag", onSelect: () => setReportOpen(true) },
    { id: "keys", label: t("ws.shortcuts"), icon: "keyboard", onSelect: () => setKeysOpen(true) },
    ...(!desktop ? [{ id: "exit", label: t("ws.exit"), icon: "close", onSelect: () => setExitOpen(true) }] : []),
  ];

  const rail = (
    <nav className="rail" aria-label={t("ws.team")}>
      <h2 className="rail-h">{t("ws.people")}</h2>
      <ul className="rail-list">
        {people.map((p) => (
          <li key={p.id}>
            <button type="button" className={`rail-item ${thread === p.id && centerTab === "chat" ? "active" : ""}`} aria-current={thread === p.id ? "true" : undefined} onClick={() => { setThread(p.id); setCenterTab("chat"); setPane("chat"); }} title={p.modelLabel ? `${p.name} · ${p.modelLabel}` : p.name}>
              <Avatar name={p.name} hue={p.avatarHue} size="sm" presence={p.presence} />
              <span className="rail-text"><span className="rail-name">{p.name}{p.kind === "agent" && <span className="ai-tag">{t("ws.ai")}</span>}</span><span className="rail-sub">{p.title}</span></span>
              {unread(p.id) && <span className="unread-dot" aria-label="unread" />}
            </button>
          </li>
        ))}
      </ul>
      {hasTeam && (
        <>
          <h2 className="rail-h">{t("ws.channels")}</h2>
          <ul className="rail-list"><li><button type="button" className={`rail-item ${thread === "team" ? "active" : ""}`} onClick={() => { setThread("team"); setCenterTab("chat"); setPane("chat"); }}><span className="rail-icon"><Icon name="tag" /></span><span className="rail-text"><span className="rail-name">{t("ws.teamChat")}</span></span>{unread("team") && <span className="unread-dot" />}</button></li></ul>
        </>
      )}
      <h2 className="rail-h">{t("ws.items")}</h2>
      <ul className="rail-list">
        {m.items.map((i: WorkItem) => (
          <li key={i.id}><button type="button" className={`rail-item ${itemId === i.id && workTab === "items" ? "active-soft" : ""}`} onClick={() => openItem(i.id)} title={i.title}>
            <span className="rail-icon"><Icon name={ITEM_ICON[i.type]} /></span><span className="rail-text"><span className="rail-name">{i.title}</span>{updated.has(i.id) && <span className="rail-sub" style={{ color: "var(--primary)" }}>{t("ws.updated")}</span>}</span>{updated.has(i.id) && <span className="unread-dot" aria-hidden="true" />}
          </button></li>
        ))}
      </ul>
      {m.artifacts.length > 0 && (
        <>
          <h2 className="rail-h">{t("ws.required")}</h2>
          <ul className="rail-list">
            {m.artifacts.map((a) => (
              <li key={a.id}><button type="button" className="rail-item" onClick={() => openArtifact(a.id)} title={a.title}>
                <span className="rail-icon"><Icon name={a.submitted ? "check_circle" : "radio_button_unchecked"} fill={a.submitted} style={{ color: a.submitted ? "var(--success)" : undefined }} /></span>
                <span className="rail-text"><span className="rail-name">{a.title}</span></span>
              </button></li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );

  return (
    <div className={`ws ${pinned && traceOpen && desktop ? "ws-pinned" : ""}`} data-pane={pane}>
      <a className="skip-link" href="#composer">{t("skip")}</a>
      <header className="ws-top">
        {desktop
          ? <Button variant="text" icon="close" onClick={() => setExitOpen(true)} className="ws-exit">{t("ws.exit")}</Button>
          : <IconButton icon="close" label={t("ws.exit")} onClick={() => setExitOpen(true)} />}
        <div className="ws-title">
          <h1 className="t-tm ws-h1">{m.title}</h1>
          <div className="row gap-8 ws-sub">
            <span className="t-label t-secondary">{m.company}</span>
            {roleTitle && desktop && <Chip tone="primary">{roleTitle}</Chip>}
            {m.kind === "drill" && <Chip tone="purple" icon="fitness_center">Drill</Chip>}
          </div>
        </div>
        <span className="spacer" />
        <BeatDots m={m} />
        <Clock m={m} />
        {desktop && (
          <>
            <div ref={objBtn} style={{ position: "relative" }}>
              <Button variant="outlined" size="sm" icon="checklist" aria-expanded={objOpen} onClick={() => setObjOpen((o) => !o)}>{t("ws.objectives")}</Button>
              <Popover open={objOpen} onClose={() => setObjOpen(false)} anchorRef={objBtn} label={t("ws.objectives")}>
                <ObjectivesBody m={m} onArtifact={openArtifact} />
              </Popover>
            </div>
            <Button variant={traceOpen ? "tonal" : "outlined"} size="sm" icon="account_tree" aria-pressed={traceOpen} onClick={() => setTraceOpen((o) => !o)}>{t("ws.trace")} <span className="tnum trace-count">{M.trace.length}</span></Button>
          </>
        )}
        <MenuButton label={t("ws.more")} items={menuItems} trigger={(p) => <button type="button" className="icon-btn" aria-label={t("ws.more")} title={t("ws.more")} {...p}><Icon name="more_vert" /></button>} />
      </header>
      {m.runtime.mode !== "live" && <div className="ws-banner"><Banner kind="warning" icon="cloud_off"><span title={m.runtime.fallbackReason}>{t("fallback.banner")} {t("fallback.tags")}</span></Banner></div>}
      {!desktop && <button type="button" className="obj-fab" onClick={() => setMobileObj(true)}><Icon name="checklist" className="sm" />{t("ws.objectives")} · {m.beat.index + 1}/{m.beat.total}</button>}

      <div className="ws-grid">
        <aside className="ws-rail">{rail}</aside>
        <section className="ws-center" aria-label={t("ws.chat")}>
          <Conversation m={m} M={M} thread={thread} centerTab={centerTab} setCenterTab={setCenterTab} hasEmail={hasEmail} personOf={personOf}
            openFileAt={openFileAt} openChecks={() => { setWorkTab("checks"); setPane("work"); }} openItem={openItem} />
          <div className="progress-bar-sticky">
            <div className="row gap-8 wrap" style={{ justifyContent: "flex-end" }}>
              <span className="t-label t-secondary grow prog-help" aria-live="polite">{!m.canAdvance && !m.canFinish && active ? (m.beat.index < m.beat.total - 1 ? `${t("ws.continue")}: ${m.beat.objective}` : t("ws.finishOff")) : ""}</span>
              {m.beat.index < m.beat.total - 1 && <Button variant="tonal" icon="skip_next" loading={busy === "advance"} disabledReason={!m.canAdvance ? m.beat.objective : false} onClick={doAdvance}>{t("ws.continue")}</Button>}
              <Button icon="assignment_turned_in" disabledReason={!m.canFinish ? t("ws.finishOff") : false} onClick={() => setFinishOpen(true)}>{t("ws.finish")}</Button>
            </div>
          </div>
        </section>
        <section className="ws-work" aria-label={t("ws.work")}>
          <WorkPanel mission={m} events={M.events} tab={workTab} setTab={setWorkTab} itemId={itemId} setItemId={(id) => openItem(id)} artifactId={artifactId} setArtifactId={setArtifactId}
            gotoLine={gotoLine} act={M.act} dark={dark} checksRunning={checksRunning} setChecksRunning={setRunning} registerRunChecks={(fn) => { runChecksFn.current = fn; }} updated={updated} />
        </section>
        <section className="ws-team-pane" aria-label={t("ws.team")}>{rail}</section>
      </div>

      {!desktop && (
        <nav className="bottom-nav" aria-label="Workspace">
          {([["chat", "forum", t("ws.chat")], ["work", "folder_open", t("ws.work")], ["checks", "fact_check", t("ws.checks")], ["team", "group", t("ws.team")]] as const).map(([id, ic, label]) => {
            const on = id === "checks" ? pane === "work" && workTab === "checks" : id === "work" ? pane === "work" && workTab !== "checks" : pane === id;
            const dot = (id === "team" && people.some((p) => unread(p.id))) || (id === "work" && updated.size > 0);
            return (
              <button key={id} type="button" className={`bn-item ${on ? "on" : ""}`} aria-current={on ? "page" : undefined}
                onClick={() => { if (id === "checks") { setWorkTab("checks"); setPane("work"); } else if (id === "work") { if (workTab === "checks") setWorkTab("items"); setPane("work"); } else setPane(id); }}>
                <span className="bn-icon"><Icon name={ic} fill={on} />{dot && <span className="unread-dot" />}</span><span>{label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <TraceDrawer open={traceOpen} onClose={() => setTraceOpen(false)} trace={M.trace} pinned={pinned && desktop} setPinned={setPinned} />

      <Dialog open={mobileObj} onClose={() => setMobileObj(false)} title={t("ws.objectives")} icon="checklist"><ObjectivesBody m={m} onArtifact={openArtifact} /></Dialog>
      <ConfirmDialog open={exitOpen} onClose={() => setExitOpen(false)} onConfirm={() => nav(exitTo)} title={t("ws.exitTitle")} body={t("ws.exitBody")} confirmLabel={t("common.exit")} cancelLabel={t("common.resume")} swap />
      <ConfirmDialog open={finishOpen} onClose={() => setFinishOpen(false)} onConfirm={doFinish} title={t("ws.finishTitle")} body={t("ws.finishBody")} confirmLabel={t("ws.finish")} loading={busy === "finish"} />
      <ConfirmDialog open={variantOpen} onClose={() => setVariantOpen(false)} onConfirm={doVariant} title={t("ws.newVariantTitle")} body={<>{t("ws.newVariantBody")}<br /><span className="t-label">{m.variantLabel}</span></>} confirmLabel={t("ws.newVariant")} loading={busy === "variant"} />
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} m={m} traceIds={M.trace.slice(-5).map((x) => x.id)} />
      <Dialog open={keysOpen} onClose={() => setKeysOpen(false)} title={t("ws.shortcuts")} icon="keyboard" actions={<Button onClick={() => setKeysOpen(false)}>{t("common.close")}</Button>}>
        <dl className="keys">
          {[["Enter", t("ws.send")], ["Shift + Enter", "New line"], ["Ctrl / ⌘ + Enter", `${t("ws.send")} / ${t("ws.submit")}`], ["Alt + 1", t("ws.chat")], ["Alt + 2", t("ws.work")], ["Alt + 3", t("ws.checks")], ["Esc", t("common.close")], ["?", t("ws.shortcuts")]].map(([k, v]) => (
            <div key={k} className="row gap-12"><dt>{k.split(" + ").map((x, i) => <span key={x}>{i > 0 && " + "}<kbd className="kbd">{x}</kbd></span>)}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </Dialog>
      {judging && <JudgingOverlay />}
    </div>
  );
}

function JudgingOverlay() {
  const t = useT();
  return (
    <div className="judging" role="status" aria-live="polite">
      <div className="demo-glyph"><LogoGlyph size={64} /></div>
      <p className="t-tl">{t("ws.judging")}</p>
    </div>
  );
}

function ReportDialog({ open, onClose, m, traceIds }: { open: boolean; onClose: () => void; m: MissionState; traceIds: string[] }) {
  const t = useT();
  const toast = useApp((s) => s.toast);
  const [text, setText] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title={t("ws.reportTitle")} icon="flag"
      actions={<><Button variant="text" onClick={onClose}>{t("common.close")}</Button>
        <Button icon="content_copy" onClick={async () => { await copyText(JSON.stringify({ problem: text, missionId: m.id, seed: m.seed, beat: m.beat.index, lastTraceIds: traceIds, url: location.href, at: new Date().toISOString() }, null, 2)); toast(t("common.copied")); }}>{t("common.copyDiagnostics")}</Button></>}>
      <p className="t-bm t-secondary" style={{ marginBottom: 16 }}>{t("ws.reportHelp")}</p>
      <div className="field on-surface"><textarea id="problem" rows={5} placeholder=" " value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} /><label htmlFor="problem">{t("ws.reportTitle")}</label></div>
      <p className="t-label t-secondary mono" style={{ marginTop: 12 }}>{m.id} · {m.seed} · {traceIds.length} trace ids</p>
    </Dialog>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="ws" aria-busy="true">
      <header className="ws-top"><Skeleton h={32} w={32} r={16} /><Skeleton h={20} w="30%" /><span className="spacer" /><Skeleton h={20} w={120} /></header>
      <div className="ws-grid">
        <aside className="ws-rail"><div className="stack gap-12" style={{ padding: 16 }}>{Array.from({ length: 6 }, (_, i) => <div key={i} className="row gap-12"><Skeleton h={28} w={28} r={14} /><Skeleton h={14} w="60%" /></div>)}</div></aside>
        <section className="ws-center"><div className="stack gap-16" style={{ padding: 24 }}>{Array.from({ length: 4 }, (_, i) => <div key={i} className="row gap-12" style={{ alignItems: "flex-start", justifyContent: i % 2 ? "flex-end" : "flex-start" }}>{i % 2 === 0 && <Skeleton h={28} w={28} r={14} />}<Skeleton h={64} w="60%" r={16} /></div>)}</div></section>
        <section className="ws-work"><div className="stack gap-8" style={{ padding: 16 }}><Skeleton h={40} /><Skeleton h={300} r={12} /></div></section>
      </div>
    </div>
  );
}

/* ───────────────────────── conversation ───────────────────────── */

function Conversation({ m, M, thread, centerTab, setCenterTab, hasEmail, personOf, openFileAt, openChecks, openItem }: {
  m: MissionState; M: ReturnType<typeof useMission>; thread: string | null; centerTab: "chat" | "email"; setCenterTab: (t: "chat" | "email") => void; hasEmail: boolean;
  personOf: (id: string | null) => Person | undefined; openFileAt: (p: string, l: number) => void; openChecks: () => void; openItem: (id: string) => void;
}) {
  const t = useT();
  const toast = useApp((s) => s.toast);
  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showPill, setShowPill] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [lastTo, setLastTo] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const taRef = useRef<HTMLTextAreaElement>(null);

  const visible = useMemo(() => M.events.filter((e) => {
    if (centerTab === "email") return e.kind === "message" && e.channel === "email";
    if (e.kind === "message") return e.channel !== "email" && threadKey(e) === thread;
    return true;
  }), [M.events, thread, centerTab]);

  const emailTo = useMemo(() => [...M.events].reverse().find((e) => e.channel === "email" && e.from !== "you")?.from ?? thread, [M.events, thread]);
  const to = centerTab === "email" ? emailTo : thread === "team" ? m.people[0]?.id ?? null : thread;
  const toPerson = personOf(to ?? null);
  // Reply on the channel the person last used with you (the banking customer phones in on "call").
  const lastFromThem = [...M.events].reverse().find((e) => e.kind === "message" && e.from === to && e.channel !== "email");
  const replyChannel: MissionEvent["channel"] = centerTab === "email" ? "email" : lastFromThem?.channel === "call" ? "call" : "chat";
  const active = m.status === "active";
  const rateLeft = M.rateUntil ? Math.max(0, Math.ceil((M.rateUntil - now) / 1000)) : 0;

  useEffect(() => {
    if (!M.rateUntil && !M.pending) return;
    const id = setInterval(() => { setNow(Date.now()); if (M.rateUntil && Date.now() > M.rateUntil) M.setRateUntil(null); }, 1000);
    return () => clearInterval(id);
  }, [M.rateUntil, M.pending, M]);

  // restore scroll / stick to bottom
  const restored = useRef(false);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (!restored.current) {
      restored.current = true;
      const saved = loadUi(m.id).scroll;
      el.scrollTop = saved !== undefined ? saved : el.scrollHeight;
      atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      return;
    }
    if (atBottom.current) el.scrollTop = el.scrollHeight;
    else setShowPill(true);
  }, [visible.length, m.id]);
  useEffect(() => { const el = listRef.current; if (el) { el.scrollTop = el.scrollHeight; atBottom.current = true; setShowPill(false); } }, [thread, centerTab]);
  const onScroll = () => {
    const el = listRef.current!;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom.current) setShowPill(false);
    saveUi(m.id, { ...loadUi(m.id), scroll: el.scrollTop });
  };

  const send = async (body: string) => {
    const msg = body.trim();
    if (!msg || !to || sending || !active || rateLeft > 0) return;
    setSending(true); setText(""); setLastTo(to);
    atBottom.current = true;
    try { await M.act({ kind: "message", to, channel: replyChannel, text: msg }, { optimisticText: { to, channel: replyChannel } }); }
    catch (e) { setText(msg); toast(errorText(t, e)); }
    finally { setSending(false); requestAnimationFrame(() => taRef.current?.focus()); }
  };
  useLayoutEffect(() => { const ta = taRef.current; if (ta) { ta.style.height = "auto"; ta.style.height = `${Math.min(200, ta.scrollHeight)}px`; } }, [text]);

  // quick replies only on the latest agent message with no learner reply after it
  const lastIdx = visible.length - 1;
  const lastQuick = lastIdx >= 0 && visible[lastIdx].from !== "you" && visible[lastIdx].meta?.quickReplies ? visible[lastIdx].seq : null;
  const replier = personOf(lastTo);
  const slow = M.pending && M.pendingSince && now - M.pendingSince > 8000;
  const disabledReason = !active ? t("ws.notActive") : rateLeft > 0 ? t("ws.retryIn", { n: rateLeft }) : sending ? t("ws.inFlight") : "";

  return (
    <div className="conv">
      {hasEmail && (
        <div className="conv-tabs tabs" role="tablist" aria-label={t("ws.chat")}>
          {(["chat", "email"] as const).map((x) => <button key={x} type="button" role="tab" className="tab" aria-selected={centerTab === x} onClick={() => setCenterTab(x)}><Icon name={x === "chat" ? "forum" : "mail"} className="sm" />{x === "chat" ? t("ws.chat") : t("ws.email")}</button>)}
        </div>
      )}
      <div className="conv-head">
        {centerTab === "email" ? <><Icon name="mail" /><span className="t-tm">{t("ws.email")}</span></> : toPerson ? (
          <><Avatar name={toPerson.name} hue={toPerson.avatarHue} size="sm" presence={toPerson.presence} /><div className="stack"><span className="t-tm">{thread === "team" ? t("ws.teamChat") : toPerson.name}</span><span className="t-label t-secondary">{toPerson.title}{toPerson.modelLabel ? ` · ${toPerson.modelLabel}` : ""}</span></div></>
        ) : null}
      </div>
      <div className="conv-list" ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" tabIndex={0} aria-label={t("ws.chat")}>
        {visible.map((e) => (
          <EventView key={e.seq} e={e} people={m.people} artifacts={m.artifacts} time={simLabel(e.simMinute, m.clock)}
            quickReplies={e.seq === lastQuick ? e.meta?.quickReplies : null} onQuickReply={send} quickDisabled={!!disabledReason}
            onOpenFile={openFileAt} onOpenChecks={openChecks} items={m.items} onOpenItem={openItem} />
        ))}
        {M.pending && replier && (
          <div className="typing" role="status"><Avatar name={replier.name} hue={replier.avatarHue} size="sm" /><span className="typing-bubble"><PendingDots /></span><span className="t-label t-secondary">{slow ? t("common.slow") : t("ws.replying", { name: replier.name.split(" ")[0] })}</span></div>
        )}
      </div>
      {showPill && <button type="button" className="new-pill" onClick={() => { const el = listRef.current!; el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); setShowPill(false); }}><Icon name="arrow_downward" className="sm" />{t("ws.newMessages")}</button>}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label htmlFor="composer" className="sr-only">{t("ws.messagePh", { name: toPerson?.name ?? "" })}</label>
        <textarea id="composer" ref={taRef} rows={1} maxLength={4000} value={text} placeholder={toPerson ? t(replyChannel === "call" ? "ws.callPh" : "ws.messagePh", { name: toPerson.name.split(" ")[0] }) : ""}
          disabled={!active} aria-describedby="composer-help" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) { e.preventDefault(); send(text); } }} />
        <button type="submit" className="icon-btn filled send-btn" aria-label={t("ws.send")} title={t("ws.send")} aria-disabled={!!disabledReason || !text.trim() || undefined}><Icon name="send" fill /></button>
      </form>
      <div id="composer-help" className="composer-help t-label t-secondary" aria-live="polite">
        {disabledReason || (text.length > 3500 ? `${text.length}/4000` : "")}
      </div>
    </div>
  );
}
