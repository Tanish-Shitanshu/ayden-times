import { describe, expect, it } from "vitest";
import { summarise } from "../src/domain/traction.js";
import type { FeedbackRec } from "../src/domain/types.js";
import { setup } from "./helpers.js";

const f = (over: Partial<FeedbackRec>): FeedbackRec => ({ id: "f_" + Math.random(), uid: "u1", createdAt: "2026-11-22T10:00:00.000Z", rating: 5, recommend: 9, showPublicly: false, ...over });
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

describe("traction summary", () => {
  it("shows nothing it should not", () => {
    const s = summarise([f({ comment: "Loved the nurse scenario a lot", name: "Asha", showPublicly: false }), f({ uid: "u2", comment: "Great for placements", name: "Ravi", college: "SNU", showPublicly: true, photo: JPEG })], { missionsStarted: 5, missionsCompleted: 3 });
    expect(s.wall.length).toBe(1);
    expect(s.wall[0]!.name).toBe("Ravi");
    expect(s.feedbackCount).toBe(2);
    expect(s.testers).toBe(2);
    expect(JSON.stringify(s)).not.toContain("Asha");
  });
  it("computes the average and NPS only with enough answers", () => {
    const few = summarise([f({}), f({})], { missionsStarted: 0, missionsCompleted: 0 });
    expect(few.avgRating).toBe(5);
    expect(few.nps).toBeNull();
    const many = summarise([9, 10, 10, 8, 3].map((r, i) => f({ uid: "u" + i, recommend: r })), { missionsStarted: 0, missionsCompleted: 0 });
    expect(many.nps).toBe(40);
  });
  it("is empty and honest with no feedback", () => {
    const s = summarise([], { missionsStarted: 0, missionsCompleted: 0 });
    expect(s.avgRating).toBeNull();
    expect(s.wall).toEqual([]);
  });
});

describe("feedback endpoints", () => {
  it("stores feedback, keeps private details private, and serves a public summary", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("software-engineer", {});
    const a = await c.call("POST", "/feedback", { rating: 5, recommend: 10, comment: "Felt like a real first day at work", showPublicly: false, name: "Hidden Person", college: "Secret College", photo: JPEG, roleId: "software-engineer" });
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    const pub = (await client().call("GET", "/traction")).body;
    expect(pub.feedbackCount).toBe(1);
    expect(pub.wall.length).toBe(0);
    expect(JSON.stringify(pub)).not.toMatch(/Hidden Person|Secret College|base64/);
    const c2 = client();
    await c2.enroll("nurse", {});
    await c2.call("POST", "/feedback", { rating: 4, recommend: 9, comment: "The privacy trap taught me something", showPublicly: true, name: "Meera", college: "St. Anne's", photo: JPEG, roleId: "nurse" });
    const pub2 = (await client().call("GET", "/traction")).body;
    expect(pub2.wall.length).toBe(1);
    expect(pub2.wall[0].name).toBe("Meera");
    expect(pub2.wall[0].photo).toBe(JPEG);
    expect(pub2.avgRating).toBe(4.5);
  });
  it("rejects bad input", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("nurse", {});
    expect((await c.call("POST", "/feedback", { rating: 9, recommend: 5, showPublicly: false })).status).toBe(400);
    expect((await c.call("POST", "/feedback", { rating: 3, recommend: 5, showPublicly: true, photo: "data:text/html;base64,PHNjcmlwdD4=" })).status).toBe(400);
    expect((await client().call("POST", "/feedback", { rating: 3, recommend: 5, showPublicly: false })).status).toBe(401);
  });
});
