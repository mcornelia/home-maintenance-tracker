import path from "node:path";
import express from "express";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { registerMutationRoutes } from "../server/api/mutations";
import { registerAuthRoutes, requireSession } from "../server/auth/session";
import { readDashboard } from "../server/dashboard/read";
import { openDatabase, type YardTrackerDatabase } from "../server/db/client";

let database: YardTrackerDatabase | undefined;
afterEach(() => database?.sqlite.close());

function testApplication() {
  database = openDatabase({ NODE_ENV: "test", YARD_TRACKER_DATA_DIR: ":memory:" });
  migrate(database.db, { migrationsFolder: path.resolve("drizzle") });
  database.sqlite.prepare("INSERT INTO household_settings (id) VALUES (1)").run();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, database.sqlite);
  app.get("/api/dashboard", requireSession(database.sqlite), (_request, response) => response.json(readDashboard(database!.sqlite, new Date("2026-07-22T16:00:00Z"))));
  registerMutationRoutes(app, database.sqlite);
  return app;
}

describe("household login and protected editing", () => {
  it("blocks household data and writes until a passphrase session exists", async () => {
    const app = testApplication();
    expect((await request(app).get("/api/auth/status")).body).toEqual({ configured: false, authenticated: false });
    expect((await request(app).get("/api/dashboard")).status).toBe(428);
    expect((await request(app).post("/api/cards").send({ name: "Azaleas", locationIds: [] })).status).toBe(428);

    const household = request.agent(app);
    expect((await household.post("/api/auth/setup").send({ passphrase: "shared garden phrase" })).status).toBe(201);
    expect((await household.get("/api/auth/status")).body).toEqual({ configured: true, authenticated: true });
    expect((await request(app).get("/api/dashboard")).status).toBe(401);
  });

  it("creates a card and plan, logs work, and recalculates the dashboard", async () => {
    const app = testApplication();
    const household = request.agent(app);
    await household.post("/api/auth/setup").send({ passphrase: "shared garden phrase" }).expect(201);
    const location = await household.post("/api/locations").send({ name: "Front" }).expect(201);
    const card = await household.post("/api/cards").send({
      name: "Main Kitchen Dishwasher",
      area: "household",
      category: "kitchen",
      description: "Main kitchen",
      locationIds: [location.body.id],
      enabled: true,
    }).expect(201);
    const plan = await household.post(`/api/cards/${encodeURIComponent(card.body.id)}/plans`).send({
      name: "Osmocote",
      actionType: "osmocote",
      enabled: true,
      includeInDigest: true,
      schedule: { scheduleType: "relative", intervalQuantity: 90, intervalUnit: "days" },
    }).expect(201);
    await household.post(`/api/plans/${encodeURIComponent(plan.body.id)}/complete`).send({ completedOn: "2026-07-22", notes: "Applied to all plants" }).expect(201);

    const dashboard = await household.get("/api/dashboard").expect(200);
    expect(dashboard.body.cards[0]).toMatchObject({
      name: "Main Kitchen Dishwasher",
      area: "household",
      category: "kitchen",
      locationNames: ["Front"],
      state: "upcoming",
      nextDueOn: "2026-10-20",
    });
    expect(dashboard.body.recentActivity[0]).toMatchObject({ planName: "Osmocote", notes: "Applied to all plants" });
  });

  it("saves digest recipients, cadence, and retained-backup settings", async () => {
    const app = testApplication();
    const household = request.agent(app);
    await household.post("/api/auth/setup").send({ passphrase: "shared garden phrase" }).expect(201);
    await household.put("/api/settings").send({
      digestCadence: "monthly",
      digestDay: 15,
      digestLocalTime: "08:30",
      notificationRecipients: ["First@Example.com", "second@example.com", "first@example.com"],
      backupDestination: "/Volumes/Household/Backups/Yard Tracker",
      backupRetentionDays: 30,
    }).expect(204);

    const dashboard = await household.get("/api/dashboard").expect(200);
    expect(dashboard.body.household).toMatchObject({
      digestCadence: "monthly",
      digestDay: 15,
      digestLocalTime: "08:30",
      backupDestination: "/Volumes/Household/Backups/Yard Tracker",
      backupRetentionDays: 30,
    });
    expect(dashboard.body.notificationRecipients).toEqual(["first@example.com", "second@example.com"]);
    await household.put("/api/settings").send({ digestCadence: "weekly", digestDay: 12 }).expect(400);
  });

  it("rejects an incorrect passphrase and revokes a logged-out session", async () => {
    const app = testApplication();
    const household = request.agent(app);
    await household.post("/api/auth/setup").send({ passphrase: "shared garden phrase" }).expect(201);
    await request(app).post("/api/auth/login").send({ passphrase: "definitely wrong" }).expect(401);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await request(app).post("/api/auth/login").send({ passphrase: "still wrong" }).expect(401);
    }
    await request(app).post("/api/auth/login").send({ passphrase: "still wrong" }).expect(429);
    await household.post("/api/auth/logout").expect(204);
    await household.get("/api/dashboard").expect(401);
  });
});
