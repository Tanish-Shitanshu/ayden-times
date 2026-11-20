import type { ErrorCode, RuntimeMode } from "../../contract";

export interface MockSettings {
  latency: boolean;
  slowModel: boolean;
  runtime: RuntimeMode;
  forceError: ErrorCode | null;
  reportPolls: number;
  failNextReport: boolean;
  dataPlanned: boolean;
  seedCohorts: boolean;
}

const KEY = "ayden_mock_settings";
const DEFAULTS: MockSettings = { latency: true, slowModel: false, runtime: "live", forceError: null, reportPolls: 3, failNextReport: false, dataPlanned: true, seedCohorts: false };
const listeners = new Set<() => void>();

export function getSettings(): MockSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<MockSettings>) };
  } catch {
    return DEFAULTS;
  }
}

export function setSettings(patch: Partial<MockSettings>) {
  const next = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
  listeners.forEach((l) => l());
}

export function subscribeSettings(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
