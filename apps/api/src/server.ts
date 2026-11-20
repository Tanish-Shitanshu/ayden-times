import { buildApp } from "./app.js";
import { config } from "./config.js";
import { info } from "./infra/log.js";

const { app, deps } = await buildApp();
await app.listen({ port: config.port, host: "0.0.0.0" });
info("ayden api listening", { port: config.port, store: deps.store.kind, llm: deps.llm.live() ? "live" : "scripted", sandbox: config.sandbox, version: config.version });
