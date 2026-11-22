import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  Lang,
  Cohort,
  CohortInsights,
  Me,
  Onboarding,
  Progress,
  RoleDetail,
  RoleSummary,
  SkillDef,
  SystemStatus,
} from "@ayden/contract";
import { config } from "../config.js";
import { ApiError, act, buildFor, createMission, deltaOf, loadOwned, toState, type Deps } from "../domain/engine.js";
import { finishMission } from "../domain/lifecycle.js";
import { cohortInsights } from "../domain/privacy.js";
import { computeProgress } from "../domain/progress.js";
import { publicReport } from "../domain/report.js";
import { summarise } from "../domain/traction.js";
import type { CohortRec, RolePack, UserRec } from "../domain/types.js";
import { ROLES, getRole } from "../roles/index.js";
import { plainText } from "../infra/google-extras.js";
import { ALL_CODES, LANGUAGE_NAMES, UI_CODES } from "../infra/languages.js";
import { RateLimiter, clearSession, newUserId, readUid, requireUser, setSession } from "./auth.js";

const nowIso = () => new Date().toISOString();

const channel = z.enum(["chat", "email", "tickets", "review", "checks", "call", "system"]);
const actSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), clientSeq: z.number().int().min(0), to: z.string().min(1).max(40), channel, text: z.string().min(1).max(4000) }),
  z.object({ kind: z.literal("open_item"), clientSeq: z.number().int().min(0), itemId: z.string().min(1).max(60) }),
  z.object({ kind: z.literal("save_file"), clientSeq: z.number().int().min(0), itemId: z.string().min(1).max(60), content: z.string().max(30000) }),
  z.object({ kind: z.literal("run_checks"), clientSeq: z.number().int().min(0), itemIds: z.array(z.string()).optional() }),
  z.object({ kind: z.literal("submit_artifact"), clientSeq: z.number().int().min(0), artifactId: z.string().min(1).max(60), content: z.string().min(1).max(8000) }),
  z.object({ kind: z.literal("advance"), clientSeq: z.number().int().min(0) }),
  z.object({ kind: z.literal("finish"), clientSeq: z.number().int().min(0) }),
]);

const roleIds = ["software-engineer", "tech-consulting", "nurse", "banking-ops", "executive", "data-analyst"] as const;
const createSchema = z.object({
  roleId: z.enum(roleIds),
  missionId: z.string().max(60).optional(),
  drillId: z.string().max(60).optional(),
  mode: z.enum(["quick", "full"]).default("quick"),
  reseed: z.boolean().optional(),
});
const onboardingSchema = z.object({
  roleId: z.enum(roleIds),
  experience: z.enum(["none", "some", "internship"]),
  selfRatings: z.record(z.string(), z.number().int().min(1).max(5)),
});
const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  recommend: z.number().int().min(0).max(10),
  comment: z.string().trim().max(600).optional(),
  name: z.string().trim().max(60).optional(),
  college: z.string().trim().max(80).optional(),
  roleId: z.enum(roleIds).optional(),
  missionId: z.string().max(60).optional(),
  showPublicly: z.boolean(),
  /** a small JPEG, resized in the browser */
  photo: z.string().max(90_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/).optional(),
});
const consentSchema = z.object({ age18: z.boolean(), storeWork: z.boolean(), shareAnonymousPatterns: z.boolean() });

function skillDefs(role: RolePack): SkillDef[] {
  return role.skills.map((s) => ({ id: s.id, label: s.label, description: s.description, targetLevel: s.targetLevel, anchors: role.anchors.filter((a) => a.skillId === s.id).map((a) => a.text) }));
}

const summary = (r: RolePack): RoleSummary => ({
  id: r.id,
  title: r.title,
  tagline: r.tagline,
  domain: r.domain,
  status: r.status,
  company: r.company,
  estMinutes: r.estMinutes,
  skillCount: r.skills.length,
  icon: r.icon,
  accentHex: r.accentHex,
});

export function registerRoutes(app: FastifyInstance, deps: Deps) {
  const { store, llm } = deps;
  const actLimiter = new RateLimiter(60, 60_000);
  const guestLimiter = new RateLimiter(30, 60 * 60_000);

  const toCohort = (c: CohortRec, uid: string): Cohort => ({ id: c.id, name: c.name, code: c.code, ownerId: c.ownerId, createdAt: c.createdAt, memberCount: c.members.length, role: c.ownerId === uid ? "owner" : "member" });

  async function toMe(u: UserRec): Promise<Me> {
    const [cohorts, sessions] = await Promise.all([store.listCohortsForUser(u.id), store.listSessionsByUser(u.id)]);
    return {
      userId: u.id,
      displayName: u.displayName,
      isGuest: u.isGuest,
      language: u.language,
      consent: u.consent,
      onboardings: u.onboardings,
      cohorts: cohorts.map((c) => toCohort(c, u.id)),
      counts: {
        missionsStarted: sessions.filter((s) => s.kind === "mission").length,
        missionsCompleted: sessions.filter((s) => s.kind === "mission" && s.status === "done").length,
        drillsCompleted: sessions.filter((s) => s.kind === "drill" && s.status === "done").length,
      },
    };
  }

  /* ───────── session & profile ───────── */

  app.post("/session/guest", async (req, reply) => {
    const wait = guestLimiter.check(req.ip);
    if (wait) throw new ApiError(429, "rate_limited", "Too many new sessions from this network.", wait);
    const id = newUserId();
    const user: UserRec = { id, displayName: `Guest ${randomBytes(2).toString("hex").toUpperCase()}`, isGuest: true, language: "en", consent: null, onboardings: [], createdAt: nowIso() };
    await store.putUser(user);
    setSession(reply, id);
    return { me: await toMe(user) };
  });

  app.get("/me", async (req) => toMe(await requireUser(req, store)));

  app.patch("/me", async (req) => {
    const user = await requireUser(req, store);
    const body = z.object({ displayName: z.string().trim().min(1).max(40).optional(), language: z.enum(UI_CODES as unknown as [string, ...string[]]).optional() }).parse(req.body ?? {});
    if (body.displayName) user.displayName = body.displayName;
    if (body.language) user.language = body.language as Lang;
    await store.putUser(user);
    return toMe(user);
  });

  app.put("/me/consent", async (req) => {
    const user = await requireUser(req, store);
    const c = consentSchema.parse(req.body);
    user.consent = { ...c, acceptedAt: nowIso() };
    await store.putUser(user);
    return toMe(user);
  });

  app.get("/me/export", async (req, reply) => {
    const user = await requireUser(req, store);
    const [sessions, reports] = await Promise.all([store.listSessionsByUser(user.id), store.listReportsByUser(user.id)]);
    const missions = await Promise.all(sessions.map(async (s) => ({ id: s.id, roleId: s.roleId, kind: s.kind, status: s.status, startedAt: s.startedAt, events: await store.listEvents(s.id, 0) })));
    reply.header("content-disposition", 'attachment; filename="ayden-export.json"');
    return { generatedAt: nowIso(), data: { profile: user, missions, reports: reports.map(publicReport) } };
  });

  app.delete("/me", async (req, reply) => {
    const user = await requireUser(req, store);
    await store.deleteUserData(user.id);
    clearSession(reply);
    return { deleted: true };
  });

  /* ───────── roles ───────── */

  app.get("/roles", async () => ROLES.map(summary));

  app.get("/roles/:roleId", async (req) => {
    const role = getRole((req.params as { roleId: string }).roleId);
    if (!role) throw new ApiError(404, "not_found", "Role not found.");
    const uid = readUid(req);
    const user = uid ? await store.getUser(uid) : null;
    let rampMap: RoleDetail["rampMap"];
    if (user) {
      const reports = await store.listReportsByUser(user.id);
      rampMap = computeProgress(role, reports, [], null).rampMap;
    } else rampMap = computeProgress(role, [], [], null).rampMap;
    const detail: RoleDetail = {
      ...summary(role),
      description: role.description,
      whatYouWillPractise: role.whatYouWillPractise,
      skills: skillDefs(role),
      cast: role.cast.map((c) => ({ id: c.id, name: c.name, title: c.title, kind: c.kind, modelLabel: c.modelLabel, blurb: c.blurb })),
      missions: role.missions.map((m) => ({ id: m.id, title: m.title, kind: m.kind, estMinutes: m.estMinutes, description: m.description, skillIds: m.skillIds })),
      rampMap,
      ...(role.safetyNote ? { safetyNote: role.safetyNote } : {}),
    };
    return detail;
  });

  app.post("/onboarding", async (req) => {
    const user = await requireUser(req, store);
    const b = onboardingSchema.parse(req.body);
    const role = getRole(b.roleId);
    if (!role || role.status !== "ready") throw new ApiError(404, "not_found", "Role not available.");
    const ratings: Onboarding["selfRatings"] = {};
    for (const s of role.skills) ratings[s.id] = (b.selfRatings[s.id] ?? 3) as 1 | 2 | 3 | 4 | 5;
    user.onboardings = [...user.onboardings.filter((o) => o.roleId !== b.roleId), { roleId: b.roleId, experience: b.experience, selfRatings: ratings, completedAt: nowIso() }];
    await store.putUser(user);
    return toMe(user);
  });

  /* ───────── missions ───────── */

  app.post("/missions", async (req) => {
    const user = await requireUser(req, store);
    const body = createSchema.parse(req.body);
    return createMission(deps, user, body);
  });

  app.get("/missions/:id", async (req) => {
    const user = await requireUser(req, store);
    const s = await loadOwned(store, user.id, (req.params as { id: string }).id);
    return toState(s, buildFor(s).build);
  });

  app.get("/missions/:id/events", async (req) => {
    const user = await requireUser(req, store);
    const s = await loadOwned(store, user.id, (req.params as { id: string }).id);
    const since = Number((req.query as { since?: string }).since ?? 0) || 0;
    const { build } = buildFor(s);
    return { events: await store.listEvents(s.id, since), delta: deltaOf(s, build), pending: false, trace: await store.listTrace(s.id, 60) };
  });

  app.post("/missions/:id/act", async (req) => {
    const user = await requireUser(req, store);
    const wait = actLimiter.check(user.id);
    if (wait) throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.", wait);
    const body = actSchema.parse(req.body);
    if (body.kind === "finish") {
      const r = await finishMission(deps, user.id, (req.params as { id: string }).id);
      const s = await loadOwned(store, user.id, (req.params as { id: string }).id);
      return { accepted: true, events: [], delta: deltaOf(s, buildFor(s).build), pending: false, trace: [], reportId: r.reportId };
    }
    return act(deps, user.id, (req.params as { id: string }).id, body as never);
  });

  app.post("/missions/:id/finish", async (req) => {
    const user = await requireUser(req, store);
    return finishMission(deps, user.id, (req.params as { id: string }).id);
  });

  app.get("/missions/:id/transcript", async (req) => {
    const user = await requireUser(req, store);
    const s = await loadOwned(store, user.id, (req.params as { id: string }).id);
    if (s.status !== "done") throw new ApiError(409, "conflict", "The transcript is available after you finish.");
    const { build } = buildFor(s);
    return { events: await store.listEvents(s.id, 0), delta: deltaOf(s, build), pending: false, trace: await store.listTrace(s.id, 200) };
  });

  app.get("/reports/:id", async (req) => {
    const user = await requireUser(req, store);
    const r = await store.getReport((req.params as { id: string }).id);
    if (!r || r.uid !== user.id) throw new ApiError(404, "not_found", "Report not found.");
    return publicReport(r);
  });

  /* ───────── progress & drills ───────── */

  async function progressFor(user: UserRec, roleId: string): Promise<Progress> {
    const role = getRole(roleId);
    if (!role) throw new ApiError(404, "not_found", "Role not found.");
    const [reports, sessions] = await Promise.all([store.listReportsByUser(user.id), store.listSessionsByUser(user.id)]);
    const attempts: Progress["attempts"] = sessions
      .filter((s) => s.roleId === roleId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((s) => ({ missionId: s.id, title: role.missions.find((m) => m.id === s.defId)?.title ?? s.defId, kind: s.kind, at: s.startedAt, status: s.status, ...(s.reportId ? { reportId: s.reportId } : {}) }));
    return computeProgress(role, reports, attempts, user.onboardings.find((o) => o.roleId === roleId)?.selfRatings ?? null);
  }

  app.get("/me/progress", async (req) => {
    const user = await requireUser(req, store);
    const roleId = (req.query as { roleId?: string }).roleId ?? user.onboardings[user.onboardings.length - 1]?.roleId ?? "software-engineer";
    return progressFor(user, roleId);
  });

  app.get("/me/drills", async (req) => {
    const user = await requireUser(req, store);
    const roleId = (req.query as { roleId?: string }).roleId ?? "software-engineer";
    const p = await progressFor(user, roleId);
    return { drills: p.nextBestDrill ? [p.nextBestDrill] : [] };
  });

  /* ───────── cohorts ───────── */

  app.post("/cohorts", async (req) => {
    const user = await requireUser(req, store);
    const { name } = z.object({ name: z.string().trim().min(2).max(60) }).parse(req.body);
    const code = `${name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X")}-${randomBytes(2).toString("hex").toUpperCase()}`;
    const c: CohortRec = { id: "c_" + randomBytes(5).toString("hex"), name, code, ownerId: user.id, createdAt: nowIso(), members: [] };
    await store.putCohort(c);
    return toCohort(c, user.id);
  });

  app.post("/cohorts/join", async (req) => {
    const user = await requireUser(req, store);
    const { code } = z.object({ code: z.string().trim().min(3).max(20) }).parse(req.body);
    const c = await store.getCohortByCode(code.toUpperCase());
    if (!c) throw new ApiError(404, "not_found", "That code does not match a group.");
    if (c.ownerId !== user.id && !c.members.includes(user.id)) {
      c.members.push(user.id);
      await store.putCohort(c);
    }
    return toCohort(c, user.id);
  });

  app.get("/cohorts", async (req) => {
    const user = await requireUser(req, store);
    return (await store.listCohortsForUser(user.id)).map((c) => toCohort(c, user.id));
  });

  app.get("/cohorts/:id/insights", async (req): Promise<CohortInsights> => {
    const user = await requireUser(req, store);
    const c = await store.getCohort((req.params as { id: string }).id);
    if (!c) throw new ApiError(404, "not_found", "Group not found.");
    if (c.ownerId !== user.id) throw new ApiError(403, "forbidden", "Only the person who leads this group can see its patterns.");
    const members = await store.getUsers(c.members);
    const reports = (await Promise.all(c.members.map((m) => store.listReportsByUser(m)))).flat();
    return cohortInsights(c, members, reports);
  });

  /* ───────── Google extras: badge art, translation, speech ───────── */

  const extrasLimiter = new RateLimiter(30, 60_000);

  /** One illustration per badge. Public on purpose (not personal), bounded to the skills that exist. */
  app.get("/badges/:roleId/:skillId/art", async (req, reply) => {
    const { roleId, skillId } = req.params as { roleId: string; skillId: string };
    const role = ROLES.find((r) => r.id === roleId);
    const skill = role?.skills.find((x) => x.id === skillId);
    if (!role || !skill || !deps.extras) return reply.status(404).send({ error: { code: "not_found", message: "No art for this badge." } });
    const png = await deps.extras.badgeArt(`${role.id}__${skill.id}`, skill.badge, role.title);
    if (!png) return reply.status(404).send({ error: { code: "not_found", message: "No art for this badge." } });
    return reply.header("content-type", "image/png").header("cache-control", "public, max-age=86400").send(png);
  });

  /** A message in a mission the learner owns, by sequence number. Never accepts free text. */
  async function lineOf(req: FastifyRequest) {
    const user = await requireUser(req, store);
    const wait = extrasLimiter.check(user.id);
    if (wait !== null) throw new ApiError(429, "rate_limited", "Slow down a little.", wait);
    const body = z.object({ seq: z.number().int().min(1), lang: z.enum(ALL_CODES as unknown as [string, ...string[]]).optional(), from: z.string().max(8).optional() }).parse(req.body ?? {});
    const s = await loadOwned(store, user.id, (req.params as { id: string }).id);
    const ev = (await store.listEvents(s.id, body.seq - 1)).find((e) => e.seq === body.seq);
    if (!ev || ev.from === "system" || ev.kind === "beat" || ev.kind !== "message") throw new ApiError(404, "not_found", "That message cannot be read aloud or translated.");
    return { ev, lang: body.lang, mine: ev.from === "you", userLang: user.language };
  }

  app.post("/missions/:id/translate", async (req) => {
    const { ev, lang, userLang } = await lineOf(req);
    const target = lang ?? (userLang !== "en" ? userLang : "en");
    const text = await deps.extras?.translate(plainText(ev.body), target);
    if (!text) throw new ApiError(503, "internal", "Translation is not available right now.");
    return { seq: ev.seq, lang: target, languageName: LANGUAGE_NAMES[target] ?? target, text };
  });

  /** Translates the interface dictionary into an Indian language with Cloud Translation. Cached in Cloud Storage. */
  const i18nLimiter = new RateLimiter(20, 60 * 60_000);
  app.post("/i18n/translate", async (req) => {
    const user = await requireUser(req, store);
    const wait = i18nLimiter.check(user.id);
    if (wait !== null) throw new ApiError(429, "rate_limited", "Slow down a little.", wait);
    const body = z.object({ lang: z.enum(UI_CODES as unknown as [string, ...string[]]), strings: z.record(z.string().max(60), z.string().max(1200)) }).parse(req.body ?? {});
    if (Object.keys(body.strings).length > 600) throw new ApiError(400, "validation", "Too many strings.");
    const strings = await deps.extras?.translateDictionary(body.strings, body.lang);
    if (!strings) throw new ApiError(503, "internal", "Translation is not available right now.");
    return { lang: body.lang, strings };
  });

  app.post("/missions/:id/speech", async (req, reply) => {
    const { ev, lang } = await lineOf(req);
    if (ev.from === "you") throw new ApiError(404, "not_found", "Only colleague messages can be read aloud.");
    let text = plainText(ev.body);
    if (lang && lang !== "it") text = (await deps.extras?.translate(text, lang)) ?? text;
    const wav = await deps.extras?.speak(text, ev.from);
    if (!wav) throw new ApiError(503, "internal", "Speech is not available right now.");
    return reply.header("content-type", "audio/wav").header("cache-control", "private, max-age=3600").send(wav);
  });

  /* ───────── feedback and traction ───────── */

  const feedbackLimiter = new RateLimiter(8, 60 * 60_000);
  app.post("/feedback", async (req) => {
    const user = await requireUser(req, store);
    const wait = feedbackLimiter.check(user.id);
    if (wait !== null) throw new ApiError(429, "rate_limited", "Thanks, that is plenty of feedback for now.", wait);
    const b = feedbackSchema.parse(req.body);
    const publicOk = b.showPublicly;
    await store.putFeedback({
      id: "f_" + randomBytes(6).toString("base64url").replace(/[-_]/g, "x"),
      uid: user.id,
      createdAt: nowIso(),
      roleId: b.roleId,
      missionId: b.missionId,
      rating: b.rating,
      recommend: b.recommend,
      comment: b.comment || undefined,
      // name, college and photo are only kept when the tester agreed to show their feedback publicly
      name: publicOk ? b.name || undefined : undefined,
      college: publicOk ? b.college || undefined : undefined,
      photo: publicOk ? b.photo : undefined,
      showPublicly: publicOk,
    });
    return { ok: true };
  });

  /** Public, aggregate-only. Never returns a tester who did not agree to be shown. */
  app.get("/traction", async (_req, reply) => {
    const [items, counters] = await Promise.all([store.listFeedback(500), store.getCounters()]);
    reply.header("cache-control", "public, max-age=10");
    return summarise(items, { missionsStarted: counters.missionsStarted, missionsCompleted: counters.missionsCompleted }, { tokens: counters.tokens ?? 0, costMicros: counters.costMicros ?? 0 });
  });

  /* ───────── system ───────── */

  app.get("/system/status", async (): Promise<SystemStatus> => {
    const counters = await store.getCounters();
    const bqRows = (await deps.analytics?.totalRows?.()) ?? deps.analytics?.rowsWritten() ?? 0;
    const live = llm.live();
    const onRun = !!process.env.K_SERVICE;
    return {
      version: config.version,
      commit: config.commit,
      region: config.region,
      runtime: live ? "live" : "scripted",
      models: [
        { role: "Colleague agents", id: config.models.agent, purpose: "Manager, reviewer, QA and buddy replies through function calling" },
        { role: "Judge, Director and Weaver", id: config.models.reason, purpose: "Quote-bound judging and scenario weaving (structured output)" },
        { role: "Drill matching", id: config.models.embed, purpose: "Match each gap to the nearest drill" },
        { role: "Code checks", id: config.models.tester, purpose: "Runs learner code in Google's code-execution sandbox" },
      ],
      googleServices: [
        { name: "Gemini API", state: live ? "live" : "fallback", detail: live ? "Function calling, structured output, embeddings and code execution are on the request path" : "Model key unavailable: scripted replies are running" },
        { name: "Gemini code execution", state: live && config.sandbox === "gemini" ? "live" : "fallback", detail: "Learner code runs in Google's sandbox, never on our server" },
        { name: "Cloud Run", state: onRun ? "live" : "fallback", detail: onRun ? "Stateless container serving web and API" : "Running locally" },
        { name: "Firestore", state: store.kind === "firestore" ? "live" : "fallback", detail: store.kind === "firestore" ? "Sessions, events, reports and cohorts" : "In-memory store (local development)" },
        { name: "Secret Manager", state: process.env.SECRET_SOURCE === "secret-manager" ? "live" : "planned", detail: "Session secret (and the model key in live mode) mounted at runtime" },
        { name: "Cloud Logging", state: onRun ? "live" : "fallback", detail: "Structured logs: model, latency, verdicts. Never prompts or user text" },
        { name: "Antigravity + Agent Skills", state: process.env.ANTIGRAVITY_USED === "1" ? "live" : "planned", detail: "Used to build; standards skills live in the repo (.agents/skills)" },
        { name: "BigQuery", state: bqRows > 0 ? "live" : "planned", detail: bqRows > 0 ? `Anonymous skill-pattern rows in BigQuery (${bqRows} so far); no user ids or text` : "Anonymous analytics export (not yet written)" },
        { name: "Vertex AI image generation", state: (counters.badgeArt ?? 0) > 0 ? "live" : "planned", detail: (counters.badgeArt ?? 0) > 0 ? `Gemini image model generates one illustration per badge (${counters.badgeArt} so far), billed to our Cloud project` : "Badge illustrations (not generated yet)" },
        { name: "Cloud Storage", state: (counters.badgeArt ?? 0) > 0 ? "live" : "planned", detail: "Caches each generated badge illustration so it is made once" },
        { name: "Cloud Translation", state: (counters.translations ?? 0) > 0 ? "live" : "planned", detail: (counters.translations ?? 0) > 0 ? `Colleague messages translated to Hindi on request (${counters.translations} so far)` : "Hindi translation of a colleague's message on request" },
        { name: "Gemini speech", state: (counters.speech ?? 0) > 0 ? "live" : "planned", detail: (counters.speech ?? 0) > 0 ? `Colleague messages read aloud (${counters.speech} so far)` : "Listen to a colleague's message" },
        { name: "Cloud Monitoring", state: process.env.MONITORING === "on" ? "live" : "planned", detail: "Uptime check on /api/v1/health and log-based metrics for model fallbacks" },
        { name: "Sensitive Data Protection", state: counters.redactions > 0 ? "live" : "planned", detail: counters.redactions > 0 ? `Personal data is redacted before text reaches Gemini (${counters.redactions} calls so far)` : "Personal-data redaction before model calls (basic redaction runs today)" },
      ],
      features: { badgeArt: !!deps.extras?.artEnabled, translate: !!deps.extras?.translateEnabled, speech: !!deps.extras?.speechEnabled },
      counters,
    };
  });

  app.get("/health", async () => ({ ok: true }));
}

export type Req = FastifyRequest;
