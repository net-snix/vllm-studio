import { describe, expect, it } from "bun:test";
import { counterDelta } from "./metrics-collector";

describe("metrics collector counter deltas", () => {
  it("returns only forward counter movement", () => {
    expect(counterDelta(10, 17)).toBe(7);
  });

  it("treats counter resets as zero delta", () => {
    expect(counterDelta(17, 2)).toBe(0);
  });

  it("ignores non-finite values", () => {
    expect(counterDelta(Number.NaN, 2)).toBe(0);
    expect(counterDelta(2, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
