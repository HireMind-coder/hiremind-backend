import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useBillingSummary, formatRupees, formatDate } from "@/hooks/useBilling";

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  colors: ReturnType<typeof useColors>;
  onPress?: () => void;
  soon?: boolean;
  last?: boolean;
};

function Row({ icon, label, sublabel, colors, onPress, soon, last }: RowProps) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: colors.border },
        soon && { opacity: 0.55 },
        pressed && onPress ? { opacity: 0.7 } : null,
      ]}
    >
      <Ionicons name={icon} size={22} color={colors.foreground} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {sublabel ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sublabel}</Text> : null}
      </View>
      {soon ? (
        <View style={[styles.soon, { backgroundColor: colors.muted }]}>
          <Text style={[styles.soonText, { color: colors.mutedForeground }]}>Coming soon</Text>
        </View>
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
      ) : null}
    </Pressable>
  );
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

export default function BillingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useBillingSummary();

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 12 }}>
          Could not load billing details
        </Text>
        <Pressable onPress={() => refetch()} style={[styles.retry, { backgroundColor: colors.primary }]}>
          <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  let bannerText: string | null = null;
  if (data.status === "expired") {
    bannerText = `Your plan expired on ${formatDate(data.validTill)}. Renew to keep your plan active.`;
  } else if (data.isTrial) {
    bannerText = `You are on a free trial that ends on ${formatDate(data.validTill)} (${data.daysLeft} days left). Renew to continue.`;
  } else if (data.status === "expiring") {
    bannerText = `Your plan ends on ${formatDate(data.validTill)} (${data.daysLeft} days left). Renew now to avoid interruption.`;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {bannerText && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{bannerText}</Text>
          <Pressable onPress={() => router.push("/renew-plan")} style={[styles.bannerBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.bannerBtnText}>Renew</Text>
          </Pressable>
        </View>
      )}

      <Section title="Wallet" colors={colors}>
        <View style={[styles.balanceRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
          <Ionicons name="wallet-outline" size={24} color={colors.foreground} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Available Balance</Text>
            <Text style={[styles.balance, { color: colors.mutedForeground }]}>{formatRupees(data.walletBalancePaise)}</Text>
          </View>
          <Pressable hitSlop={10} onPress={() => router.push("/add-funds")}>
            <Text style={[styles.addFunds, { color: colors.primary }]}>Add Funds</Text>
          </Pressable>
        </View>
        <Row
          icon="time-outline"
          label="Wallet History"
          sublabel="View your wallet transactions"
          colors={colors}
          onPress={() => router.push("/wallet-history")}
          last
        />
      </Section>

      <Section title="Subscriptions" colors={colors}>
        <Row icon="diamond-outline" label="Upgrade Plan" colors={colors} onPress={() => router.push("/upgrade-plan")} />
        <Row icon="refresh-outline" label="Renew Plan" colors={colors} onPress={() => router.push("/renew-plan")} />
        <Row icon="information-circle-outline" label="Check Plan Details" colors={colors} onPress={() => router.push("/plan-details")} last />
      </Section>

      <Section title="Biometric Devices" colors={colors}>
        <Row icon="finger-print-outline" label="Buy Biometric Device" colors={colors} soon last />
      </Section>

      <Section title="Invoices" colors={colors}>
        <Row icon="receipt-outline" label="Invoice History" colors={colors} onPress={() => router.push("/invoice-history")} />
        <Row icon="document-text-outline" label="Billing Details" sublabel="GST and billing address" colors={colors} onPress={() => router.push("/billing-details")} last />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  retry: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10 },
  banner: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 22,
    backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FCD34D", borderRadius: 14,
  },
  bannerText: { flex: 1, color: "#92400E", fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 19 },
  bannerBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  bannerBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 8, paddingHorizontal: 4 },
  card: { borderRadius: 14, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 16 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  rowSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 16 },
  balance: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 2 },
  addFunds: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  soon: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  soonText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});