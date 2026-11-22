import { ApiError, buildFor, deltaOf, loadOwned, type Deps } from "./engine.js";
import { buildReport } from "./report.js";

/** Finish a mission: judge it and store the private report. */
export async function finishMission(deps: Deps, uid: string, id: string): Promise<{ reportId: string; status: "ready" | "processing" }> {
  const { store } = deps;
  const session = await loadOwned(store, uid, id);
  if (session.status === "done" && session.reportId) return { reportId: session.reportId, status: "ready" };
  const { role, build } = buildFor(session);
  if (!deltaOf(session, build).canFinish) throw new ApiError(409, "conflict", "Finish the objective before you finish the mission.");
  const user = await store.getUser(uid);
  if (!user) throw new ApiError(401, "unauthenticated", "Your session ended.");
  session.status = "judging";
  await store.putSession(session);
  const events = await store.listEvents(session.id, 0);
  const report = await buildReport(deps, { session, build, role, events, user });
  await store.putReport(report);
  void deps.analytics?.recordCompletion(report);
  session.status = "done";
  session.reportId = report.id;
  await store.putSession(session);
  await store.incr("missionsCompleted");
  await store.incr("measuredMissions");
  return { reportId: report.id, status: "ready" };
}
