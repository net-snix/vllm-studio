import { describe, expect, it } from "bun:test";
import { counterDelta } from "./metrics-collector";
import { parseDs4ThroughputFromLines } from "../log-throughput";

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

describe("DS4 log throughput parsing", () => {
  it("extracts prefill, generation, and TTFT from completed DS4 requests", () => {
    const sample = parseDs4ThroughputFromLines([
      "0519 11:54:56 ds4-server: chat ctx=0..2676:2676 prefill chunk 2676/2676 (100.0%) chunk=298.90 t/s avg=300.15 t/s 8.916s",
      "0519 11:54:56 ds4-server: chat ctx=0..2676:2676 prompt done 8.916s",
      "0519 11:55:10 ds4-server: chat ctx=3426..3447:21 gen=771 decoding chunk=54.82 t/s avg=54.90 t/s 14.044s",
    ]);

    expect(sample).toMatchObject({
      promptTps: 300.15,
      generationTps: 54.9,
      ttftMs: 8916,
    });
  });

  it("uses DS4 chunk prefill throughput when resumed prefill reports avg zero", () => {
    const sample = parseDs4ThroughputFromLines([
      "0519 12:01:03 ds4-server: chat ctx=16277..25555:9278 TOOLS prefill chunk 0/9278 (0.0%) chunk=303.06 t/s avg=0.00 t/s 6.758s",
    ]);

    expect(sample).toMatchObject({
      promptTps: 303.06,
      generationTps: 0,
      ttftMs: 0,
    });
  });
});
