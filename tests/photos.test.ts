import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import sharp from "sharp";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { registerAuthRoutes } from "../server/auth/session";
import { openDatabase, type YardTrackerDatabase } from "../server/db/client";
import { registerPhotoRoutes } from "../server/photos/routes";

let database: YardTrackerDatabase | undefined;
let testRoot: string | undefined;

afterEach(() => {
  database?.sqlite.close();
  if (testRoot) fs.rmSync(testRoot, { recursive: true, force: true });
});

describe("private household photos", () => {
  it("requires login, normalizes the image, strips metadata, and stores only private WebP files", async () => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yard-tracker-photo-test-"));
    const dataRoot = path.join(testRoot, "data");
    database = openDatabase({ NODE_ENV: "test", YARD_TRACKER_TEST_ROOT: testRoot, YARD_TRACKER_DATA_DIR: dataRoot });
    migrate(database.db, { migrationsFolder: path.resolve("drizzle") });
    database.sqlite.exec("INSERT INTO household_settings (id) VALUES (1); INSERT INTO cards (id, slug, name) VALUES ('card', 'azaleas', 'Azaleas');");
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app, database.sqlite);
    registerPhotoRoutes(app, database);
    const source = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#557744" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();

    await request(app).post("/api/cards/card/cover").attach("photo", source, "yard.jpg").expect(428);
    const household = request.agent(app);
    await household.post("/api/auth/setup").send({ passphrase: "photo-test-passphrase" }).expect(201);
    const uploaded = await household.post("/api/cards/card/cover").attach("photo", source, "yard.jpg").expect(201);

    const row = database.sqlite.prepare("SELECT stored_path AS storedPath, thumbnail_path AS thumbnailPath, mime_type AS mimeType FROM attachments WHERE id = ?").get(uploaded.body.id) as { storedPath: string; thumbnailPath: string; mimeType: string };
    expect(row.mimeType).toBe("image/webp");
    const fullPath = path.join(database.paths.uploads, row.storedPath);
    const thumbnailPath = path.join(database.paths.uploads, row.thumbnailPath);
    expect(fs.statSync(fullPath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(thumbnailPath).mode & 0o777).toBe(0o600);
    const metadata = await sharp(fullPath).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect((database.sqlite.prepare("SELECT cover_attachment_id AS id FROM cards WHERE id = 'card'").get() as { id: string }).id).toBe(uploaded.body.id);
    await household.get(`/api/attachments/${encodeURIComponent(uploaded.body.id)}/thumbnail`).expect("Content-Type", /image\/webp/).expect(200);
  });

  it("rejects non-image uploads without leaving attachment rows", async () => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yard-tracker-photo-test-"));
    const dataRoot = path.join(testRoot, "data");
    database = openDatabase({ NODE_ENV: "test", YARD_TRACKER_TEST_ROOT: testRoot, YARD_TRACKER_DATA_DIR: dataRoot });
    migrate(database.db, { migrationsFolder: path.resolve("drizzle") });
    database.sqlite.exec("INSERT INTO household_settings (id) VALUES (1); INSERT INTO cards (id, slug, name) VALUES ('card', 'azaleas', 'Azaleas');");
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app, database.sqlite);
    registerPhotoRoutes(app, database);
    const household = request.agent(app);
    await household.post("/api/auth/setup").send({ passphrase: "photo-test-passphrase" }).expect(201);
    await household.post("/api/cards/card/cover").attach("photo", Buffer.from("not a photograph"), "fake.jpg").expect(400);
    expect((database.sqlite.prepare("SELECT count(*) AS count FROM attachments").get() as { count: number }).count).toBe(0);
  });
});
