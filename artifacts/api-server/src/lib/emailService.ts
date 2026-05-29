import { Resend } from "resend";

// const resend = new Resend(process.env.RESEND_API_KEY);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
export async function sendAttendanceEmail({
  adminEmail,
  employeeName,
  type,
  time,
  date,
}: {
  adminEmail: string;
  employeeName: string;
  type: "check_in" | "check_out";
  time: string;
  date: string;
}) {
  const subject = type === "check_in"
    ? `✅ ${employeeName} Checked In`
    : `🔴 ${employeeName} Checked Out`;

  const message = type === "check_in"
    ? `${employeeName} has checked in at ${time} on ${date}.`
    : `${employeeName} has checked out at ${time} on ${date}.`;

if (!resend) { console.log("Email skipped - no API key"); return; }
  await resend.emails.send({
    from: "StaffFlow <onboarding@resend.dev>",
    to: adminEmail,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px;">
        <h2 style="color: ${type === "check_in" ? "#16A34A" : "#DC2626"}">
          ${subject}
        </h2>
        <p style="font-size: 16px;">${message}</p>
        <hr/>
        <p style="color: #6B7280; font-size: 12px;">StaffFlow HR Management</p>
      </div>
    `,
  });
}