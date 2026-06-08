import { describe, expect, it } from "vitest";
import { haversine, sampleByDistance } from "./geo";

describe("haversine", () => {
  it("returns 0 for identical points", () => {
    expect(haversine([121.5, 25.0], [121.5, 25.0])).toBe(0);
  });

  it("measures ~111km for one degree of latitude", () => {
    const d = haversine([0, 0], [0, 1]);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it("is symmetric", () => {
    const a: [number, number] = [121.5, 25.0];
    const b: [number, number] = [121.6, 25.1];
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 6);
  });
});

describe("sampleByDistance", () => {
  it("returns [] for fewer than two coords", () => {
    expect(sampleByDistance([], 100)).toEqual([]);
    expect(sampleByDistance([[0, 0]], 100)).toEqual([]);
  });

  it("emits points in [lat, lon] order and includes the endpoints", () => {
    const coords = [
      [0, 0],
      [0, 1],
    ]; // [lon, lat]
    const out = sampleByDistance(coords, 111_195);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([1, 0]); // [lat, lon] of [lon=0, lat=1]
    expect(out.length).toBeGreaterThanOrEqual(2);
  });
});
