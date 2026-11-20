import { useEffect, useRef } from "react";
import "../mission/workspace.css";
import { api } from "../../api/client";
import { useAsync } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { simLabel } from "../../lib/time";
import { Drawer, ErrorState, Skeleton } from "../../design/components";
import { EventView } from "../mission/EventView";

/** Read-only conversation transcript, scrolled to and highlighting one event. */
export function TranscriptDrawer({ missionId, seq, open, onClose }: { missionId: string; seq: number | null; open: boolean; onClose: () => void }) {
  const t = useT();
  const data = useAsync(async () => {
    if (!open) return null;
    const [m, tr] = await Promise.all([api.getMission(missionId), api.getTranscript(missionId)]);
    return { m, tr };
  }, [missionId, open]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !data.data || seq === null) return;
    const id = requestAnimationFrame(() => box.current?.querySelector(`[data-seq="${seq}"]`)?.scrollIntoView({ block: "center" }));
    return () => cancelAnimationFrame(id);
  }, [open, data.data, seq]);
  const people = data.data?.m.people ?? [];
  const nameOf = (id?: string) => (id === "you" ? t("ws.you") : people.find((p) => p.id === id)?.name ?? id ?? "");
  return (
    <Drawer open={open} onClose={onClose} title={t("debrief.transcript")}>
      {data.error ? <ErrorState error={data.error} retry={data.reload} /> : !data.data ? (
        <div className="stack gap-12">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={56} r={14} />)}</div>
      ) : (
        <div ref={box} className="stack gap-12 transcript">
          {data.data.tr.events.map((e) => (
            <div key={e.seq} className="stack gap-4">
              {e.kind === "message" && e.from === "you" && e.to && <span className="t-label t-secondary" style={{ alignSelf: "flex-end" }}>to {nameOf(e.to)}</span>}
              <EventView e={e} people={people} artifacts={data.data!.m.artifacts} time={simLabel(e.simMinute, data.data!.m.clock)} highlight={e.seq === seq} />
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
