import { View, Text, StyleSheet, Pressable, Share, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

type Company = { companyName: string; companyCode: string };

export default function CompanySettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery({
    queryKey: ["company"],
    queryFn: () => customFetch<Company>("/api/company"),
    throwOnError: false,
  });

  const rows: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string; sublabel: string; href: string }> = [
    { icon: "business-outline", label: "Company Details", sublabel: "Name, address, GST, logo", href: "/company-details" },
    { icon: "git-network-outline", label: "My Branches", sublabel: "Office locations and attendance radius", href: "/branches" },
    { icon: "people-outline", label: "My Departments", sublabel: "Departments used for your employees", href: "/departments" },
  ];

  // "Copy" opens the share sheet, which has a Copy option (no extra package needed)
  const shareCode = () => {
    if (!data?.companyCode) return;
    Haptics.selectionAsync();
    Share.share({ message: data.companyCode });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.list}>
        {rows.map((r) => (
          <Pressable
            key={r.href}
            onPress={() => router.push(r.href as any)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: colors.muted }]}>
              <Ionicons name={r.icon} size={22} color={colors.mutedForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.foreground }]}>{r.label}</Text>
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>{r.sublabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border }]}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text style={[styles.codeText, { color: colors.foreground }]}>
              Company Code: <Text style={styles.code}>{data?.companyCode ?? "—"}</Text>
            </Text>
            <Pressable hitSlop={12} onPress={shareCode}>
              <Ionicons name="copy-outline" size={22} color={colors.mutedForeground} />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderWidth: 1, borderRadius: 14 },
  icon: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 16,
  },
  codeText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  code: { fontFamily: "Inter_700Bold", letterSpacing: 1 },
});