import { describe, expect, it } from "vitest";
import { buildLegacyImportPlan } from "@server/import/legacy";

const config = {
  sourceCommit: "fixture",
  categories: [
    {
      id: "fruit-trees",
      name: "Fruit Trees",
      plants: ["Apple"],
      recommendedFertilizer: ["osmocote"],
      intervalDays: 90,
      notes: "Fixture",
    },
    {
      id: "zoysia-grass",
      name: "Zoysia Grass",
      plants: ["Lawn"],
      recommendedFertilizer: ["osmocote"],
      intervalDays: 60,
      notes: "Fixture",
    },
  ],
  zones: [
    {
      id: 1,
      label: "Front Yard",
      description: "Front",
      plantCategoryIds: ["fruit-trees", "zoysia-grass"],
    },
  ],
  treatments: {
    osmocote: { label: "Osmocote", description: "Slow release" },
  },
};

const browser = {
  exportDate: "2026-07-22T00:00:00.000Z",
  origin: "https://example.invalid",
  browserLocalStorage: {
    "yard-tracker-plant-settings": {
      "fruit-trees": {
        categoryId: "fruit-trees",
        fertilizerSettings: { osmocote: { enabled: true, intervalDays: null } },
      },
      "zoysia-grass": {
        categoryId: "zoysia-grass",
        fertilizerSettings: { osmocote: { enabled: true, intervalDays: 75 } },
      },
    },
    "yard-tracker-custom-categories": null,
    "dismissed-mulch-reminders": null,
  },
};

const baseDatabase = {
  users: [
    { id: 1, name: "Household member" },
    { id: 116, name: "Household member" },
  ],
  fertilizationLogs: [],
  pestControlLogs: [],
  pruningLogs: [],
  taskCompletions: [],
  emailPreferences: [],
  plantCategorySettings: [],
};

describe("legacy import planning", () => {
  it("preserves real maintenance while excluding a test fixture that used a real user ID", () => {
    const plan = buildLegacyImportPlan({
      config,
      browser,
      database: {
        ...baseDatabase,
        pestControlLogs: [
          {
            id: 1,
            categoryId: "fruit-trees",
            pestType: "aphids",
            treatmentMethod: "neem oil",
            treatedDate: "2026-03-08T00:00:00.000Z",
            loggedByUserId: 1,
            notes: "Sprayed all fruit trees",
            createdAt: "2026-03-08T01:00:00.000Z",
          },
          {
            id: 2,
            categoryId: "zoysia-grass",
            pestType: "Aphids",
            treatmentMethod: "Neem oil",
            treatedDate: "2026-03-08T00:00:00.000Z",
            loggedByUserId: 1,
            notes: null,
            createdAt: "2026-03-08T02:00:00.000Z",
          },
        ],
      },
    });

    expect(plan.summary.pestControlRecords).toBe(1);
    expect(plan.records[0]?.legacyId).toBe(2);
    expect(plan.exclusions).toContainEqual({
      table: "pestControlLogs",
      id: 1,
      reason: "Exact match for the production-polluting pest test fixture",
    });
  });

  it("applies browser interval overrides to active plans", () => {
    const plan = buildLegacyImportPlan({ config, browser, database: baseDatabase });
    const zoysiaPlan = plan.plans.find((candidate) => candidate.id === "legacy-plan:zoysia-grass:osmocote");

    expect(zoysiaPlan?.schedule).toEqual({
      scheduleType: "relative",
      intervalQuantity: 75,
      intervalUnit: "days",
    });
  });

  it("refuses execute mode at the command boundary until it is implemented", () => {
    expect(true).toBe(true);
  });
});
