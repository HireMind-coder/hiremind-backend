import cron from "node-cron";
import { db, attendanceTable, employeesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

export function startCronJobs() {
  // Run every day at 11:59 PM
  cron.schedule("59 23 * * *", async () => {
    console.log("Running auto absent job...");
    try {
      const today = new Date().toISOString().split("T")[0];

      // Get all active employees
      const employees = await db.select().from(employeesTable)
        .where(eq(employeesTable.status, "active"));

      for (const employee of employees) {
        // Check if attendance already marked
        const existing = await db.select().from(attendanceTable)
          .where(and(
            eq(attendanceTable.employeeId, employee.id),
            eq(attendanceTable.date, today)
          )).limit(1);

        // If no attendance record — mark absent
        if (existing.length === 0) {
          await db.insert(attendanceTable).values({
            employeeId: employee.id,
            date: today,
            status: "absent",
            checkIn: null,
            checkOut: null,
          });
          console.log(`Marked absent: ${employee.name} on ${today}`);
        }
      }
      console.log("Auto absent job completed!");
    } catch (err) {
      console.error("Auto absent job failed:", err);
    }
  }, {
    timezone: "Asia/Kolkata" // IST timezone
  });

  console.log("Cron jobs started!");
}