import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { registerRoutes } from "./api/routes.js";
import { createLlm, type LlmClient } from "./agents/llm.js";
import { makeRunner } from "./agents/sandbox.js";
import { config } from "./config.js";
import { ApiError, type Deps } from "./domain/engine.js";
import { FirestoreStore } from "./infra/firestore.js";
import { error as logError } from "./infra/log.js";
import { MemoryStore, type Store } from "./infra/store.js";

export function createStore(): Store {
  return config.store === "firestore" ? new FirestoreStore(config.project, config.firestoreDatabase) : new MemoryStore();
}

export async function buildApp(opts: { store?: Store; llm?: LlmClient } = {}) {
  const store = opts.store ?? createStore();
  const llm = opts.llm ?? createLlm(store);
  const deps: Deps = { store, llm, runner: makeRunner(llm) };
  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 256 * 1024 });
  await app.register(cookie);

  app.addHook("onSend", async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "DENY");
    reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    if (_req.url.startsWith("/api/")) reply.header("cache-control", "no-store");
  });

  app.setErrorHandler((err: unknown, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof ApiError) return reply.status(err.status).send({ error: { code: err.code, message: err.message, ...(err.retryAfterMs ? { retryAfterMs: err.retryAfterMs } : {}) } });
    if (err instanceof ZodError) return reply.status(400).send({ error: { code: "validation", message: "That request was not valid.", details: err.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) } });
    const fe = err as { statusCode?: number; message?: string };
    if (fe.statusCode && fe.statusCode < 500) return reply.status(fe.statusCode).send({ error: { code: "validation", message: fe.message ?? "Bad request" } });
    logError("unhandled error", { error: String((err as Error).message).slice(0, 200) });
    return reply.status(500).send({ error: { code: "internal", message: "Something went wrong. Try again." } });
  });

  await app.register(async (api) => registerRoutes(api, deps), { prefix: "/api/v1" });

  const webDir = config.webDir ? resolve(config.webDir) : resolve(process.cwd(), "apps/web/dist");
  if (existsSync(resolve(webDir, "index.html"))) {
    await app.register(fastifyStatic, { root: webDir, wildcard: false });
    app.get("/*", async (req, reply) => {
      if (req.url.startsWith("/api/")) return reply.status(404).send({ error: { code: "not_found", message: "Not found" } });
      return reply.sendFile("index.html");
    });
  } else {
    app.get("/", async (_req, reply) => reply.type("text/html").send("<!doctype html><title>Ayden API</title><body style='font-family:sans-serif;padding:2rem'><h1>Ayden API</h1><p>The web app has not been built into this server yet. API is at <code>/api/v1</code>. <a href='/api/v1/system/status'>Status</a></p></body>"));
  }
  return { app, deps };
}
