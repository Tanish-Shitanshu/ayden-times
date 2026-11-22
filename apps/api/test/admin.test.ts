import { afterEach, describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { setup } from "./helpers.js";

const TOKEN = "test-admin-token-123456";

describe("Admin feedback review", () => {
  afterEach(() => { (config as { adminToken: string }).adminToken = ""; });

  it("does not exist unless a token is configured", async () => {
    const { app } = await setup();
    const r = await app.inject({ method: "GET", url: "/api/v1/admin/feedback", headers: { "x-admin-token": TOKEN } });
    expect(r.statusCode).toBe(404);
  });

  it("needs the token, lists feedback, and can remove (never add) a response", async () => {
    (config as { adminToken: string }).adminToken = TOKEN;
    const { app, client } = await setup();
    const c = client();
    await c.enroll("software-engineer", {});
    const post = await c.call("POST", "/feedback", { rating: 4, recommend: 8, comment: "Useful rehearsal", name: "Asha", college: "Test College", showPublicly: true });
    expect(post.status).toBe(200);

    expect((await app.inject({ method: "GET", url: "/api/v1/admin/feedback" })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/admin/feedback", headers: { "x-admin-token": "wrong-token-wrong-token" } })).statusCode).toBe(403);

    const list = await app.inject({ method: "GET", url: "/api/v1/admin/feedback", headers: { "x-admin-token": TOKEN } });
    expect(list.statusCode).toBe(200);
    const items = JSON.parse(list.body).items as { id: string; comment: string }[];
    expect(items.length).toBe(1);
    expect(items[0]!.comment).toBe("Useful rehearsal");

    expect((await app.inject({ method: "POST", url: "/api/v1/admin/feedback", headers: { "x-admin-token": TOKEN }, payload: {} })).statusCode).toBe(404);

    const del = await app.inject({ method: "DELETE", url: `/api/v1/admin/feedback/${items[0]!.id}`, headers: { "x-admin-token": TOKEN } });
    expect(del.statusCode).toBe(200);
    const after = JSON.parse((await app.inject({ method: "GET", url: "/api/v1/admin/feedback", headers: { "x-admin-token": TOKEN } })).body).items;
    expect(after.length).toBe(0);
    const tr = (await c.call("GET", "/traction")).body as { testers?: number; responses?: number };
    expect(JSON.stringify(tr)).not.toContain("Useful rehearsal");
  });
});
