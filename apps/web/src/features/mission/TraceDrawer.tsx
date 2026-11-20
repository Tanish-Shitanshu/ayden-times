import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { TraceEntry } from "../../contract";
import { Chip, Drawer, Icon, IconButton } from "../../design/components";
import { useT } from "../../lib/i18n";

const TYPE_ICON: Record<TraceEntry["type"], string> = { proposal: "smart_toy", validation: "gavel", signal: "sensors", fallback: "description", check: "science", consequence: "schedule" };

export function TraceDrawer({ open, onClose, trace, pinned, setPinned }: { open: boolean; onClose: () => void; trace: TraceEntry[]; pinned: boolean; setPinned: (v: boolean) => void }) {
  const t = useT();
  const [filter, setFilter] = useState<"all" | "accepted" | "rejected">("all");
  const end = useRef<HTMLDivElement>(null);
  const shown = trace.filter((x) => filter === "all" || x.verdict === filter);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "end" }); }, [open, trace.length, filter]);
  return (
    <Drawer open={open} onClose={onClose} pinned={pinned} title={<span className="row gap-8"><Icon name="account_tree" style={{ color: "var(--primary)" }} />{t("ws.trace")}</span>}
      headExtra={<IconButton icon={pinned ? "push_pin" : "keep"} fill={pinned} label={pinned ? t("ws.unpin") : t("ws.pin")} selected={pinned} onClick={() => setPinned(!pinned)} className="hide-mobile" />}>
      <p className="t-tm">{t("ws.traceHead")}</p>
      <p className="t-bm t-secondary" style={{ marginTop: 4 }}>{t("ws.traceExplain")} <Link to="/how-it-works#engine">{t("ws.howLink")}</Link></p>
      <div className="row gap-8" role="group" aria-label="Filter" style={{ margin: "16px 0" }}>
        {(["all", "accepted", "rejected"] as const).map((f) => (
          <button key={f} type="button" className="chip chip-btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? t("ws.traceAll") : f === "accepted" ? t("ws.traceAccepted") : t("ws.traceRejected")}
            <span className="tnum t-secondary">{f === "all" ? trace.length : trace.filter((x) => x.verdict === f).length}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? <p className="t-bm t-secondary">{t("ws.traceEmpty")}</p> : (
        <ol className="trace-list" aria-live="polite">
          {shown.map((x) => (
            <li key={x.id} className={`trace-item ${x.verdict ?? ""}`}>
              <div className="row gap-8 wrap">
                <Icon name={TYPE_ICON[x.type]} className="sm" style={{ color: "var(--text-secondary)" }} />
                <span className="t-bm" style={{ fontWeight: 500 }}>{x.actor}</span>
                {x.model && <Chip tone="tonal" className="mono">{x.model}</Chip>}
                <span className="spacer" />
                {x.verdict && <Chip tone={x.verdict === "accepted" ? "success" : "error"} icon={x.verdict === "accepted" ? "check" : "close"}>{x.verdict === "accepted" ? t("ws.traceAccepted") : t("ws.traceRejected")}</Chip>}
              </div>
              <p className="t-bm trace-summary">{x.summary}</p>
              {x.reason && <p className="t-bm trace-reason"><Icon name="subdirectory_arrow_right" className="xs" />{x.reason}</p>}
              <p className="t-label t-secondary">{x.type}{x.latencyMs ? ` · ${(x.latencyMs / 1000).toFixed(1)} s` : ""}{x.seq ? ` · #${x.seq}` : ""}</p>
            </li>
          ))}
        </ol>
      )}
      <div ref={end} />
    </Drawer>
  );
}
