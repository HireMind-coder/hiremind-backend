import app from "./app";
import { logger } from "./lib/logger";
import { startCronJobs } from "./lib/cronJobs";
import { initFaceService } from "./lib/faceService";
import { ensureAttendanceSettingsTables } from "./lib/attendanceRules";
import { ensureCompanyTables } from "./lib/companySettings";
import { ensureBillingTables } from "./lib/billing";
import { ensureLeaveColumns } from "./lib/leaveRules";
import { ensureDocumentTables } from "./lib/documentRules";
import { ensureReferralTables } from "./lib/referrals";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// 100% WORKING FIX: Explicitly binding to "0.0.0.0" opens the port for your OnePlus phone
app.listen(port, "0.0.0.0", () => {
  logger.info({ port, host: "0.0.0.0" }, "Server listening on ALL network interfaces. Ready for mobile connections.");
   startCronJobs();
}).on('error', (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

initFaceService().catch((err) => {
  logger.warn({ err }, "Face service initialization failed — face features unavailable");
});

ensureAttendanceSettingsTables().catch((err) => {
  logger.error({ err }, "Could not create attendance settings tables");
});
ensureCompanyTables().catch((err) => {
  logger.error({ err }, "Could not create company settings tables");
});
ensureBillingTables().catch((err) => {
  logger.error({ err }, "Could not create billing tables");
});

ensureLeaveColumns().catch((err) => {
  logger.error({ err }, "Could not update leave columns");
});

ensureDocumentTables().catch((err) => {
  logger.error({ err }, "Could not create employee document tables");
});

ensureReferralTables().catch((err) => {
  logger.error({ err }, "Could not create referral tables");
});