import { describe, expect, it } from "vitest";
import { initials } from "../client/src/initials";

describe("card initials", () => {
  it.each([
    ["Perennials & Groundcover", "PG"],
    ["Equisetum (Horsetail)", "EH"],
    ["Zoysia Grass", "ZG"],
    ["Azaleas & Flowering Shrubs", "AF"],
    ["Papyrus", "P"],
  ])("uses letters from meaningful words in %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
