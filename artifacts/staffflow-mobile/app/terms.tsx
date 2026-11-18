import { ScrollView, View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

// NOTE: Starter text. Have a lawyer review it before publishing.
const TERMS_SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    content: `By creating an account or using HireMind, you agree to these Terms & Conditions. If you do not agree, please do not use the app.`,
  },
  {
    title: "2. About the Service",
    content: `HireMind is a cloud-based HR management service for attendance, tasks, leaves and payroll tracking. Features may change or be improved over time.`,
  },
  {
    title: "3. Accounts & Security",
    content: `• You are responsible for keeping your login credentials confidential.\n• Admins are responsible for the staff accounts they create.\n• Notify us immediately of any unauthorized access to your account.`,
  },
  {
    title: "4. Acceptable Use",
    content: `You agree not to:\n\n• Use the service for any unlawful purpose.\n• Attempt to access data that belongs to another organization.\n• Interfere with or disrupt the service or its security.\n• Upload false, misleading or harmful content.`,
  },
  {
    title: "5. Employee Data & Consent",
    content: `Organizations are responsible for the accuracy of employee data they enter and for obtaining any consents required by law, including written consent before enrolling employees in face recognition attendance.`,
  },
  {
    title: "6. Deleting Data",
    content: `Admins can delete staff records. Deleting staff also permanently removes related attendance, leave, payment and task records. Deleted data cannot be recovered, so export anything you need first.`,
  },
  {
    title: "7. Availability",
    content: `We aim to keep HireMind available at all times, but we do not guarantee uninterrupted service. Maintenance, updates or events outside our control may cause downtime.`,
  },
  {
    title: "8. Limitation of Liability",
    content: `To the maximum extent permitted by law, HireMind is provided "as is" and we are not liable for indirect or consequential losses arising from use of the service.`,
  },
  {
    title: "9. Termination",
    content: `We may suspend or terminate accounts that violate these Terms. You may stop using the service at any time.`,
  },
  {
    title: "10. Changes & Contact",
    content: `We may update these Terms from time to time. Continued use after changes means you accept the updated Terms.\n\nQuestions: allegient.info@gmail.com`,
  },
];

export default function TermsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPadding + 16, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Terms & Conditions</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>Version 1.0.1</Text>
      </View>

      {TERMS_SECTIONS.map((section, i) => (
        <View key={i} style={[styles.section, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
          <Text style={[styles.sectionContent, { color: colors.mutedForeground }]}>{section.content}</Text>
        </View>
      ))}

      <Text style={[styles.footer, { color: colors.mutedForeground }]}>© 2026 HireMind. All rights reserved.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20 },
  header: { marginBottom: 20 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  section: { borderBottomWidth: 1, paddingVertical: 20 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 },
  sectionContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  footer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 24 },
});