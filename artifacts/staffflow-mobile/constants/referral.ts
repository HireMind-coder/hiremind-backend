/**
 * Refer a Friend settings.
 *
 * INVITE_LINK is what your friend taps to get the app.
 * !! Change it to your real link. The Play Store link below only works once
 * !! the app com.allegient.hiremind is published on Google Play.
 */
export const INVITE_LINK = "https://play.google.com/store/apps/details?id=com.allegient.hiremind";

export function inviteMessage(fromName: string | null | undefined, code: string | null | undefined): string {
  const who = fromName ? `${fromName} invited you` : "You are invited";
  const codeLine = code ? `\n\nUse my referral code ${code} when you create your company account.` : "";
  return (
    `${who} to try HireMind, an app for attendance, leaves and payroll at work.` +
    `${codeLine}\n\nGet the app: ${INVITE_LINK}`
  );
}