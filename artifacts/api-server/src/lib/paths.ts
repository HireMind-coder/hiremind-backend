import path from "path";

/**
 * Where uploaded files (face photos, company logo, leave attachments) are stored.
 *
 * On your own PC this is the "uploads" folder next to the server, as before.
 * On Railway, attach a Volume (for example mounted at /data) and set
 *   UPLOADS_DIR=/data/uploads
 * so the files survive redeploys.
 */
export const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), "uploads");

export function uploadsPath(...parts: string[]): string {
  return path.join(UPLOADS_ROOT, ...parts);
}

/**
 * Private files (employee documents: Aadhaar, PAN, bank details...).
 * This folder is NOT served publicly. Files are only handed out through
 * short-lived signed links (see routes/documents.ts).
 *
 * Default: a "private" folder next to the uploads folder
 * (local: ./private, Railway with UPLOADS_DIR=/data/uploads: /data/private,
 * so it lives on the same Volume).
 */
export const PRIVATE_ROOT = process.env.PRIVATE_DIR
  ? path.resolve(process.env.PRIVATE_DIR)
  : path.join(path.dirname(UPLOADS_ROOT), "private");

export function privatePath(...parts: string[]): string {
  return path.join(PRIVATE_ROOT, ...parts);
}