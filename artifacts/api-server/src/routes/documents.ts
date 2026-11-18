import { Router } from "express";
import jwt from "jsonwebtoken";
import { db, employeesTable, employeeDocumentsTable } from "@workspace/db";
import { and, count, desc, eq } from "drizzle-orm";
import { JWT_SECRET, requireAuth } from "../lib/auth";
import { notifyAdmin, notifyEmployee } from "../lib/pushService";
import {
  DOCUMENT_TYPES,
  MAX_DOCUMENTS_PER_EMPLOYEE,
  cleanFileName,
  deleteDocumentFile,
  documentsDir,
  saveDocumentFile,
} from "../lib/documentRules";

const router = Router();

type Target = { ok: true; employeeId: number; name: string } | { ok: false; status: number; error: string };

/**
 * Which employee is this request about?
 * - An employee login can only ever act on THEMSELVES (anything in the request is ignored).
 * - An admin must name an employee that belongs to their own company.
 */
async function resolveTarget(user: any, requested: unknown): Promise<Target> {
  if (user.role === "employee") {
    const [me] = await db
      .select({ id: employeesTable.id, name: employeesTable.name })
      .from(employeesTable)
      .where(and(eq(employeesTable.id, Number(user.employeeId)), eq(employeesTable.adminId, Number(user.adminId))));
    if (!me) return { ok: false, status: 404, error: "Employee not found" };
    return { ok: true, employeeId: me.id, name: me.name };
  }

  const id = Number(requested);
  if (!Number.isInteger(id) || id < 1) return { ok: false, status: 400, error: "employeeId is required" };
  const [emp] = await db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(and(eq(employeesTable.id, id), eq(employeesTable.adminId, Number(user.adminId))));
  if (!emp) return { ok: false, status: 404, error: "Employee not found" };
  return { ok: true, employeeId: emp.id, name: emp.name };
}

/** Loads a document the caller is allowed to touch (same company; employees: only their own). */
async function loadAllowedDocument(user: any, id: number) {
  const [doc] = await db
    .select()
    .from(employeeDocumentsTable)
    .where(and(eq(employeeDocumentsTable.id, id), eq(employeeDocumentsTable.adminId, Number(user.adminId))));
  if (!doc) return null;
  if (user.role === "employee" && doc.employeeId !== Number(user.employeeId)) return null;
  return doc;
}

function publicShape(d: typeof employeeDocumentsTable.$inferSelect) {
  return {
    id: d.id,
    employeeId: d.employeeId,
    docType: d.docType,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    uploadedBy: d.uploadedBy,
    createdAt: d.createdAt.toISOString(),
  };
}

router.get("/documents/types", requireAuth, async (_req, res): Promise<void> => {
  res.json(DOCUMENT_TYPES);
});

router.get("/documents", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const target = await resolveTarget(user, req.query.employeeId);
  if (!target.ok) { res.status(target.status).json({ error: target.error }); return; }

  const rows = await db
    .select()
    .from(employeeDocumentsTable)
    .where(and(eq(employeeDocumentsTable.employeeId, target.employeeId), eq(employeeDocumentsTable.adminId, Number(user.adminId))))
    .orderBy(desc(employeeDocumentsTable.createdAt));

  res.json(rows.map(publicShape));
});

router.post("/documents", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const target = await resolveTarget(user, req.body?.employeeId);
  if (!target.ok) { res.status(target.status).json({ error: target.error }); return; }

  const docType = String(req.body?.docType ?? "");
  if (!DOCUMENT_TYPES.includes(docType)) { res.status(400).json({ error: "Choose a valid document type" }); return; }

  const [{ n }] = await db
    .select({ n: count() })
    .from(employeeDocumentsTable)
    .where(eq(employeeDocumentsTable.employeeId, target.employeeId));
  if (Number(n) >= MAX_DOCUMENTS_PER_EMPLOYEE) {
    res.status(400).json({ error: `You can keep up to ${MAX_DOCUMENTS_PER_EMPLOYEE} documents. Delete an old one first.` });
    return;
  }

  const saved = saveDocumentFile(req.body?.fileBase64);
  if ("error" in saved) { res.status(400).json({ error: saved.error }); return; }

  const uploadedBy = user.role === "employee" ? "employee" : "admin";
  const [row] = await db
    .insert(employeeDocumentsTable)
    .values({
      adminId: Number(user.adminId),
      employeeId: target.employeeId,
      docType,
      fileName: cleanFileName(req.body?.fileName, `${docType}.${saved.ext}`),
      storedName: saved.storedName,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      uploadedBy,
    })
    .returning();

  if (uploadedBy === "employee") {
    void notifyAdmin(Number(user.adminId), {
      title: "New document uploaded",
      body: `${target.name} uploaded ${docType}`,
      screen: "/(tabs)/employees",
    });
  } else {
    void notifyEmployee(target.employeeId, {
      title: "Document added",
      body: `Your admin added ${docType} to your documents`,
      screen: "/documents",
    });
  }

  res.status(201).json(publicShape(row));
});

router.delete("/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const doc = await loadAllowedDocument(user, Number(req.params.id));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  if (user.role === "employee" && doc.status === "verified") {
    res.status(403).json({ error: "A verified document cannot be deleted. Ask your admin." });
    return;
  }

  await db.delete(employeeDocumentsTable).where(eq(employeeDocumentsTable.id, doc.id));
  deleteDocumentFile(doc.storedName);
  res.status(204).send();
});

// Admin: mark a document as verified or rejected
router.patch("/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role === "employee") { res.status(403).json({ error: "Only admins can verify documents" }); return; }

  const status = req.body?.status;
  if (status !== "pending" && status !== "verified" && status !== "rejected") {
    res.status(400).json({ error: "status must be pending, verified or rejected" });
    return;
  }

  const doc = await loadAllowedDocument(user, Number(req.params.id));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const [row] = await db
    .update(employeeDocumentsTable)
    .set({ status })
    .where(eq(employeeDocumentsTable.id, doc.id))
    .returning();

  if (status !== "pending") {
    void notifyEmployee(doc.employeeId, {
      title: status === "verified" ? "Document verified" : "Document rejected",
      body: `Your ${doc.docType} was ${status}`,
      screen: "/documents",
    });
  }

  res.json(publicShape(row));
});

// The phone cannot send a login header when it opens a file in the browser, so the app
// first asks for a short-lived signed link, then opens it.
router.post("/documents/:id/link", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const doc = await loadAllowedDocument(user, Number(req.params.id));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  // No "adminId" key on purpose: this token must never be accepted as a login token
  const token = jwt.sign({ purpose: "document", aid: Number(user.adminId), did: doc.id }, JWT_SECRET, { expiresIn: "5m" });
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol).split(",")[0];
  res.json({ url: `${proto}://${req.get("host")}/api/documents/${doc.id}/file?t=${encodeURIComponent(token)}` });
});

router.get("/documents/:id/file", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  let payload: any;
  try {
    payload = jwt.verify(String(req.query.t ?? ""), JWT_SECRET);
  } catch {
    res.status(401).type("text").send("This link has expired. Please open the document again from the app.");
    return;
  }
  if (payload?.purpose !== "document" || Number(payload.did) !== id) {
    res.status(401).type("text").send("Invalid link.");
    return;
  }

  const [doc] = await db
    .select()
    .from(employeeDocumentsTable)
    .where(and(eq(employeeDocumentsTable.id, id), eq(employeeDocumentsTable.adminId, Number(payload.aid))));
  if (!doc) { res.status(404).type("text").send("Document not found."); return; }

  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(doc.storedName, { root: documentsDir, dotfiles: "deny" }, (err) => {
    if (err && !res.headersSent) res.status(404).type("text").send("File is missing on the server.");
  });
});

export default router;