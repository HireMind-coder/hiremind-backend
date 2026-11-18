import { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Linking, Platform,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { getBaseUrl } from "@/constants/api";

type Tab = "request" | "history";

type LeaveOption = { key: string; name: string; balance: number | null };
type Summary = { year: number; options: LeaveOption[] };

type MyLeave = {
  id: number;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  halfDay?: boolean;
  attachmentUrl?: string | null;
  reason?: string | null;
  status: "pending" | "approved" | "rejected";
  approverNote?: string | null;
};

const STATUS: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: "#D97706", bg: "#FEF3C7", label: "Pending" },
  approved: { color: "#16A34A", bg: "#DCFCE7", label: "Approved" },
  rejected: { color: "#DC2626", bg: "#FEE2E2", label: "Rejected" },
};

const BUILTIN_NAMES: Record<string, string> = {
  casual: "Casual Leave",
  sick: "Sick Leave",
  earned: "Earned Leave",
  unpaid: "Unpaid Leave",
};

function typeLabel(type: string): string {
  return BUILTIN_NAMES[type.toLowerCase()] ?? type;
}

function fmt(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function LeaveCard({ item, colors }: { item: MyLeave; colors: ReturnType<typeof useColors> }) {
  const s = STATUS[item.status] ?? STATUS.pending;
  const range = item.startDate === item.endDate ? fmt(item.startDate) : `${fmt(item.startDate)} – ${fmt(item.endDate)}`;
  const length = item.halfDay ? "Half day" : `${item.days} ${item.days === 1 ? "day" : "days"}`;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{typeLabel(item.type)}</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            {range} · {length}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: s.bg }]}>
          <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
        </View>
      </View>
      {item.reason ? <Text style={[styles.reason, { color: colors.mutedForeground }]}>{item.reason}</Text> : null}
      {item.approverNote ? (
        <Text style={[styles.note, { color: colors.foreground }]}>Admin note: {item.approverNote}</Text>
      ) : null}
      {item.attachmentUrl ? (
        <Pressable
          onPress={() => Linking.openURL(`${getBaseUrl()}${item.attachmentUrl}`)}
          style={styles.attach}
          hitSlop={6}
        >
          <Ionicons name="attach" size={14} color="#1D9BF0" />
          <Text style={styles.attachText}>View attachment</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function EmployeeLeavesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("request");

  const summaryQ = useQuery({
    queryKey: ["my-leave-summary"],
    queryFn: () => customFetch<Summary>("/api/leaves/my-summary"),
    throwOnError: false,
  });

  // The server only returns this employee's own leaves
  const leavesQ = useQuery({
    queryKey: ["my-leaves"],
    queryFn: () => customFetch<MyLeave[]>("/api/leaves"),
    throwOnError: false,
  });

  const refreshing = summaryQ.isRefetching || leavesQ.isRefetching;
  const onRefresh = () => {
    summaryQ.refetch();
    leavesQ.refetch();
  };

  const all = leavesQ.data ?? [];
  const pending = all.filter((l) => l.status === "pending");
  const history = all.filter((l) => l.status !== "pending");

  const topPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPadding }]}>
      <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["request", "history"] as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <Pressable key={t} onPress={() => setTab(t)} style={styles.tab}>
              <Text style={[styles.tabText, { color: active ? colors.primary : colors.mutedForeground }]}>
                {t === "request" ? "REQUEST" : "HISTORY"}
              </Text>
              <View style={[styles.tabLine, { backgroundColor: active ? colors.primary : "transparent" }]} />
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 150 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {tab === "request" ? (
          <>
            <View style={[styles.block, { backgroundColor: colors.card }]}>
              <Text style={[styles.blockTitle, { color: colors.foreground }]}>Leave Balance</Text>
              {summaryQ.isLoading ? (
                <ActivityIndicator style={{ marginTop: 14 }} color={colors.primary} />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
                  {(summaryQ.data?.options ?? []).map((o, i) => (
                    <View
                      key={o.key}
                      style={[styles.balItem, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.border }]}
                    >
                      <Text style={[styles.balName, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {o.name}
                      </Text>
                      <Text style={[styles.balValue, { color: colors.foreground }]}>
                        {o.balance == null ? "—" : o.balance}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            <View style={[styles.block, { backgroundColor: colors.card, marginTop: 10 }]}>
              <Text style={[styles.blockTitle, { color: colors.foreground }]}>Pending Requests</Text>
            </View>

            {leavesQ.isLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
            ) : pending.length === 0 ? (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>No Pending Requests</Text>
            ) : (
              <View style={styles.list}>
                {pending.map((l) => (
                  <LeaveCard key={l.id} item={l} colors={colors} />
                ))}
              </View>
            )}
          </>
        ) : leavesQ.isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : history.length === 0 ? (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>No Leave Requests</Text>
        ) : (
          <View style={styles.list}>
            {history.map((l) => (
              <LeaveCard key={l.id} item={l} colors={colors} />
            ))}
          </View>
        )}
      </ScrollView>

      {tab === "request" && (
        <Pressable
          onPress={() => router.push("/request-leave")}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: colors.primary, bottom: insets.bottom + 80 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.fabText}>Request Leave</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: "center", paddingTop: 14 },
  tabText: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.5, marginBottom: 10 },
  tabLine: { height: 3, alignSelf: "stretch" },
  block: { paddingHorizontal: 20, paddingVertical: 18 },
  blockTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  balItem: { paddingHorizontal: 18, minWidth: 96 },
  balName: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 8 },
  balValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  empty: { fontSize: 20, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 90 },
  list: { padding: 16, gap: 10 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 2 },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  reason: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  note: { fontSize: 12, fontFamily: "Inter_500Medium" },
  attach: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  attachText: { color: "#1D9BF0", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  fab: {
    position: "absolute", right: 16, paddingHorizontal: 26, paddingVertical: 16, borderRadius: 30,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  fabText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});