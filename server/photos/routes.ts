import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { requireSession } from "../auth/session";
import type { YardTrackerDatabase } from "../db/client";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 2 },
});

function safeFilename(value: string): string {
  return path.basename(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "photo";
}

function safeStoredPath(root: string, storedPath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, storedPath);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Unsafe attachment path");
  return resolved;
}

async function normalizePhoto(database: YardTrackerDatabase, file: Express.Multer.File, input: { cardId: string; recordId?: string | null; cover: boolean }) {
  const id = `attachment:${nanoid()}`;
  const relativeDirectory = id.replace(":", "-");
  const directory = safeStoredPath(database.paths.uploads, relativeDirectory);
  const fullRelative = path.join(relativeDirectory, "full.webp");
  const thumbnailRelative = path.join(relativeDirectory, "thumbnail.webp");
  const fullPath = safeStoredPath(database.paths.uploads, fullRelative);
  const thumbnailPath = safeStoredPath(database.paths.uploads, thumbnailRelative);
  fs.mkdirSync(directory, { recursive: false, mode: 0o700 });

  try {
    const source = sharp(file.buffer, { failOn: "warning", limitInputPixels: 40_000_000 });
    const metadata = await source.metadata();
    if (!metadata.format || !["jpeg", "png", "webp", "heif", "tiff"].includes(metadata.format)) {
      throw new Error("Use a JPEG, PNG, WebP, HEIC, or TIFF photo");
    }
    const fullInfo = await source.clone().rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toFile(fullPath);
    await source.clone().rotate().resize({ width: 800, height: 800, fit: "cover", position: "attention", withoutEnlargement: true }).webp({ quality: 78 }).toFile(thumbnailPath);
    fs.chmodSync(fullPath, 0o600);
    fs.chmodSync(thumbnailPath, 0o600);
    const bytes = fs.readFileSync(fullPath);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

    database.sqlite.transaction(() => {
      database.sqlite.prepare(`INSERT INTO attachments
        (id, card_id, maintenance_record_id, original_filename, stored_path, thumbnail_path, mime_type, byte_length, width, height, sha256)
        VALUES (?, ?, ?, ?, ?, ?, 'image/webp', ?, ?, ?, ?)`)
        .run(id, input.cardId, input.recordId ?? null, safeFilename(file.originalname), fullRelative, thumbnailRelative, fullInfo.size, fullInfo.width, fullInfo.height, sha256);
      if (input.cover) database.sqlite.prepare("UPDATE cards SET cover_attachment_id = ?, updated_at = ? WHERE id = ?").run(id, Date.now(), input.cardId);
    })();
    return id;
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function registerPhotoRoutes(app: Express, database: YardTrackerDatabase): void {
  const authenticated = requireSession(database.sqlite);
  const householdHeroPath = path.join(database.paths.uploads, "household-hero.webp");

  app.get("/api/household/hero", authenticated, (_request, response) => {
    if (!fs.existsSync(householdHeroPath)) return void response.status(404).end();
    response.set({ "Content-Type": "image/webp", "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff" });
    fs.createReadStream(householdHeroPath).pipe(response);
  });

  app.post("/api/settings/hero", authenticated, upload.single("photo"), async (request, response, next) => {
    const temporaryPath = `${householdHeroPath}.partial`;
    try {
      if (!request.file) return void response.status(400).json({ error: "Choose a photo to upload" });
      const source = sharp(request.file.buffer, { failOn: "warning", limitInputPixels: 40_000_000 });
      const metadata = await source.metadata();
      if (!metadata.format || !["jpeg", "png", "webp", "heif", "tiff"].includes(metadata.format)) {
        throw new Error("Use a JPEG, PNG, WebP, HEIC, or TIFF photo");
      }
      await source.rotate().resize({ width: 2800, height: 1800, fit: "cover", position: "attention", withoutEnlargement: true }).webp({ quality: 86 }).toFile(temporaryPath);
      fs.chmodSync(temporaryPath, 0o600);
      fs.renameSync(temporaryPath, householdHeroPath);
      response.status(201).json({ url: "/api/household/hero" });
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      next(error);
    }
  });

  app.get("/api/attachments/:id/:variant?", authenticated, (request, response) => {
    const attachment = database.sqlite.prepare("SELECT stored_path AS storedPath, thumbnail_path AS thumbnailPath FROM attachments WHERE id = ?").get(request.params.id) as { storedPath: string; thumbnailPath: string | null } | undefined;
    if (!attachment) return void response.status(404).json({ error: "Photo not found" });
    const storedPath = request.params.variant === "thumbnail" && attachment.thumbnailPath ? attachment.thumbnailPath : attachment.storedPath;
    let filePath: string;
    try {
      filePath = safeStoredPath(database.paths.uploads, storedPath);
    } catch {
      return void response.status(404).json({ error: "Photo not found" });
    }
    response.set({ "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
    fs.createReadStream(filePath).on("error", () => response.status(404).end()).pipe(response);
  });

  app.post("/api/cards/:cardId/cover", authenticated, upload.single("photo"), async (request, response, next) => {
    try {
      if (!request.file) return void response.status(400).json({ error: "Choose a photo to upload" });
      const card = database.sqlite.prepare("SELECT id FROM cards WHERE id = ? AND archived_at IS NULL").get(request.params.cardId) as { id: string } | undefined;
      if (!card) return void response.status(404).json({ error: "Card not found" });
      const id = await normalizePhoto(database, request.file, { cardId: card.id, cover: true });
      response.status(201).json({ id });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/records/:recordId/photos", authenticated, upload.single("photo"), async (request, response, next) => {
    try {
      if (!request.file) return void response.status(400).json({ error: "Choose a photo to upload" });
      const record = database.sqlite.prepare("SELECT id, card_id AS cardId FROM maintenance_records WHERE id = ?").get(request.params.recordId) as { id: string; cardId: string } | undefined;
      if (!record) return void response.status(404).json({ error: "Maintenance record not found" });
      const id = await normalizePhoto(database, request.file, { cardId: record.cardId, recordId: record.id, cover: false });
      response.status(201).json({ id });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      response.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "Photos must be 15 MB or smaller" : "The photo upload could not be accepted" });
      return;
    }
    if (error instanceof Error && /Input|image|pixel|JPEG|PNG|WebP|HEIC|TIFF/i.test(error.message)) {
      response.status(400).json({ error: "That file could not be read as a supported photo" });
      return;
    }
    next(error);
  });
}
