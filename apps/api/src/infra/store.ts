import type { MissionEvent, TraceEntry } from "@ayden/contract";
import type { CohortRec, FeedbackRec, Session, StoredReport, UserRec } from "../domain/types.js";

export interface Counters {
  missionsStarted: number;
  missionsCompleted: number;
  modelCalls: number;
  fallbacks: number;
  quotesVerified: number;
  quotesRejected: number;
  redactions: number;
  badgeArt: number;
  translations: number;
  speech: number;
  /** Gemini tokens used (input + output), measured from each response. */
  tokens: number;
  /** AI cost in micro-dollars (1,000,000 = $1) at the published paid-tier list prices. */
  costMicros: number;
  /** Missions finished since token counting began, the denominator for cost per mission. */
  measuredMissions: number;
  /** Page loads of the site (first-party, no cookies, no IPs, bots excluded). */
  visits: number;
  /** Browsers seen for the first time (a flag kept on the device, not an id). */
  uniqueVisitors: number;
}

export interface Store {
  readonly kind: "memory" | "firestore";
  getUser(id: string): Promise<UserRec | null>;
  putUser(u: UserRec): Promise<void>;
  deleteUserData(uid: string): Promise<void>;

  getSession(id: string): Promise<Session | null>;
  putSession(s: Session): Promise<void>;
  listSessionsByUser(uid: string): Promise<Session[]>;

  appendEvents(sessionId: string, events: MissionEvent[]): Promise<void>;
  listEvents(sessionId: string, sinceSeq: number): Promise<MissionEvent[]>;
  appendTrace(sessionId: string, entries: TraceEntry[]): Promise<void>;
  listTrace(sessionId: string, limit: number): Promise<TraceEntry[]>;

  putReport(r: StoredReport): Promise<void>;
  getReport(id: string): Promise<StoredReport | null>;
  listReportsByUser(uid: string): Promise<StoredReport[]>;

  putCohort(c: CohortRec): Promise<void>;
  getCohort(id: string): Promise<CohortRec | null>;
  getCohortByCode(code: string): Promise<CohortRec | null>;
  listCohortsForUser(uid: string): Promise<CohortRec[]>;
  getUsers(ids: string[]): Promise<UserRec[]>;

  putFeedback(f: FeedbackRec): Promise<void>;
  /** Newest first. */
  listFeedback(limit: number): Promise<FeedbackRec[]>;
  /** Admin removal only. Feedback can be removed, never added or edited, by an admin. */
  deleteFeedback(id: string): Promise<boolean>;

  incr(counter: keyof Counters, by?: number): Promise<void>;
  getCounters(): Promise<Counters>;
}

export const emptyCounters = (): Counters => ({
  missionsStarted: 0,
  missionsCompleted: 0,
  modelCalls: 0,
  fallbacks: 0,
  quotesVerified: 0,
  quotesRejected: 0,
  redactions: 0,
  badgeArt: 0,
  translations: 0,
  speech: 0,
  tokens: 0,
  costMicros: 0,
  measuredMissions: 0,
  visits: 0,
  uniqueVisitors: 0,
});

/** In-memory store: used by tests and local dev. Data is lost on restart. */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  users = new Map<string, UserRec>();
  sessions = new Map<string, Session>();
  events = new Map<string, MissionEvent[]>();
  traces = new Map<string, TraceEntry[]>();
  reports = new Map<string, StoredReport>();
  cohorts = new Map<string, CohortRec>();
  feedback = new Map<string, FeedbackRec>();
  counters = emptyCounters();

  async getUser(id: string) {
    return clone(this.users.get(id) ?? null);
  }
  async putUser(u: UserRec) {
    this.users.set(u.id, clone(u)!);
  }
  async deleteUserData(uid: string) {
    this.users.delete(uid);
    for (const [id, s] of this.sessions) {
      if (s.uid === uid) {
        this.sessions.delete(id);
        this.events.delete(id);
        this.traces.delete(id);
      }
    }
    for (const [id, r] of this.reports) if (r.uid === uid) this.reports.delete(id);
    for (const [id, f] of this.feedback) if (f.uid === uid) this.feedback.delete(id);
    for (const [id, c] of this.cohorts) {
      if (c.ownerId === uid) this.cohorts.delete(id);
      else c.members = c.members.filter((m) => m !== uid);
    }
  }
  async getSession(id: string) {
    return clone(this.sessions.get(id) ?? null);
  }
  async putSession(s: Session) {
    this.sessions.set(s.id, clone(s)!);
  }
  async listSessionsByUser(uid: string) {
    return [...this.sessions.values()].filter((s) => s.uid === uid).map((s) => clone(s)!);
  }
  async appendEvents(sessionId: string, events: MissionEvent[]) {
    const list = this.events.get(sessionId) ?? [];
    list.push(...events.map((e) => clone(e)!));
    this.events.set(sessionId, list);
  }
  async listEvents(sessionId: string, sinceSeq: number) {
    return (this.events.get(sessionId) ?? []).filter((e) => e.seq > sinceSeq).map((e) => clone(e)!);
  }
  async appendTrace(sessionId: string, entries: TraceEntry[]) {
    const list = this.traces.get(sessionId) ?? [];
    list.push(...entries.map((e) => clone(e)!));
    this.traces.set(sessionId, list);
  }
  async listTrace(sessionId: string, limit: number) {
    return (this.traces.get(sessionId) ?? []).slice(-limit).map((e) => clone(e)!);
  }
  async putReport(r: StoredReport) {
    this.reports.set(r.id, clone(r)!);
  }
  async getReport(id: string) {
    return clone(this.reports.get(id) ?? null);
  }
  async listReportsByUser(uid: string) {
    return [...this.reports.values()].filter((r) => r.uid === uid).map((r) => clone(r)!);
  }
  async putCohort(c: CohortRec) {
    this.cohorts.set(c.id, clone(c)!);
  }
  async getCohort(id: string) {
    return clone(this.cohorts.get(id) ?? null);
  }
  async getCohortByCode(code: string) {
    return clone([...this.cohorts.values()].find((c) => c.code === code) ?? null);
  }
  async listCohortsForUser(uid: string) {
    return [...this.cohorts.values()].filter((c) => c.ownerId === uid || c.members.includes(uid)).map((c) => clone(c)!);
  }
  async getUsers(ids: string[]) {
    return ids.map((i) => this.users.get(i)).filter(Boolean).map((u) => clone(u!)!);
  }
  async putFeedback(f: FeedbackRec) {
    this.feedback.set(f.id, clone(f)!);
  }
  async deleteFeedback(id: string) {
    return this.feedback.delete(id);
  }
  async listFeedback(limit: number) {
    return [...this.feedback.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((f) => clone(f)!);
  }
  async incr(counter: keyof Counters, by = 1) {
    this.counters[counter] += by;
  }
  async getCounters() {
    return { ...this.counters };
  }
}

function clone<T>(v: T): T {
  return v === null || v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}
