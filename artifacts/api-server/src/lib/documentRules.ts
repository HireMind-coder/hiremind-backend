import { pool } from "@workspace/db";
import { mkdirSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { logger } from "./logger";
import { privatePath } from "./paths";

export const DOCUMENT_TYPES = [
  "Aadhar",
  "Address Proof",
  "Background Verification",
  "Bank Account Details",
  "Degree",
  "Driving License",
  "Employment Contract",
  "PAN Card",
  "Police Verification",
  "Salary Slip",
  "Previous Employment Documents",
  "Professional Documents",
  "Other",
  "Voter ID",
  "Verification Report",
];

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8 MB per file
export const MAX_DOCUMENTS_PER_EMPLOYEE = 50;

const DOCUMENTS_DIR = privatePath("documents");

// Tables are created at server start (Railway deploy has no `drizzle push` step)
export async function ensureDocumentTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      employee_id integer NOT NULL,
      doc_type text NOT NULL,
      file_name text NOT NULL,
      stored_name text NOT NULL,
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      uploaded_by text NOT NULL DEFAULT 'employee',
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT employee_documents_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT employee_documents_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS employee_documents_employee_idx ON employee_documents (employee_id);
  `);
  logger.info("Employee document tables ready");
}

/** A name that is safe to show: no folders, no odd characters, not too long. */
export function cleanFileName(name: unknown, fallback: string): string {
  const base = typeof name === "string" ? path.basename(name.replace(/\\/g, "/")) : "";
  const cleaned = base.replace(/[^\w.\- ()]/g, "_").trim().slice(0, 100);
  return cleaned || fallback;
}

/**
 * Saves the uploaded file in the PRIVATE folder.
 * The type is decided from the file's first bytes (not from what the phone says),
 * and only JPG, PNG and PDF are accepted.
 */
export function saveDocumentFile(
  base64: unknown,
): { storedName: string; mimeType: string; ext: string; sizeBytes: number } | { error: string } {
  const raw = typeof base64 === "string" ? base64 : "";
  const clean = raw.replace(/^data:[\w/+.-]+;base64,/, "");
  if (!clean) return { error: "File is empty" };

  const buf = Buffer.from(clean, "base64");
  if (buf.length === 0) return { error: "File is empty" };
  if (buf.length > MAX_DOCUMENT_BYTES) return { error: "File must be smaller than 8 MB" };

  let mimeType: string;
  let ext: string;
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    mimeType = "image/jpeg";
    ext = "jpg";
  } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    mimeType = "image/png";
    ext = "png";
  } else if (buf.subarray(0, 4).toString("latin1") === "%PDF") {
    mimeType = "application/pdf";
    ext = "pdf";
  } else {
    return { error: "Only JPG, PNG or PDF files are allowed" };
  }

  mkdirSync(DOCUMENTS_DIR, { recursive: true });
  const storedName = `${randomUUID()}.${ext}`;
  writeFileSync(path.join(DOCUMENTS_DIR, storedName), buf);
  return { storedName, mimeType, ext, sizeBytes: buf.length };
}

export function deleteDocumentFile(storedName: string): void {
  try {
    unlinkSync(path.join(DOCUMENTS_DIR, path.basename(storedName)));
  } catch {
    // already gone
  }
}

export const documentsDir = DOCUMENTS_DIR;