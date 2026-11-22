import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ActResponse, ArtifactSpec, MissionState, WorkItem } from "../../contract";
import { Banner, Button, Chip, ConfirmDialog, EmptyState, Icon, Skeleton, Tabs } from "../../design/components";
import { useApp } from "../../app/store";
import { useT, errorText } from "../../lib/i18n";
import { headingsOf, renderMarkdown, slug } from "../../lib/markdown";
import type { ActBody, UiEvent } from "./useMission";
import { artifactText } from "./EventView";
import { downloadPdf, downloadXlsx, readXlsx } from "../../lib/files";

const CodeEditor = lazy(() => import("./CodeEditor"));

export const ITEM_ICON: Record<WorkItem["type"], string> = { file: "description", doc: "article", ticket: "confirmation_number", table: "table_chart", record: "person" };
type ActFn = (body: ActBody) => Promise<ActResponse>;

export interface WorkPanelProps {
  mission: MissionState;
  events: UiEvent[];
  tab: string;
  setTab: (t: string) => void;
  itemId: string | null;
  setItemId: (id: string) => void;
  artifactId: string | null;
  setArtifactId: (id: string) => void;
  gotoLine: { line: number; token: number } | null;
  act: ActFn;
  dark: boolean;
  checksRunning: boolean;
  setChecksRunning: (v: boolean) => void;
  registerRunChecks: (fn: () => void) => void;
  updated?: Set<string>;
}

const origKey = (m: string, i: string) => `ayden_orig_${m}_${i}`;
const draftKey = (m: string, a: string) => `ayden_draft_${m}_${a}`;
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } }, del: (k: string) => { try { localStorage.removeItem(k); } catch { /* blocked */ } } };

function EditorFallback() {
  return <div className="stack gap-8" style={{ padding: 16 }}>{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={14} w={`${40 + ((i * 37) % 55)}%`} />)}</div>;
}

function DocView({ md }: { md: string }) {
  const heads = headingsOf(md);
  const html = useMemo(() => renderMarkdown(md).replace(/<h([1-3])>(.*?)<\/h\1>/g, (_, l: string, inner: string) => `<h${l} id="doc-${slug(inner.replace(/<[^>]+>/g, ""))}">${inner}</h${l}>`), [md]);
  return (
    <div className="doc-view">
      {heads.length > 3 && (
        <nav className="doc-toc" aria-label="Contents">
          {heads.map((h) => <a key={h.id} href={`#doc-${h.id}`} style={{ paddingLeft: (h.level - 1) * 12 }} onClick={(e) => { e.preventDefault(); document.getElementById(`doc-${h.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{h.text}</a>)}
        </nav>
      )}
      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function TicketView({ it }: { it: Extract<WorkItem, { type: "ticket" }> }) {
  const tone = it.priority === "urgent" || it.priority === "high" ? "error" : it.priority === "medium" ? "warning" : "tonal";
  return (
    <div className="card" style={{ margin: 16 }}>
      <div className="row gap-8 wrap"><span className="mono t-label t-secondary">{it.key}</span><span className="spacer" /><Chip tone="primary" icon="radio_button_checked">{it.status}</Chip><Chip tone={tone} icon="flag">{it.priority}</Chip></div>
      <h3 className="t-tl" style={{ marginTop: 12 }}>{it.title.replace(`${it.key} · `, "")}</h3>
      <div className="prose" style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(it.description) }} />
    </div>
  );
}

function TableView({ it }: { it: Extract<WorkItem, { type: "table" }> }) {
  return (
    <div style={{ padding: 16 }}>
      <div className="row gap-8" style={{ marginBottom: 8 }}>
        <span className="spacer" />
        <Button variant="tonal" icon="download" onClick={() => { void downloadXlsx(it.title, it.columns, it.rows); }}>Download .xlsx</Button>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={it.title}>
        <table className="data-table">
          {it.note && <caption className="t-bm t-secondary" style={{ captionSide: "bottom", textAlign: "left", padding: "10px 12px" }}>{it.note}</caption>}
          <thead><tr>{it.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{it.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function RecordView({ it }: { it: Extract<WorkItem, { type: "record" }> }) {
  return (
    <div className="card" style={{ margin: 16 }}>
      <dl className="record-grid">{it.fields.map((f) => <div key={f.label} className="record-row"><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
      {it.note && <p className="t-label t-secondary" style={{ marginTop: 12 }}>{it.note}</p>}
    </div>
  );
}

export function WorkPanel(p: WorkPanelProps) {
  const t = useT();
  const toast = useApp((s) => s.toast);
  const { mission, events } = p;
  const active = mission.status === "active";
  const files = mission.items.filter((i): i is Extract<WorkItem, { type: "file" }> => i.type === "file");
  const hasChecks = files.some((f) => f.editable);
  const item = mission.items.find((i) => i.id === p.itemId) ?? null;

  /* ── file drafts + autosave ── */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<Record<string, "saving" | "saved" | "error" | "dirty">>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [resetFor, setResetFor] = useState<string | null>(null);

  useEffect(() => { for (const f of files) if (ls.get(origKey(mission.id, f.id)) === null) ls.set(origKey(mission.id, f.id), f.content); }, [mission.id, files]);
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  const save = async (id: string) => {
    const content = draftsRef.current[id];
    if (content === undefined) return;
    clearTimeout(timers.current[id]);
    setSaveState((s) => ({ ...s, [id]: "saving" }));
    try { await p.act({ kind: "save_file", itemId: id, content }); setSaveState((s) => ({ ...s, [id]: "saved" })); }
    catch (e) { setSaveState((s) => ({ ...s, [id]: "error" })); toast(errorText(t, e)); }
  };
  const onEdit = (id: string, v: string) => {
    setDrafts((d) => ({ ...d, [id]: v }));
    setSaveState((s) => ({ ...s, [id]: "dirty" }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => save(id), 1500);
  };
  const flushAll = async () => { await Promise.all(Object.keys(saveState).filter((k) => saveState[k] === "dirty").map(save)); };

  const runChecks = async () => {
    if (!active || p.checksRunning) return;
    p.setChecksRunning(true);
    p.setTab("checks");
    try { await flushAll(); await p.act({ kind: "run_checks", itemIds: files.map((f) => f.id) }); }
    catch (e) { p.setChecksRunning(false); toast(errorText(t, e)); }
  };
  const runRef = useRef(runChecks);
  runRef.current = runChecks;
  useEffect(() => { p.registerRunChecks(() => runRef.current()); }, [p]);

  const latestCheck = [...events].reverse().find((e) => e.kind === "check_result" && (e.meta?.checks?.length ?? 0) > 0);

  /* ── artifacts ── */
  const art = mission.artifacts.find((a) => a.id === p.artifactId) ?? mission.artifacts[0] ?? null;

  const tabs = [
    { id: "items", label: t("ws.files"), icon: "folder_open" },
    { id: "write", label: t("ws.write"), icon: "edit_note", dot: mission.artifacts.some((a) => a.required && !a.submitted) },
    { id: "checks", label: t("ws.checks"), icon: "fact_check" },
  ];

  return (
    <div className="work-panel" id="work-panel" tabIndex={-1} aria-label={t("ws.work")}>
      <Tabs idPrefix="wp" label={t("ws.work")} tabs={tabs} value={p.tab} onChange={p.setTab} />
      <div className="work-body" role="tabpanel" id={`wp-panel-${p.tab}`} aria-labelledby={`wp-tab-${p.tab}`}>
        {p.tab === "items" && (
          <>
            <div className="item-switch" role="toolbar" aria-label={t("ws.items")}>
              {mission.items.map((i) => (
                <button key={i.id} type="button" className="chip chip-btn" aria-pressed={i.id === item?.id} onClick={() => p.setItemId(i.id)}>
                  <span className="icon xs" aria-hidden="true">{ITEM_ICON[i.type]}</span>{i.type === "file" ? i.title : i.title.length > 28 ? `${i.title.slice(0, 26)}…` : i.title}{p.updated?.has(i.id) && <span className="unread-dot" aria-label={t("ws.updated")} />}
                </button>
              ))}
            </div>
            {!item ? <EmptyState icon="folder_open" title={t("ws.chooseItem")} body={t("ws.selectItem")} /> : (
              <div className="item-view">
                <div className="item-head">
                  <Icon name={ITEM_ICON[item.type]} className="sm" style={{ color: "var(--text-secondary)" }} />
                  <h3 className="t-tm grow item-title">{item.type === "file" ? item.path : item.title}</h3>
                  {item.type === "file" && !item.editable && <Chip tone="tonal" icon="lock">{t("ws.readOnly")}</Chip>}
                  {item.type !== "file" && p.updated?.has(item.id) && <Chip tone="primary" icon="update">{t("ws.updated")}</Chip>}
                  {item.type === "file" && item.editable && (
                    <span className="t-label t-secondary save-ind" aria-live="polite">
                      {saveState[item.id] === "saving" || saveState[item.id] === "dirty" ? t("ws.saving") : saveState[item.id] === "saved" ? <><Icon name="check" className="xs" /> {t("ws.saved")}</> : saveState[item.id] === "error" ? <span style={{ color: "var(--error)" }}>{t("err.generic")}</span> : null}
                    </span>
                  )}
                </div>
                {item.type === "file" && (
                  <>
                    {item.editable && (
                      <div className="file-toolbar">
                        <Button size="sm" icon="play_arrow" loading={p.checksRunning} disabledReason={!active ? t("ws.notActive") : false} onClick={runChecks}>{t("ws.runChecks")}</Button>
                        <Button size="sm" variant="text" icon="restart_alt" disabledReason={!active ? t("ws.notActive") : false} onClick={() => setResetFor(item.id)}>{t("ws.resetFile")}</Button>
                      </div>
                    )}
                    <div className="editor-wrap">
                      <Suspense fallback={<EditorFallback />}>
                        <CodeEditor key={item.id} value={drafts[item.id] ?? item.content} onChange={item.editable && active ? (v) => onEdit(item.id, v) : undefined} language={item.language} readOnly={!item.editable || !active} dark={p.dark} gotoLine={p.gotoLine} label={item.path} />
                      </Suspense>
                    </div>
                  </>
                )}
                {item.type === "doc" && (
                  <>
                    <div className="row gap-8" style={{ padding: "12px 16px 0" }}><span className="spacer" /><Button variant="tonal" icon="picture_as_pdf" onClick={() => { void downloadPdf(item.title, item.markdown, true); }}>Download PDF</Button></div>
                    <DocView md={item.markdown} />
                  </>
                )}
                {item.type === "ticket" && <TicketView it={item} />}
                {item.type === "table" && <TableView it={item} />}
                {item.type === "record" && <RecordView it={item} />}
              </div>
            )}
          </>
        )}

        {p.tab === "write" && (
          mission.artifacts.length === 0 ? <EmptyState icon="edit_off" title={t("ws.noWrite")} /> : (
            <>
              <div className="item-switch" role="toolbar" aria-label={t("ws.required")}>
                {mission.artifacts.map((a) => (
                  <button key={a.id} type="button" className="chip chip-btn" aria-pressed={a.id === art?.id} onClick={() => p.setArtifactId(a.id)}>
                    <span className="icon xs" aria-hidden="true" style={{ color: a.submitted ? "var(--success)" : undefined }}>{a.submitted ? "check_circle" : "radio_button_unchecked"}</span>{a.title}
                  </button>
                ))}
              </div>
              {art && <ArtifactComposer key={art.id} a={art} mission={mission} events={events} act={p.act} dark={p.dark} />}
            </>
          )
        )}

        {p.tab === "checks" && (
          <div className="checks-view">
            <div className="row gap-8 wrap" style={{ padding: 16 }}>
              <h3 className="t-tm grow">{t("ws.checks")}</h3>
              {hasChecks && <Button size="sm" icon="play_arrow" loading={p.checksRunning} disabledReason={!active ? t("ws.notActive") : false} onClick={runChecks}>{t("ws.runChecks")}</Button>}
            </div>
            {p.checksRunning ? (
              <div className="stack gap-12" style={{ padding: "0 16px 16px" }} aria-busy="true">
                <p className="t-bm t-secondary row gap-8" role="status"><span className="spinner-sm" aria-hidden="true" />{t("ws.checksRunning")}</p>
                <p className="t-label t-secondary">{t("ws.checksSlow")}</p>
                {Array.from({ length: 5 }, (_, i) => <div key={i} className="row gap-12"><Skeleton h={20} w={20} r={10} /><Skeleton h={16} w={`${50 + i * 8}%`} /></div>)}
              </div>
            ) : !latestCheck ? (
              <EmptyState icon="fact_check" title={hasChecks ? t("ws.checksEmpty") : t("ws.noChecks")} />
            ) : (
              <div style={{ padding: "0 16px 16px" }}>
                <Banner kind={(latestCheck.meta?.checks ?? []).every((c) => c.passed) ? "success" : "warning"} icon="science">{latestCheck.body}</Banner>
                <ul className="check-list">
                  {(latestCheck.meta?.checks ?? []).map((c) => (
                    <li key={c.id} className={c.passed ? "pass" : "fail"}>
                      <Icon name={c.passed ? "check_circle" : "cancel"} fill style={{ color: c.passed ? "var(--success)" : "var(--error)" }} />
                      <div className="stack gap-4 grow">
                        <span className="row gap-8 wrap"><span className={c.hidden ? "t-bm" : "mono t-bm"}>{c.name}</span>{c.hidden && <Chip tone="tonal" icon="visibility_off">hidden</Chip>}<Chip>{c.kind}</Chip></span>
                        {c.message && <span className="t-bm t-secondary">{c.message}</span>}
                      </div>
                      <span className="sr-only">{c.passed ? "passed" : "failed"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog open={!!resetFor} onClose={() => setResetFor(null)} title={t("ws.resetTitle")} body={t("ws.resetBody")} confirmLabel={t("ws.resetFile")}
        onConfirm={() => {
          const id = resetFor!;
          const orig = ls.get(origKey(mission.id, id)) ?? files.find((f) => f.id === id)?.content ?? "";
          setDrafts((d) => ({ ...d, [id]: orig }));
          draftsRef.current = { ...draftsRef.current, [id]: orig };
          setResetFor(null);
          save(id);
        }} />
    </div>
  );
}

function ArtifactComposer({ a, mission, events, act, dark }: { a: ArtifactSpec; mission: MissionState; events: UiEvent[]; act: ActFn; dark: boolean }) {
  const t = useT();
  const toast = useApp((s) => s.toast);
  const key = draftKey(mission.id, a.id);
  const [text, setText] = useState(() => ls.get(key) ?? a.template ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  const submittedEvent = [...events].reverse().find((e) => e.kind === "artifact" && e.meta?.artifactId === a.id);
  const locked = a.submitted && !editing;
  const active = mission.status === "active";
  const canResubmit = active && mission.attempt.number < mission.attempt.max;
  const mono = a.kind === "commit_message" || a.kind === "sql" || a.kind === "code";
  const subject = a.kind === "commit_message" ? text.split("\n")[0] ?? "" : "";
  useEffect(() => { ls.set(key, text); }, [key, text]);

  const submit = async () => {
    setBusy(true); setErr(undefined);
    try { await act({ kind: "submit_artifact", artifactId: a.id, content: text }); setEditing(false); toast(`${t("ws.submitted")}: ${a.title}`); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileNote, setFileNote] = useState("");
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(undefined);
    try { const t = await readXlsx(f); setText(t.slice(0, a.maxChars)); setFileNote(`Read ${f.name} in your browser. Check the table below, then submit.`); }
    catch (e) { setErr(e instanceof Error ? e : new Error("Could not read that file.")); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const empty = !text.trim() || text.trim() === (a.template ?? "").trim();
  const over = text.length > a.maxChars;
  return (
    <div className="composer-art">
      <div className="row gap-8 wrap"><h3 className="t-tl grow">{a.title}</h3>{a.required && <Chip tone="tonal">{t("onb.required")}</Chip>}{a.submitted && <Chip tone="success" icon="check_circle">{t("ws.submitted")}</Chip>}</div>
      <p className="t-bm t-secondary" style={{ marginTop: 6 }}>{a.instructions}</p>
      {locked ? (
        <>
          <pre className={`art-submitted ${mono ? "mono" : ""}`}>{submittedEvent ? artifactText(submittedEvent.body, a.title) : text}</pre>
          {canResubmit && <Button variant="text" icon="edit" onClick={() => { setText(submittedEvent ? artifactText(submittedEvent.body, a.title) : text); setEditing(true); }}>{t("ws.resubmit")}</Button>}
        </>
      ) : (
        <>
          {a.kind === "sql" || a.kind === "code" ? (
            <div className="editor-wrap" style={{ marginTop: 12, border: "1px solid var(--outline)", borderRadius: 12 }}>
              <Suspense fallback={<EditorFallback />}>
                <CodeEditor value={text} onChange={setText} language={a.kind === "sql" ? "sql" : "python"} dark={dark} label={a.title} minHeight="200px" readOnly={!active} />
              </Suspense>
            </div>
          ) : (
            <textarea className={`art-input ${mono ? "mono" : ""}`} value={text} onChange={(e) => setText(e.target.value)} aria-label={a.title} disabled={!active}
              rows={a.kind === "commit_message" ? 5 : 12} spellCheck={!mono}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !empty && !over) { e.preventDefault(); submit(); } }} />
          )}
          {a.kind === "spreadsheet" && (
            <div className="row gap-8 wrap" style={{ marginTop: 8 }}>
              <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => { void onFile(e.target.files?.[0]); }} aria-label="Upload an .xlsx file" />
              <Button variant="tonal" icon="upload_file" disabledReason={!active ? t("ws.notActive") : false} onClick={() => fileRef.current?.click()}>Upload .xlsx</Button>
              <Button variant="text" icon="download" onClick={() => { void downloadXlsx(a.title, (text.split("\n")[0] ?? "").split(/\s*\|\s*/), text.split("\n").slice(1).filter((l) => l.trim()).map((l) => l.split(/\s*\|\s*/))); }}>Download as .xlsx</Button>
              <span className="t-label t-secondary">{fileNote || "Read in your browser. The file itself is never uploaded."}</span>
            </div>
          )}
          {(a.kind === "memo" || a.kind === "email") && (
            <div className="row gap-8" style={{ marginTop: 8 }}><Button variant="text" icon="picture_as_pdf" disabledReason={empty ? "Write the memo first." : false} onClick={() => { void downloadPdf(a.title, text); }}>Export PDF</Button></div>
          )}
          <div className="row gap-12 wrap" style={{ marginTop: 8 }}>
            {a.kind === "commit_message" && <span className="t-label tnum" style={{ color: subject.length > 72 ? "var(--warning)" : "var(--text-secondary)" }}>{subject.length}/72{subject.length > 72 ? ` · ${t("ws.subjectHint")}` : ""}</span>}
            <span className="spacer" />
            <span className="t-label tnum" style={{ color: over ? "var(--error)" : "var(--text-secondary)" }}>{t("ws.charCount", { n: text.length, max: a.maxChars })}</span>
          </div>
          {err !== undefined && <div style={{ marginTop: 8 }}><Banner kind="error">{errorText(t, err)}</Banner></div>}
          <div className="row gap-8" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            {editing && <Button variant="text" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>}
            <Button icon="send" loading={busy} disabledReason={!active ? t("ws.notActive") : empty ? a.instructions : over ? t("ws.charCount", { n: text.length, max: a.maxChars }) : false} onClick={submit}>{t("ws.submit")}</Button>
          </div>
        </>
      )}
    </div>
  );
}
