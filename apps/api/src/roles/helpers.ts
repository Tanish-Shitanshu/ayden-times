import type { MissionEvent } from "@ayden/contract";
import { quoteOf } from "../domain/text.js";
import type { AnchorDef, AnchorHit, PersonDef, ScriptedEvent, TrapDef } from "../domain/types.js";

export const person = (
  id: string,
  name: string,
  title: string,
  hue: number,
  persona: string,
  defaultLines: string[],
  modelLabel = "Gemini 4 Hydrogen",
): PersonDef => ({ id, name, title, hue, kind: "agent", persona, defaultLines, modelLabel });

export const say = (from: string, body: string, extra: Partial<ScriptedEvent> = {}): ScriptedEvent => ({
  from,
  to: "you",
  channel: "chat",
  body,
  ...extra,
});

export const sys = (body: string, extra: Partial<ScriptedEvent> = {}): ScriptedEvent => ({
  from: "system",
  channel: "system",
  kind: "system",
  body,
  ...extra,
});

export const hit = (e: MissionEvent | undefined, re?: RegExp, note?: string): AnchorHit =>
  e ? { met: true, seq: e.seq, quote: quoteOf(e, re), note } : { met: false, note };

export const trapFrom = (anchors: AnchorDef[], anchorId: string, label: string, id = anchorId): TrapDef => ({
  id,
  label,
  missed: (ctx) => {
    const a = anchors.find((x) => x.id === anchorId);
    return a ? !a.eval(ctx).met : false;
  },
});

/** Text under the first markdown heading (or "Label:" line) whose title matches `title`, up to the next heading. */
export function section(text: string, title: RegExp): string {
  const lines = text.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\s*(#{1,6}\s*|\*\*)?/.test(l) && title.test(l.replace(/^\s*#{1,6}\s*/, "")) && (/^\s*#{1,6}\s/.test(l) || /^\s*\*\*/.test(l) || /:\s*$/.test(l) || /^\s*[A-Za-z ]{1,30}:/.test(l))) {
      start = i;
      break;
    }
  }
  if (start < 0) return "";
  const out: string[] = [];
  const inline = lines[start]!.replace(/^\s*#{1,6}\s*/, "").replace(/^\*\*.*?\*\*:?\s*/, "").replace(/^[A-Za-z ]{1,30}:\s*/, "");
  if (inline.trim()) out.push(inline.trim());
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*#{1,6}\s/.test(lines[i]!) || /^\s*\*\*[^*]+\*\*\s*:?\s*$/.test(lines[i]!)) break;
    out.push(lines[i]!);
  }
  return out.join("\n").trim();
}

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function clockLabel(day: string, startMinute: number, simMinute: number): string {
  const total = startMinute + simMinute;
  const dayOffset = Math.floor(total / 1440);
  const m = ((total % 1440) + 1440) % 1440;
  const d = DAYS[(DAYS.indexOf(day) + dayOffset) % 7]!;
  return `${d} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
