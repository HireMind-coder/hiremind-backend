import { ScrollView, View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const POLICY_SECTIONS = [
  {
    title: "1. Introduction",
    content: `HireMind is a cloud-based Human Resource Management System (HRMS) designed for business organizations to manage employee attendance, payroll, task assignments, and leave administration.\n\nThis Privacy Policy describes how HireMind collects, processes, stores, and protects personal data. By using HireMind, you agree to the practices described in this Policy.`,
  },
  {
    title: "2. Data We Collect",
    content: `We collect the following types of data:\n\n• Personal Identifiers — Full name, email address, phone number, employee ID, job role, department.\n\n• Attendance Data — Check-in/check-out times, attendance status (Present/Absent/Half Day), dates, overtime hours.\n\n• Biometric Data — Face photographs and face descriptor vectors (mathematical representation) for the optional face recognition attendance feature.\n\n• Task & Leave Data — Task titles, descriptions, status, leave types, dates, and reasons.\n\n• Payroll Data — Salary amounts, payment types, methods, and payment history.\n\n• Authentication Data — Encrypted JWT tokens, login roles (admin/employee).`,
  },
  {
    title: "3. Biometric Data",
    content: `HireMind includes an optional face recognition attendance feature. This is among the most sensitive data we process.\n\n• Reference face photos are uploaded by administrators during enrollment.\n• A face descriptor (mathematical vector) is computed and stored — not the raw image.\n• Live images submitted for verification are NOT permanently stored after matching.\n• Employees may opt out at any time — manual attendance entry is always available.\n\n⚠️ Organizations must obtain explicit written consent from employees before enrolling them in face recognition.`,
  },
  {
    title: "4. How We Use Your Data",
    content: `Your data is used strictly for:\n\n• HR Operations — Managing employee records, attendance, and leave.\n• Payroll Processing — Salary calculations, payment tracking.\n• Task Management — Assigning and tracking work assignments.\n• Security & Authentication — Verifying user identity, maintaining secure sessions.\n• Analytics — Dashboard insights, attendance trends, payroll summaries.\n• Notifications — Email alerts to admins for employee check-in/check-out events.`,
  },
  {
    title: "5. Data Storage & Security",
    content: `• Hosting: Railway.app cloud infrastructure with TLS 1.3 encryption in transit.\n• Database: PostgreSQL with SSL-encrypted connections.\n• Passwords: Stored using bcrypt hashing (never in plaintext).\n• Tokens: JWT authentication tokens with 30-day expiry.\n• Mobile: Authentication tokens stored in Expo SecureStore (encrypted local storage).\n• Access Control: Role-based — admins see all data; employees see only their own.`,
  },
  {
    title: "6. Third-Party Services",
    content: `We use the following third-party services:\n\n• Railway.app — Cloud hosting and database infrastructure.\n• Resend — Transactional email notifications.\n• Expo — Mobile application platform.\n• TensorFlow.js & face-api.js — On-server face recognition (no data sent to third parties).\n\nWe do NOT sell or share your data with advertisers.`,
  },
  {
    title: "7. Your Rights",
    content: `Under the IT Act, 2000 (India) and GDPR principles, you have the right to:\n\n• Access — Request a copy of your personal data.\n• Rectification — Request correction of inaccurate data.\n• Erasure — Request deletion of your personal data.\n• Data Portability — Export your data in machine-readable format.\n• Withdraw Consent — Opt out of biometric data processing at any time.\n\nTo exercise these rights, contact your HR administrator or email:allegient.info@gmail.com\n\nWe will respond within 30 days.`,
  },
  {
    title: "8. Data Retention",
    content: `• Employee records: Duration of employment + 3 years\n• Attendance records: 3 years\n• Payroll records: 7 years (statutory requirement)\n• Leave records: 3 years\n• Face enrollment photos: Until deleted by admin\n• Authentication tokens: 30 days (auto-expiry)`,
  },
  {
    title: "9. Legal Compliance",
    content: `This Policy complies with:\n\n• Information Technology Act, 2000 (India)\n• IT (Sensitive Personal Data) Rules, 2011\n• Digital Personal Data Protection Act, 2023 (India)\n• GDPR principles (best practice alignment)\n\nBiometric data is classified as Sensitive Personal Data or Information (SPDI) under Indian law.`,
  },
  {
    title: "10. Contact Us",
    content: `For privacy-related questions or data requests:\n\nEmail: allegient.info@gmail.com\nSubject: Privacy Request — [Your Organization Name]\n\nFor urgent biometric data concerns, mark your email as URGENT.`,
  },
];

export default function PrivacyPolicyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topPadding + 16, paddingBottom: insets.bottom + 40 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Privacy Policy</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          Effective Date: May 13, 2026 • Version 1.0
        </Text>
      </View>

      {/* Intro box */}
      <View style={[styles.infoBox, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
        <Text style={[styles.infoText, { color: colors.primary }]}>
          This policy explains how HireMind collects, uses, and protects your personal data. Please read it carefully.
        </Text>
      </View>

      {/* Sections */}
      {POLICY_SECTIONS.map((section, i) => (
        <View key={i} style={[styles.section, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
          <Text style={[styles.sectionContent, { color: colors.mutedForeground }]}>{section.content}</Text>
        </View>
      ))}

      {/* Footer */}
      <Text style={[styles.footer, { color: colors.mutedForeground }]}>
        © 2026 HireMind. All rights reserved.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20 },
  header: { marginBottom: 20 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  infoBox: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 20 },
  infoText: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 20 },
  section: { borderBottomWidth: 1, paddingVertical: 20 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 },
  sectionContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  footer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 24 },
});
