import { describe, expect, it } from "vitest";
import { buildKey } from "./cache";

describe("buildKey", () => {
  it("prefixes the key", () => {
    expect(buildKey("geo", "taipei")).toMatch(/^geo:/);
  });

  it("is deterministic for equal payloads", () => {
    expect(buildKey("x", { a: 1, b: 2 })).toBe(buildKey("x", { a: 1, b: 2 }));
  });

  it("differs when the payload differs", () => {
    expect(buildKey("x", { a: 1 })).not.toBe(buildKey("x", { a: 2 }));
  });

  it("treats a string payload like its JSON-equivalent caller", () => {
    expect(buildKey("x", "abc")).not.toBe(buildKey("x", "abd"));
  });
});
