import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "../../api/client";
import type { ActRequest, ActResponse, MissionEvent, MissionState, StateDelta, TraceEntry, WorkItem } from "../../contract";

export type UiEvent = MissionEvent & { optimistic?: boolean };
export type ActBody = ActRequest extends infer R ? (R extends { clientSeq: number } ? Omit<R, "clientSeq"> : never) : never;

const seqKey = (id: string) => `ayden_cseq_${id}`;
function nextClientSeq(id: string) {
  let n = 0;
  try { n = Number(localStorage.getItem(seqKey(id)) ?? "0") || 0; } catch { n = 0; }
  n += 1;
  try { localStorage.setItem(seqKey(id), String(n)); } catch { /* blocked */ }
  return n;
}

function mergeEvents(prev: UiEvent[], incoming: MissionEvent[]): UiEvent[] {
  if (!incoming.length) return prev;
  const map = new Map<number, UiEvent>();
  for (const e of prev) if (!e.optimistic) map.set(e.seq, e);
  for (const e of incoming) map.set(e.seq, e);
  const real = Array.from(map.values()).sort((a, b) => a.seq - b.seq);
  // keep optimistic messages whose text has not yet arrived from the server
  const opt = prev.filter((e) => e.optimistic && !incoming.some((x) => x.from === "you" && x.body === e.body));
  return [...real, ...opt];
}
function mergeTrace(prev: TraceEntry[], incoming: TraceEntry[]) {
  if (!incoming.length) return prev;
  const ids = new Set(prev.map((t) => t.id));
  return [...prev, ...incoming.filter((t) => !ids.has(t.id))];
}
function applyDelta(m: MissionState, d: StateDelta): MissionState {
  const changed = new Map<string, WorkItem>((d.changedItems ?? []).map((i) => [i.id, i]));
  return { ...m, beat: d.beat, clock: d.clock, status: d.status, lastSeq: Math.max(m.lastSeq, d.lastSeq), canAdvance: d.canAdvance, canFinish: d.canFinish, attempt: d.attempt, artifacts: d.artifacts.length ? d.artifacts : m.artifacts, items: changed.size ? m.items.map((i) => changed.get(i.id) ?? i) : m.items };
}

/** Loads a mission, sends actions idempotently, polls while agents are still replying. */
export function useMission(missionId: string) {
  const [mission, setMission] = useState<MissionState | null>(null);
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [inFlight, setInFlight] = useState(0);
  const [rateUntil, setRateUntil] = useState<number | null>(null);
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const lastSeq = useRef(0);
  const [tick, setTick] = useState(0);

  const absorb = useCallback((r: { events: MissionEvent[]; delta: StateDelta; pending: boolean; trace: TraceEntry[] }) => {
    setEvents((p) => mergeEvents(p, r.events));
    setTrace((p) => mergeTrace(p, r.trace));
    setMission((m) => (m ? applyDelta(m, r.delta) : m));
    const maxSeq = r.events.reduce((a, e) => Math.max(a, e.seq), r.delta.lastSeq);
    lastSeq.current = Math.max(lastSeq.current, maxSeq);
    setPending(r.pending);
    setPendingSince((s) => (r.pending ? s ?? Date.now() : null));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(undefined);
    Promise.all([api.getMission(missionId), api.getEvents(missionId, 0)]).then(([m, ev]) => {
      if (!alive) return;
      setMission(m);
      setEvents(ev.events);
      setTrace(ev.trace);
      lastSeq.current = Math.max(m.lastSeq, ev.events.at(-1)?.seq ?? 0);
      setPending(ev.pending);
      setPendingSince(ev.pending ? Date.now() : null);
      setMission((x) => (x ? applyDelta(x, ev.delta) : x));
      setLoading(false);
    }).catch((e) => { if (alive) { setError(e); setLoading(false); } });
    return () => { alive = false; };
  }, [missionId, tick]);

  // Poll every 1500 ms while replies are pending.
  useEffect(() => {
    if (!pending) return;
    let alive = true;
    const id = setInterval(() => {
      api.getEvents(missionId, lastSeq.current).then((r) => { if (alive) absorb(r); }).catch(() => undefined);
    }, 1500);
    return () => { alive = false; clearInterval(id); };
  }, [pending, missionId, absorb]);

  const act = useCallback(async (body: ActBody, opts: { optimisticText?: { to: string; channel: MissionEvent["channel"] } } = {}): Promise<ActResponse> => {
    const clientSeq = nextClientSeq(missionId);
    const req = { ...body, clientSeq } as ActRequest;
    let optimisticSeq: number | null = null;
    if (opts.optimisticText && body.kind === "message") {
      optimisticSeq = -Date.now();
      const o: UiEvent = { seq: optimisticSeq, at: new Date().toISOString(), simMinute: mission?.clock.minute ?? 0, kind: "message", channel: opts.optimisticText.channel, from: "you", to: opts.optimisticText.to, body: body.text, source: "learner", optimistic: true };
      setEvents((p) => [...p, o]);
    }
    setInFlight((n) => n + 1);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await api.act(missionId, req);
          if (optimisticSeq !== null) setEvents((p) => p.filter((e) => e.seq !== optimisticSeq));
          absorb(res);
          return res;
        } catch (e) {
          if (e instanceof ApiFailure && e.code === "network" && attempt < 2) { await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); continue; }
          throw e;
        }
      }
    } catch (e) {
      if (optimisticSeq !== null) setEvents((p) => p.filter((x) => x.seq !== optimisticSeq));
      if (e instanceof ApiFailure && e.code === "rate_limited") setRateUntil(Date.now() + (e.retryAfterMs ?? 5000));
      throw e;
    } finally {
      setInFlight((n) => n - 1);
    }
  }, [missionId, absorb, mission?.clock.minute]);

  const replaceMission = useCallback((m: MissionState) => setMission(m), []);
  return { mission, events, trace, pending, pendingSince, error, loading, inFlight, rateUntil, setRateUntil, act, reload: () => setTick((x) => x + 1), replaceMission };
}
