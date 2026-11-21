import { memo } from "react";
import type { ArtifactSpec, MissionEvent, Person, WorkItem } from "../../contract";
import { Avatar, Button, Chip, Icon } from "../../design/components";
import { renderMarkdown } from "../../lib/markdown";
import { useT } from "../../lib/i18n";
import type { UiEvent } from "./useMission";
import { MessageTools } from "../game/MessageTools";

const SEV: Record<string, { tone: "error" | "primary" | "tonal" | "purple"; icon: string; label: string }> = {
  blocker: { tone: "error", icon: "block", label: "Blocker" },
  suggestion: { tone: "primary", icon: "lightbulb", label: "Suggestion" },
  nit: { tone: "tonal", icon: "format_paint", label: "Nit" },
  question: { tone: "purple", icon: "help", label: "Question" },
};

/** Live artifact events start with "**Title**" on its own line; strip it to get the submitted text. */
export function artifactText(body: string, title?: string) {
  const m = body.match(/^\*\*(.+?)\*\*\s*\n\s*\n?/);
  if (m && (!title || m[1].trim() === title.trim())) return body.slice(m[0].length);
  return body;
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`prose ${className}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}

interface Props {
  e: UiEvent;
  people: Person[];
  time: string;
  artifacts?: ArtifactSpec[];
  highlight?: boolean;
  quickReplies?: string[] | null;
  onQuickReply?: (text: string) => void;
  onOpenFile?: (path: string, line: number) => void;
  onOpenChecks?: () => void;
  quickDisabled?: boolean;
  items?: WorkItem[];
  onOpenItem?: (id: string) => void;
}

export const EventView = memo(function EventView({ e, people, time, artifacts, highlight, quickReplies, onQuickReply, onOpenFile, onOpenChecks, quickDisabled, items, onOpenItem }: Props) {
  const t = useT();
  const linked = e.meta?.itemId ? items?.find((i) => i.id === e.meta!.itemId) : undefined;
  const openLinked = linked && onOpenItem ? <Button variant="text" size="sm" icon="open_in_new" onClick={() => onOpenItem(linked.id)}>{t("ws.openItem", { title: linked.title.length > 32 ? `${linked.title.slice(0, 30)}…` : linked.title })}</Button> : null;
  const person = people.find((p) => p.id === e.from);
  const hl = highlight ? " ev-highlight" : "";
  const scripted = e.fallback ? <Chip tone="tonal" className="ev-tag">{t("ws.scripted")}</Chip> : null;

  if (e.kind === "beat") {
    return <div className={`ev-beat${hl}`} data-seq={e.seq} role="separator" aria-label={e.body}><span>{e.body}</span></div>;
  }
  if (e.kind === "system" || e.kind === "notice") {
    if (openLinked) return <div className={`ev-card ev-update${hl}`} data-seq={e.seq}><div className="row gap-8"><Icon name="update" className="sm" style={{ color: "var(--primary)" }} /><span className="t-bm grow">{e.body}</span><span className="ev-time">{time}</span></div>{openLinked}</div>;
    return <p className={`ev-system${hl}`} data-seq={e.seq}><Icon name="info" className="xs" />{e.body}<span className="ev-time">{time}</span></p>;
  }
  if (e.kind === "consequence") {
    return (
      <div className={`ev-card ev-consequence${hl}`} data-seq={e.seq}>
        <div className="row gap-8"><Icon name="schedule" /><span className="t-tm">{t("ws.consequence")}</span><span className="spacer" /><span className="ev-time">{time}</span></div>
        <Markdown text={e.body} />
        {openLinked}
      </div>
    );
  }
  if (e.kind === "check_result") {
    const checks = e.meta?.checks ?? [];
    const passed = checks.filter((c) => c.passed).length;
    return (
      <div className={`ev-card ev-checks${hl}`} data-seq={e.seq}>
        <div className="row gap-8 wrap">
          <Icon name={passed === checks.length ? "task_alt" : "rule"} style={{ color: passed === checks.length ? "var(--success)" : "var(--warning)" }} />
          <span className="t-tm grow">{e.body}</span><span className="ev-time">{time}</span>
        </div>
        {checks.some((c) => !c.passed) && (
          <ul className="check-mini">
            {checks.filter((c) => !c.passed).map((c) => <li key={c.id}><Icon name="cancel" className="xs" style={{ color: "var(--error)" }} /><span className="mono">{c.name}</span>{c.message && <span className="t-secondary"> · {c.message}</span>}</li>)}
          </ul>
        )}
        {onOpenChecks && <Button variant="text" size="sm" icon="fact_check" onClick={onOpenChecks}>{t("ws.openChecks")}</Button>}
      </div>
    );
  }
  if (e.kind === "review_comment") {
    const sev = SEV[e.meta?.severity ?? "suggestion"] ?? SEV.suggestion;
    return (
      <div className={`ev-card ev-review${hl}`} data-seq={e.seq}>
        <div className="row gap-8 wrap">
          {person && <Avatar name={person.name} hue={person.avatarHue} size="sm" />}
          <span className="t-tm">{person?.name ?? e.from}</span>
          <Chip tone={sev.tone} icon={sev.icon}>{sev.label}</Chip>
          {scripted}
          <span className="spacer" /><span className="ev-time">{time}</span>
        </div>
        {e.meta?.commentFile && <p className="mono t-label t-secondary" style={{ marginTop: 8 }}>{e.meta.commentFile}{e.meta.commentLine ? `:${e.meta.commentLine}` : ""}</p>}
        <Markdown text={e.body} className="ev-review-body" />
        {e.meta?.commentFile && onOpenFile && <Button variant="text" size="sm" icon="code" onClick={() => onOpenFile(e.meta!.commentFile!, e.meta!.commentLine ?? 1)}>{t("ws.openFile")}</Button>}
      </div>
    );
  }
  if (e.kind === "artifact") {
    const a = artifacts?.find((x) => x.id === e.meta?.artifactId);
    return (
      <details className={`ev-card ev-artifact${hl}`} data-seq={e.seq}>
        <summary className="row gap-8"><Icon name="task" style={{ color: "var(--success)" }} /><span className="t-tm grow">{t("ws.youSubmitted", { title: a?.title ?? "work" })}</span><span className="ev-time">{time}</span><Icon name="expand_more" className="chev" /></summary>
        <pre className="ev-artifact-body">{artifactText(e.body, a?.title)}</pre>
      </details>
    );
  }
  // message
  const mine = e.from === "you";
  return (
    <div className={`ev-msg ${mine ? "mine" : ""}${e.optimistic ? " optimistic" : ""}${hl}`} data-seq={e.seq}>
      {!mine && (person ? <Avatar name={person.name} hue={person.avatarHue} size="sm" /> : <span className="avatar sm" style={{ background: "var(--outline-strong)" }} />)}
      <div className="ev-msg-col">
        <div className="ev-meta">
          <span className="ev-name">{mine ? t("ws.you") : person?.name ?? e.from}</span>
          {e.channel === "email" && <Icon name="mail" className="xs" />}
          {e.channel === "call" && <Chip tone="tonal" icon="call" className="ev-tag">{t("ws.call")}</Chip>}
          {scripted}
          <span className="ev-time">{time}</span>
        </div>
        <div className={`ev-bubble ${e.channel === "call" ? "call" : ""}`}><Markdown text={e.body} /></div>
        {!e.optimistic && <MessageTools seq={e.seq} mine={mine} spoke={mine ? (people.find((p) => p.id === e.to)) : person} />}
        {openLinked}
        {quickReplies && quickReplies.length > 0 && onQuickReply && (
          <div className="row gap-8 wrap" style={{ marginTop: 8 }}>
            {quickReplies.map((q) => <button key={q} type="button" className="chip chip-btn" disabled={quickDisabled} onClick={() => onQuickReply(q)}>{q}</button>)}
          </div>
        )}
      </div>
    </div>
  );
});

export function threadOf(e: MissionEvent): string | null {
  if (e.kind !== "message") return null;
  if (e.from === "you") return e.to ?? null;
  if (e.from === "system") return null;
  return e.from;
}
