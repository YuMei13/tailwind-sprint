import { describe, expect, it } from "vitest";
import { downsampleLonLat } from "./sampling";

describe("downsampleLonLat", () => {
  it("returns [] for empty input", () => {
    expect(downsampleLonLat([], 2)).toEqual([]);
  });

  it("takes every step-th point, swaps to [lat, lon], and keeps the last point", () => {
    const coords = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]; // [lon, lat]
    const out = downsampleLonLat(coords, 2);
    expect(out).toEqual([
      [0, 0],
      [2, 2],
      [3, 3], // last point always included
    ]);
  });
});
