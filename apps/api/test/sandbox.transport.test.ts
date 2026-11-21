import { describe, expect, it } from "vitest";
import { isTransportFailure } from "../src/agents/sandbox.js";

describe("isTransportFailure", () => {
  it("flags a garbled base64 payload", () => {
    const line = JSON.stringify([{ id: "load", passed: false, msg: "ValueError: string argument should contain only ASCII characters" }]);
    expect(isTransportFailure(line)).toBe(true);
  });
  it("does not retry a real failure in the learner's code", () => {
    const line = JSON.stringify([{ id: "load", passed: false, msg: "SyntaxError: invalid syntax" }]);
    expect(isTransportFailure(line)).toBe(false);
  });
  it("does not retry normal test results", () => {
    const line = JSON.stringify([{ id: "test_a", passed: false, msg: "AssertionError" }]);
    expect(isTransportFailure(line)).toBe(false);
  });
});
