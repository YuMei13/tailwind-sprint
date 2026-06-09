import { describe, expect, it } from "vitest";
import { degToCompass, routeWindAngleToColor, windToColor } from "./wind";

describe("windToColor", () => {
  it("maps speed bands to the legend colors", () => {
    expect(windToColor(0)).toBe("#22c55e"); // green
    expect(windToColor(3)).toBe("#eab308"); // boundary -> yellow
    expect(windToColor(7)).toBe("#f97316"); // orange
    expect(windToColor(12)).toBe("#ef4444"); // red
  });
});

describe("degToCompass", () => {
  it("maps cardinal directions", () => {
    expect(degToCompass(0)).toBe("N");
    expect(degToCompass(90)).toBe("E");
    expect(degToCompass(180)).toBe("S");
    expect(degToCompass(270)).toBe("W");
  });

  it("wraps around 360", () => {
    expect(degToCompass(360)).toBe("N");
  });
});

describe("routeWindAngleToColor", () => {
  it("colors by route-vs-wind angle", () => {
    expect(routeWindAngleToColor(0)).toBe("#2563eb"); // tailwind-ish
    expect(routeWindAngleToColor(90)).toBe("#f97316"); // crosswind-ish
    expect(routeWindAngleToColor(180)).toBe("#ef4444"); // headwind-ish
  });
});
