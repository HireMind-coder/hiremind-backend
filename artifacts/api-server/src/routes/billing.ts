import { Router } from "express";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import {
  db,
  usersTable,
  subscriptionsTable,
  walletTransactionsTable,
  billingDetailsTable,
  billingInvoicesTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { JWT_SECRET, requireAuth } from "../lib/auth";
import {
  buildQuote,
  countActiveStaff,
  getOrCreateSubscription,
  getWalletBalancePaise,
  parseOrder,
  subscriptionStatus,
} from "../lib/billing";
import {
  ADDONS,
  DURATIONS,
  FEATURES,
  GST_RATE,
  GST_STATE_CODES,
  SELLER,
  STAFF_LIMITS,
  STATE_NAMES,
} from "../lib/billingCatalog";
import { getOrCreateCompanyProfile } from "../lib/companySettings";
import { grantReferralReward } from "../lib/referrals";
import { notifyAdmin, notifyEmployee } from "../lib/pushService";

const router = Router();

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

function pickNames(ids: string[], list: Array<{ id: string; name: string; description: string }>) {
  return ids
    .map((id) => list.find((x) => x.id === id))
    .filter(Boolean)
    .map((x) => ({ id: x!.id, name: x!.name, description: x!.description }));
}

// ─── Overview for the Subscriptions & Billing screen ────────────────────────

router.get("/billing/summary", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const sub = await getOrCreateSubscription(adminId);
  const { status, daysLeft } = subscriptionStatus(sub.validTill);
  res.json({
    staffLimit: sub.staffLimit,
    activeStaff: await countActiveStaff(adminId),
    validTill: sub.validTill.toISOString(),
    status,
    daysLeft,
    isTrial: sub.isTrial,
    featureIds: sub.features,
    addonIds: sub.addons,
    features: pickNames(sub.features, FEATURES),
    addons: pickNames(sub.addons, ADDONS),
    walletBalancePaise: await getWalletBalancePaise(adminId),
  });
});

router.get("/billing/catalog", requireAuth, async (_req, res): Promise<void> => {
  res.json({
    staffLimits: STAFF_LIMITS,
    features: FEATURES,
    addons: ADDONS,
    durations: DURATIONS,
    gstRate: GST_RATE,
    states: STATE_NAMES,
  });
});

// ─── Price quote (no side effects) ──────────────────────────────────────────

router.post("/billing/quote", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const order = parseOrder(req.body);
  if (typeof order === "string") { res.status(400).json({ error: order }); return; }

  const sub = await getOrCreateSubscription(adminId);
  const result = buildQuote(order, sub, await countActiveStaff(adminId));
  if (!result.ok) { res.status(400).json({ error: result.error }); return; }
  res.json(result.quote);
});

// ─── Billing details ────────────────────────────────────────────────────────

router.get("/billing/billing-details", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const [row] = await db.select().from(billingDetailsTable).where(eq(billingDetailsTable.adminId, adminId)).limit(1);
  if (!row) { res.json(null); return; }
  res.json({
    invoiceType: row.invoiceType,
    gstin: row.gstin ?? "",
    billName: row.billName,
    address: row.address,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    country: row.country,
  });
});

router.put("/billing/billing-details", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const b = req.body ?? {};
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  const invoiceType = b.invoiceType === "non_gst" ? "non_gst" : "gst";
  const gstin = str(b.gstin, 15).toUpperCase();
  const billName = str(b.billName, 120);
  const address = str(b.address, 300);
  const city = str(b.city, 80);
  const state = str(b.state, 80);
  const pincode = str(b.pincode, 6);
  const country = str(b.country, 60) || "India";

  if (invoiceType === "gst" && !GSTIN_RE.test(gstin)) {
    res.status(400).json({ error: "Enter a valid 15-character GSTIN (e.g. 07AAMCA0717H1ZU)" });
    return;
  }
  if (!billName) { res.status(400).json({ error: "Bill to (Name) is required" }); return; }
  if (!address) { res.status(400).json({ error: "Company address is required" }); return; }
  if (!city) { res.status(400).json({ error: "City is required" }); return; }
  if (!STATE_NAMES.includes(state)) { res.status(400).json({ error: "Select a valid state" }); return; }
  if (!/^\d{6}$/.test(pincode)) { res.status(400).json({ error: "Pincode must be 6 digits" }); return; }

  const values = {
    invoiceType,
    gstin: invoiceType === "gst" ? gstin : null,
    billName, address, city, state, pincode, country,
    updatedAt: new Date(),
  };
  await db
    .insert(billingDetailsTable)
    .values({ adminId, ...values })
    .onConflictDoUpdate({ target: billingDetailsTable.adminId, set: values });

  res.json({ ok: true });
});

// "Get Address": checks the GSTIN format, reads the state from its first two digits,
// and fills the rest from the company's own details. (No call to the GST portal.)
router.get("/billing/gst-lookup", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const gstin = String(req.query.gstin ?? "").trim().toUpperCase();
  if (!GSTIN_RE.test(gstin)) { res.status(400).json({ error: "Enter a valid 15-character GSTIN" }); return; }

  const state = GST_STATE_CODES[gstin.slice(0, 2)];
  if (!state) { res.status(400).json({ error: "This GSTIN has an unknown state code" }); return; }

  const [owner] = await db.select({ companyName: usersTable.companyName }).from(usersTable).where(eq(usersTable.id, adminId));
  const profile = await getOrCreateCompanyProfile(adminId);
  const address = profile.address ?? "";

  res.json({
    gstin,
    state,
    name: owner?.companyName ?? "",
    address,
    pincode: address.match(/\b\d{6}\b/)?.[0] ?? "",
  });
});

// ─── Wallet ─────────────────────────────────────────────────────────────────

router.get("/billing/wallet", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

  const now = new Date();
  const defFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defTo = now.toISOString().slice(0, 10);
  const from = isDate(req.query.from) ? req.query.from : defFrom;
  const to = isDate(req.query.to) ? req.query.to : defTo;

  const rows = await db
    .select()
    .from(walletTransactionsTable)
    .where(
      and(
        eq(walletTransactionsTable.adminId, adminId),
        sql`${walletTransactionsTable.createdAt} >= ${from}::date`,
        sql`${walletTransactionsTable.createdAt} < (${to}::date + 1)`,
      ),
    )
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(300);

  res.json({
    balancePaise: await getWalletBalancePaise(adminId),
    from,
    to,
    transactions: rows.map((t) => ({
      id: t.id,
      type: t.type,
      amountPaise: t.amountPaise,
      description: t.description,
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

// Add Funds. Real money needs a payment gateway (e.g. Razorpay) — connect it here.
// Until then this only works when the server is started with PAYMENTS_MODE=test,
// so nobody can give themselves free balance on a live server.
router.post("/billing/wallet/topup", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;

  if (process.env.PAYMENTS_MODE !== "test") {
    res.status(501).json({
      error: "Online payments are not enabled yet. Please contact support to add funds.",
      code: "PAYMENTS_DISABLED",
    });
    return;
  }

  const rupees = Math.round(Number(req.body?.amount));
  if (!Number.isFinite(rupees) || rupees < 10 || rupees > 100000) {
    res.status(400).json({ error: "Enter an amount between ₹10 and ₹1,00,000" });
    return;
  }

  await db.insert(walletTransactionsTable).values({
    adminId,
    type: "credit",
    amountPaise: rupees * 100,
    description: "Wallet top-up (test mode)",
    reference: `TEST-${randomUUID().slice(0, 8).toUpperCase()}`,
  });

  res.json({ balancePaise: await getWalletBalancePaise(adminId) });
});

// ─── Checkout: pay for an upgrade / renewal from the wallet ─────────────────

router.post("/billing/checkout", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const order = parseOrder(req.body);
  if (typeof order === "string") { res.status(400).json({ error: order }); return; }

  const [details] = await db.select().from(billingDetailsTable).where(eq(billingDetailsTable.adminId, adminId)).limit(1);
  if (!details) {
    res.status(400).json({ error: "Please confirm your billing details first", code: "BILLING_DETAILS_REQUIRED" });
    return;
  }

  await getOrCreateSubscription(adminId); // make sure the row exists before locking

  try {
    const result = await db.transaction(async (tx) => {
      // One checkout per company at a time, so the balance check below cannot race
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${adminId}::bigint)`);

      const [sub] = await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.adminId, adminId)).limit(1);
      const activeStaff = await countActiveStaff(adminId);

      const q = buildQuote(order, sub, activeStaff);
      if (!q.ok) throw new HttpError(400, q.error);
      const quote = q.quote;

      const balRes: any = await tx.execute(
        sql`SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_paise ELSE -amount_paise END), 0)::bigint AS bal
              FROM wallet_transactions WHERE admin_id = ${adminId}`,
      );
      const balance = Number((balRes.rows ?? balRes)[0]?.bal ?? 0);
      if (balance < quote.totalPaise) {
        throw new HttpError(402, "Your wallet balance is not enough for this purchase", {
          code: "INSUFFICIENT_BALANCE",
          balancePaise: balance,
          totalPaise: quote.totalPaise,
          shortfallPaise: quote.totalPaise - balance,
        });
      }

      const purchaseType = order.type === "renew" ? "renewal" : "upgrade";

      const [debit] = await tx
        .insert(walletTransactionsTable)
        .values({
          adminId,
          type: "debit",
          amountPaise: quote.totalPaise,
          description: order.type === "renew" ? "Plan renewal" : "Plan upgrade",
        })
        .returning({ id: walletTransactionsTable.id });

      await tx
        .update(subscriptionsTable)
        .set({
          staffLimit: order.staffLimit,
          features: order.features,
          addons: order.addons,
          validTill: new Date(quote.newValidTill),
          isTrial: false,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionsTable.adminId, adminId));

      const [invoice] = await tx
        .insert(billingInvoicesTable)
        .values({
          adminId,
          invoiceNumber: `TMP-${randomUUID()}`,
          purchaseType,
          subtotalPaise: quote.subtotalPaise,
          gstPaise: quote.gstPaise,
          totalPaise: quote.totalPaise,
          items: {
            lines: quote.lines,
            staffLimit: order.staffLimit,
            durationMonths: quote.durationMonths,
            features: pickNames(order.features, FEATURES).map((f) => f.name),
            addons: pickNames(order.addons, ADDONS).map((a) => a.name),
          },
          billing: {
            invoiceType: details.invoiceType,
            gstin: details.gstin,
            billName: details.billName,
            address: details.address,
            city: details.city,
            state: details.state,
            pincode: details.pincode,
            country: details.country,
          },
          validTill: new Date(quote.newValidTill),
        })
        .returning();

      const invoiceNumber = `HM-${new Date().getFullYear()}-${String(invoice.id).padStart(6, "0")}`;
      await tx.update(billingInvoicesTable).set({ invoiceNumber }).where(eq(billingInvoicesTable.id, invoice.id));
      await tx.update(walletTransactionsTable).set({ reference: invoiceNumber }).where(eq(walletTransactionsTable.id, debit.id));

      // Referral: the company that referred this one earns a reward on its first paid plan
      const reward = await grantReferralReward(tx, { referredAdminId: adminId, subtotalPaise: quote.subtotalPaise });

      return { invoiceId: invoice.id, invoiceNumber, validTill: quote.newValidTill, totalPaise: quote.totalPaise, reward };
    });

    const { reward, ...payload } = result;
    if (reward) {
      const rupees = (reward.amountPaise / 100).toLocaleString("en-IN");
      const body = `${reward.companyName} bought a plan. ₹${rupees} was added to your company wallet.`;
      if (reward.referrerEmployeeId) {
        void notifyEmployee(reward.referrerEmployeeId, { title: "Referral reward!", body, screen: "/refer-a-friend" });
      }
      void notifyAdmin(reward.referrerAdminId, { title: "Referral reward!", body, screen: "/billing" });
    }

    res.json(payload);
  } catch (e) {
    if (e instanceof HttpError) {
      res.status(e.status).json({ error: e.message, ...e.extra });
      return;
    }
    throw e;
  }
});

// ─── Invoices ───────────────────────────────────────────────────────────────

router.get("/billing/invoices", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const rows = await db
    .select()
    .from(billingInvoicesTable)
    .where(eq(billingInvoicesTable.adminId, adminId))
    .orderBy(desc(billingInvoicesTable.createdAt));
  res.json(
    rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      purchaseType: r.purchaseType,
      totalPaise: r.totalPaise,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// A phone can't send an Authorization header when it opens a link in the browser,
// so the app first asks for a short-lived signed link, then opens it.
router.post("/billing/invoices/:id/link", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const id = Number(req.params.id);
  const [inv] = await db
    .select({ id: billingInvoicesTable.id })
    .from(billingInvoicesTable)
    .where(and(eq(billingInvoicesTable.id, id), eq(billingInvoicesTable.adminId, adminId)))
    .limit(1);
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }

  // No "adminId" key on purpose: this token must never be accepted as a login token
  const token = jwt.sign({ purpose: "invoice", aid: adminId, inv: id }, JWT_SECRET, { expiresIn: "10m" });
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol).split(",")[0];
  res.json({ url: `${proto}://${req.get("host")}/api/billing/invoices/${id}/view?t=${encodeURIComponent(token)}` });
});

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rupees(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

router.get("/billing/invoices/:id/view", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  let payload: any;
  try {
    payload = jwt.verify(String(req.query.t ?? ""), JWT_SECRET);
  } catch {
    res.status(401).type("text").send("This invoice link has expired. Please open it again from the app.");
    return;
  }
  if (payload?.purpose !== "invoice" || Number(payload.inv) !== id) {
    res.status(401).type("text").send("Invalid invoice link.");
    return;
  }

  const [inv] = await db
    .select()
    .from(billingInvoicesTable)
    .where(and(eq(billingInvoicesTable.id, id), eq(billingInvoicesTable.adminId, Number(payload.aid))))
    .limit(1);
  if (!inv) { res.status(404).type("text").send("Invoice not found."); return; }

  const items = inv.items as any;
  const bill = inv.billing as any;
  const lines: Array<{ label: string; amountPaise: number }> = items?.lines ?? [];

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice ${esc(inv.invoiceNumber)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:20px;background:#fff}
  .wrap{max-width:720px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px}
  .muted{color:#666;font-size:13px}
  .row{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:16px 0}
  .box{flex:1;min-width:240px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{padding:10px 8px;border-bottom:1px solid #e5e5e5;font-size:14px;text-align:left}
  td.r,th.r{text-align:right}
  .tot td{font-weight:bold;border-bottom:none}
  .btn{margin-top:20px;padding:10px 18px;background:#0b9f7e;color:#fff;border:0;border-radius:8px;font-size:15px}
  @media print{.btn{display:none}}
</style></head><body><div class="wrap">
  <h1>Tax Invoice</h1>
  <div class="muted">Invoice no: ${esc(inv.invoiceNumber)} &nbsp;|&nbsp; Date: ${esc(inv.createdAt.toISOString().slice(0, 10))}</div>
  <div class="row">
    <div class="box"><strong>${esc(SELLER.name)}</strong><br>${esc(SELLER.address)}${SELLER.gstin ? `<br>GSTIN: ${esc(SELLER.gstin)}` : ""}</div>
    <div class="box"><strong>Bill to</strong><br>${esc(bill?.billName)}<br>${esc(bill?.address)}<br>${esc(bill?.city)}, ${esc(bill?.state)} ${esc(bill?.pincode)}<br>${esc(bill?.country)}${bill?.gstin ? `<br>GSTIN: ${esc(bill.gstin)}` : ""}</div>
  </div>
  <div class="muted">${inv.purchaseType === "renewal" ? "Plan renewal" : "Plan upgrade"} · ${esc(items?.staffLimit)} staff · valid till ${esc(inv.validTill.toISOString().slice(0, 10))}</div>
  <table>
    <tr><th>Description</th><th class="r">Amount</th></tr>
    ${lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="r">${rupees(l.amountPaise)}</td></tr>`).join("")}
    <tr><td>Subtotal</td><td class="r">${rupees(inv.subtotalPaise)}</td></tr>
    <tr><td>GST (${Math.round(GST_RATE * 100)}%)</td><td class="r">${rupees(inv.gstPaise)}</td></tr>
    <tr class="tot"><td>Total (paid from wallet)</td><td class="r">${rupees(inv.totalPaise)}</td></tr>
  </table>
  <button class="btn" onclick="window.print()">Print / Save as PDF</button>
</div></body></html>`;

  res.type("html").send(html);
});

export default router;