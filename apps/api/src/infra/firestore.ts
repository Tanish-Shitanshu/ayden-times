import { FieldValue, Firestore } from "@google-cloud/firestore";
import type { MissionEvent, TraceEntry } from "@ayden/contract";
import type { CohortRec, FeedbackRec, Session, StoredReport, UserRec } from "../domain/types.js";
import { emptyCounters, type Counters, type Store } from "./store.js";

/** Firestore-backed store (production). Only the API service account touches these collections. */
export class FirestoreStore implements Store {
  readonly kind = "firestore" as const;
  private db: Firestore;

  constructor(projectId: string, databaseId = "(default)") {
    this.db = new Firestore({ projectId, databaseId, ignoreUndefinedProperties: true });
  }

  private col(name: string) {
    return this.db.collection(name);
  }

  async getUser(id: string) {
    const d = await this.col("users").doc(id).get();
    return d.exists ? (d.data() as UserRec) : null;
  }
  async putUser(u: UserRec) {
    await this.col("users").doc(u.id).set(u);
  }

  private async deleteCollection(ref: FirebaseFirestore.CollectionReference) {
    const snap = await ref.limit(400).get();
    if (snap.empty) return;
    const batch = this.db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size === 400) await this.deleteCollection(ref);
  }

  async deleteUserData(uid: string) {
    const sessions = await this.col("sessions").where("uid", "==", uid).get();
    for (const s of sessions.docs) {
      await this.deleteCollection(s.ref.collection("events"));
      await this.deleteCollection(s.ref.collection("trace"));
      await s.ref.delete();
    }
    const reports = await this.col("reports").where("uid", "==", uid).get();
    await Promise.all(reports.docs.map((d) => d.ref.delete()));
    const feedback = await this.col("feedback").where("uid", "==", uid).get();
    await Promise.all(feedback.docs.map((d) => d.ref.delete()));
    const owned = await this.col("cohorts").where("ownerId", "==", uid).get();
    await Promise.all(owned.docs.map((d) => d.ref.delete()));
    const member = await this.col("cohorts").where("members", "array-contains", uid).get();
    await Promise.all(member.docs.map((d) => d.ref.update({ members: FieldValue.arrayRemove(uid) })));
    await this.col("users").doc(uid).delete();
  }

  async getSession(id: string) {
    const d = await this.col("sessions").doc(id).get();
    return d.exists ? (d.data() as Session) : null;
  }
  async putSession(s: Session) {
    await this.col("sessions").doc(s.id).set(s);
  }
  async listSessionsByUser(uid: string) {
    const snap = await this.col("sessions").where("uid", "==", uid).get();
    return snap.docs.map((d) => d.data() as Session);
  }

  async appendEvents(sessionId: string, events: MissionEvent[]) {
    if (!events.length) return;
    const batch = this.db.batch();
    const ref = this.col("sessions").doc(sessionId).collection("events");
    for (const e of events) batch.set(ref.doc(String(e.seq).padStart(6, "0")), e);
    await batch.commit();
  }
  async listEvents(sessionId: string, sinceSeq: number) {
    const snap = await this.col("sessions").doc(sessionId).collection("events").where("seq", ">", sinceSeq).orderBy("seq").get();
    return snap.docs.map((d) => d.data() as MissionEvent);
  }
  async appendTrace(sessionId: string, entries: TraceEntry[]) {
    if (!entries.length) return;
    const batch = this.db.batch();
    const ref = this.col("sessions").doc(sessionId).collection("trace");
    for (const e of entries) batch.set(ref.doc(e.id), e);
    await batch.commit();
  }
  async listTrace(sessionId: string, limit: number) {
    const snap = await this.col("sessions").doc(sessionId).collection("trace").orderBy("at", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data() as TraceEntry).reverse();
  }

  async putReport(r: StoredReport) {
    await this.col("reports").doc(r.id).set(r);
  }
  async getReport(id: string) {
    const d = await this.col("reports").doc(id).get();
    return d.exists ? (d.data() as StoredReport) : null;
  }
  async listReportsByUser(uid: string) {
    const snap = await this.col("reports").where("uid", "==", uid).get();
    return snap.docs.map((d) => d.data() as StoredReport);
  }

  async putCohort(c: CohortRec) {
    await this.col("cohorts").doc(c.id).set(c);
  }
  async getCohort(id: string) {
    const d = await this.col("cohorts").doc(id).get();
    return d.exists ? (d.data() as CohortRec) : null;
  }
  async getCohortByCode(code: string) {
    const snap = await this.col("cohorts").where("code", "==", code).limit(1).get();
    return snap.empty ? null : (snap.docs[0]!.data() as CohortRec);
  }
  async listCohortsForUser(uid: string) {
    const [owned, member] = await Promise.all([
      this.col("cohorts").where("ownerId", "==", uid).get(),
      this.col("cohorts").where("members", "array-contains", uid).get(),
    ]);
    const map = new Map<string, CohortRec>();
    [...owned.docs, ...member.docs].forEach((d) => map.set(d.id, d.data() as CohortRec));
    return [...map.values()];
  }
  async getUsers(ids: string[]) {
    const out: UserRec[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      const docs = await Promise.all(chunk.map((id) => this.col("users").doc(id).get()));
      docs.forEach((d) => d.exists && out.push(d.data() as UserRec));
    }
    return out;
  }

  async putFeedback(f: FeedbackRec) {
    await this.col("feedback").doc(f.id).set(f);
  }
  async deleteFeedback(id: string) {
    const ref = this.col("feedback").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }
  async listFeedback(limit: number) {
    const snap = await this.col("feedback").orderBy("createdAt", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data() as FeedbackRec);
  }

  async incr(counter: keyof Counters, by = 1) {
    await this.col("counters").doc("global").set({ [counter]: FieldValue.increment(by) }, { merge: true });
  }
  async getCounters() {
    const d = await this.col("counters").doc("global").get();
    return { ...emptyCounters(), ...(d.exists ? (d.data() as Partial<Counters>) : {}) };
  }
}
