import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> { data: T | undefined; error: unknown; loading: boolean; slow: boolean; reload: () => void; setData: (d: T) => void }

/** Runs an async loader with loading, error, slow (8 s) and reload states. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(undefined); setSlow(false);
    const timer = setTimeout(() => alive && setSlow(true), 8000);
    fn().then((d) => { if (alive) { setData(d); setLoading(false); } }).catch((e) => { if (alive) { setError(e); setLoading(false); } }).finally(() => clearTimeout(timer));
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  return { data, error, loading, slow, reload, setData };
}

export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    on();
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** Remembers which report belongs to which mission (the contract has no mission → report lookup). */
export const reportMap = {
  get(missionId: string) { try { return localStorage.getItem(`ayden_report_${missionId}`); } catch { return null; } },
  set(missionId: string, reportId: string) { try { localStorage.setItem(`ayden_report_${missionId}`, reportId); } catch { /* blocked */ } },
};
