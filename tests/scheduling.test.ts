import { describe, expect, it } from "vitest";
import { addToDate, calculateDue } from "../shared/scheduling";

describe("date-only schedule calculations", () => {
  it("adds calendar days across DST without a time-of-day rollover", () => {
    expect(addToDate("2026-03-07", 2, "days")).toBe("2026-03-09");
    expect(addToDate("2026-11-01", 1, "days")).toBe("2026-11-02");
  });

  it("clamps month and year intervals to valid calendar dates", () => {
    expect(addToDate("2026-01-31", 1, "months")).toBe("2026-02-28");
    expect(addToDate("2024-02-29", 1, "years")).toBe("2025-02-28");
  });

  it("resets a relative schedule from the actual latest completion", () => {
    expect(
      calculateDue({
        schedule: { scheduleType: "relative", intervalQuantity: 90, intervalUnit: "days" },
        completions: [{ completedOn: "2026-03-08" }, { completedOn: "2026-06-04" }],
        today: "2026-08-20",
      }),
    ).toEqual({ state: "due_soon", dueOn: "2026-09-02" });
  });

  it("leaves a relative plan unscheduled without history or a first due date", () => {
    expect(
      calculateDue({
        schedule: { scheduleType: "relative", intervalQuantity: 90, intervalUnit: "days" },
        today: "2026-07-22",
      }),
    ).toEqual({ state: "unscheduled", dueOn: null });
  });

  it("keeps fixed seasonal dates anchored after a completion", () => {
    expect(
      calculateDue({
        schedule: { scheduleType: "fixed", fixedDates: ["03-15", "09-15"] },
        completions: [{ completedOn: "2026-03-10", satisfiesDueOn: "2026-03-15" }],
        today: "2026-03-16",
      }),
    ).toEqual({ state: "upcoming", dueOn: "2026-09-15" });
  });

  it("surfaces the latest missed fixed occurrence", () => {
    expect(
      calculateDue({
        schedule: { scheduleType: "fixed", fixedDates: ["03-15", "09-15"] },
        today: "2026-10-01",
      }),
    ).toEqual({ state: "overdue", dueOn: "2026-09-15" });
  });

  it("completes one-time work and pauses disabled work", () => {
    expect(
      calculateDue({
        schedule: { scheduleType: "one_time", oneTimeDueOn: "2026-07-22" },
        completions: [{ completedOn: "2026-07-20" }],
        today: "2026-07-22",
      }),
    ).toEqual({ state: "completed", dueOn: "2026-07-22" });
    expect(
      calculateDue({
        schedule: { scheduleType: "one_time", oneTimeDueOn: "2026-07-22" },
        today: "2026-07-22",
        enabled: false,
      }),
    ).toEqual({ state: "paused", dueOn: null });
  });
});
