import type {
  ActRequest, ActResponse, ApiError, Cohort, CohortInsights, CreateCohortRequest, CreateGuestResponse, CreateMissionRequest,
  DeleteMeResponse, DrillList, ErrorCode, EventsResponse, ExportResponse, JoinCohortRequest, Me, MissionState, Onboarding,
  Progress, Report, RoleDetail, RoleId, RoleSummary, SystemStatus, UpdateConsentRequest, UpdateMeRequest,
} from "../contract";
import { API_BASE } from "../contract";

export const API_MODE: "live" | "mock" = import.meta.env.VITE_API_MODE === "mock" ? "mock" : "live";
const ORIGIN = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

/** Thrown for every non-2xx response and for network failures. */
export class ApiFailure extends Error {
  constructor(
    public code: ErrorCode | "network",
    message: string,
    public status: number,
    public retryAfterMs?: number,
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

type Transport = (method: string, url: string, body?: unknown) => Promise<{ status: number; body: unknown; requestId?: string }>;

const fetchTransport: Transport = async (method, url, body) => {
  const res = await fetch(ORIGIN + url, {
    method,
    credentials: "include",
    headers: body === undefined ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  return { status: res.status, body: parsed, requestId: res.headers.get("x-request-id") ?? undefined };
};

let transportPromise: Promise<Transport> | null = null;
function getTransport(): Promise<Transport> {
  if (!transportPromise) {
    transportPromise = import.meta.env.VITE_API_MODE === "mock"
      ? import("./mock/server").then((m) => m.mockTransport as Transport)
      : Promise.resolve(fetchTransport);
  }
  return transportPromise;
}

type UnauthHandler = (path: string) => void;
let onUnauthenticated: UnauthHandler | null = null;
export function setUnauthenticatedHandler(fn: UnauthHandler | null) { onUnauthenticated = fn; }

interface Opts { silent401?: boolean }

async function request<T>(method: string, path: string, body?: unknown, opts: Opts = {}): Promise<T> {
  const transport = await getTransport();
  let res: Awaited<ReturnType<Transport>>;
  try {
    res = await transport(method, API_BASE + path, body);
  } catch {
    throw new ApiFailure("network", "Network error", 0);
  }
  if (import.meta.env.DEV) console.debug(`[api] ${method} ${path} → ${res.status}${res.requestId ? ` (${res.requestId})` : ""}`);
  if (res.status >= 200 && res.status < 300) return res.body as T;
  const err = (res.body as ApiError | null)?.error;
  const code: ErrorCode = err?.code ?? (res.status === 401 ? "unauthenticated" : res.status === 404 ? "not_found" : res.status === 429 ? "rate_limited" : "internal");
  if (code === "unauthenticated" && !opts.silent401) onUnauthenticated?.(path);
  throw new ApiFailure(code, err?.message ?? `Request failed (${res.status})`, res.status, err?.retryAfterMs, res.requestId);
}

const q = (o: Record<string, string | number | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join("&")}` : "";
};

/**
 * MissionState has no drill id (for drills, missionId is the parent mission), so the client remembers
 * which drill a session was created from. Used by "New variant" on drills.
 */
export const drillOf = {
  get(missionId: string) { try { return localStorage.getItem(`ayden_drill_${missionId}`); } catch { return null; } },
  set(missionId: string, drillId: string) { try { localStorage.setItem(`ayden_drill_${missionId}`, drillId); } catch { /* blocked */ } },
};

export const api = {
  createGuest: () => request<CreateGuestResponse>("POST", "/session/guest", {}),
  getMe: (opts?: Opts) => request<Me>("GET", "/me", undefined, opts),
  updateMe: (b: UpdateMeRequest) => request<Me>("PATCH", "/me", b),
  updateConsent: (b: UpdateConsentRequest) => request<Me>("PUT", "/me/consent", b),
  exportMe: () => request<ExportResponse>("GET", "/me/export"),
  deleteMe: () => request<DeleteMeResponse>("DELETE", "/me"),
  getRoles: () => request<RoleSummary[]>("GET", "/roles"),
  getRole: (roleId: string) => request<RoleDetail>("GET", `/roles/${encodeURIComponent(roleId)}`, undefined, { silent401: true }),
  saveOnboarding: (b: Omit<Onboarding, "completedAt">) => request<Me>("POST", "/onboarding", b),
  createMission: async (b: CreateMissionRequest) => {
    const m = await request<MissionState>("POST", "/missions", b);
    if (b.drillId) drillOf.set(m.id, b.drillId);
    return m;
  },
  getMission: (id: string) => request<MissionState>("GET", `/missions/${encodeURIComponent(id)}`),
  getEvents: (id: string, since: number) => request<EventsResponse>("GET", `/missions/${encodeURIComponent(id)}/events${q({ since })}`),
  act: (id: string, b: ActRequest) => request<ActResponse>("POST", `/missions/${encodeURIComponent(id)}/act`, b),
  finishMission: (id: string) => request<{ reportId: string; status: "processing" | "ready" }>("POST", `/missions/${encodeURIComponent(id)}/finish`, {}),
  getReport: (id: string) => request<Report>("GET", `/reports/${encodeURIComponent(id)}`),
  getTranscript: (id: string) => request<EventsResponse>("GET", `/missions/${encodeURIComponent(id)}/transcript`),
  getProgress: (roleId?: RoleId) => request<Progress>("GET", `/me/progress${q({ roleId })}`),
  getDrills: (roleId: RoleId) => request<DrillList>("GET", `/me/drills${q({ roleId })}`),
  createCohort: (b: CreateCohortRequest) => request<Cohort>("POST", "/cohorts", b),
  joinCohort: (b: JoinCohortRequest) => request<Cohort>("POST", "/cohorts/join", b),
  listCohorts: () => request<Cohort[]>("GET", "/cohorts"),
  getInsights: (id: string) => request<CohortInsights>("GET", `/cohorts/${encodeURIComponent(id)}/insights`),
  getStatus: () => request<SystemStatus>("GET", "/system/status"),
  health: () => request<{ ok: true }>("GET", "/health"),
};
