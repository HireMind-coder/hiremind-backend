import { useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Modal, ActivityIndicator, RefreshControl } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { formatRupees } from "@/hooks/useBilling";

type Txn = { id: number; type: "credit" | "debit"; amountPaise: number; description: string; createdAt: string };
type WalletData = { balancePaise: number; from: string; to: string; transactions: Txn[] };

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const PRESETS: Array<{ label: string; range: () => { from: string; to: string } }> = [
  { label: "This month", range: () => { const n = new Date(); return { from: ymd(new Date(n.getFullYear(), n.getMonth(), 1)), to: ymd(n) }; } },
  { label: "Last month", range: () => { const n = new Date(); return { from: ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: ymd(new Date(n.getFullYear(), n.getMonth(), 0)) }; } },
  { label: "Last 30 days", range: () => ({ from: ymd(daysAgo(30)), to: ymd(new Date()) }) },
  { label: "Last 90 days", range: () => ({ from: ymd(daysAgo(90)), to: ymd(new Date()) }) },
  { label: "This year", range: () => { const n = new Date(); return { from: `${n.getFullYear()}-01-01`, to: ymd(n) }; } },
];

function prettyRange(from: string, to: string): string {
  const f = (s: string, withYear: boolean) =>
    new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", ...(withYear ? { year: "numeric" } : {}) });
  return `${f(from, false)} – ${f(to, true)}`;
}

export default function WalletHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState(() => PRESETS[0].range());
  const [filterOpen, setFilterOpen] = useState(false);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["billing-wallet", range.from, range.to],
    queryFn: () => customFetch<WalletData>(`/api/billing/wallet?from=${range.from}&to=${range.to}`),
    throwOnError: false,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>Available Balance</Text>
          <Text style={[styles.balance, { color: colors.foreground }]}>{formatRupees(data?.balancePaise ?? 0)}</Text>
        </View>
        <Pressable onPress={() => router.push("/add-funds")} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.addBtnText}>Add Funds</Text>
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        <Text style={[styles.rangeText, { color: colors.mutedForeground }]}>{prettyRange(range.from, range.to)}</Text>
        <Pressable hitSlop={12} onPress={() => setFilterOpen(true)}>
          <Ionicons name="options-outline" size={24} color={colors.foreground} />
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
      ) : (
        <FlatList
          data={data?.transactions ?? []}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>No transactions for these filters.</Text>
          }
          renderItem={({ item }) => {
            const credit = item.type === "credit";
            return (
              <View style={[styles.txn, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.txnIcon, { backgroundColor: credit ? "#DCFCE7" : "#FEE2E2" }]}>
                  <Ionicons name={credit ? "arrow-down" : "arrow-up"} size={18} color={credit ? "#16A34A" : "#DC2626"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txnTitle, { color: colors.foreground }]}>{item.description}</Text>
                  <Text style={[styles.txnDate, { color: colors.mutedForeground }]}>
                    {new Date(item.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <Text style={[styles.txnAmount, { color: credit ? "#16A34A" : "#DC2626" }]}>
                  {credit ? "+" : "-"}{formatRupees(item.amountPaise)}
                </Text>
              </View>
            );
          }}
        />
      )}

      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFilterOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Filter by date</Text>
            {PRESETS.map((p) => (
              <Pressable
                key={p.label}
                onPress={() => { setRange(p.range()); setFilterOpen(false); }}
                style={[styles.option, { borderBottomColor: colors.border }]}
              >
                <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 15 }}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  balanceCard: { flexDirection: "row", alignItems: "center", margin: 16, padding: 18, borderWidth: 1, borderRadius: 18 },
  balanceLabel: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 6 },
  balance: { fontSize: 32, fontFamily: "Inter_700Bold" },
  addBtn: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 12 },
  addBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  filterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  rangeText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  empty: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 20, paddingHorizontal: 4 },
  txn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderRadius: 14, marginBottom: 8 },
  txnIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  txnTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  txnDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  txnAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  sheet: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold", padding: 18, paddingBottom: 10 },
  option: { paddingHorizontal: 18, paddingVertical: 15, borderBottomWidth: 1 },
});