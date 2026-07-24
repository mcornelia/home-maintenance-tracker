import { describe, expect, it } from "vitest";
import { shouldCelebrateCompletion } from "../client/src/celebration";

describe("completion celebration", () => {
  it("celebrates when the final overdue item is cleared", () => {
    expect(shouldCelebrateCompletion(1, 0)).toBe(true);
    expect(shouldCelebrateCompletion(8, 0)).toBe(true);
  });

  it("does not celebrate while overdue work remains", () => {
    expect(shouldCelebrateCompletion(8, 7)).toBe(false);
    expect(shouldCelebrateCompletion(1, 1)).toBe(false);
  });

  it("does not celebrate when the household was already caught up", () => {
    expect(shouldCelebrateCompletion(0, 0)).toBe(false);
  });
});
