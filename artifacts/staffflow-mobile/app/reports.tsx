import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Linking, ActivityIndicator } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { customFetch } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { getBaseUrl } from "@/constants/api";
import { EMPLOYEE_LIST_REPORT, REPORT_GROUPS } from "@/constants/reports";
import { loadReportHistory, removeReportFromHistory, type ReportHistoryItem } from "@/services/reportHistory";

function errMsg(e: any, fallback = "Something went wrong") {
  return e?.data?.error ?? e?.message ?? fallback;
}

export default function CompanyReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"reports" | "downloads">("reports");
  const [openGroup, setOpenGroup] = useState<string | null>("attendance");
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // reload the downloads list whenever this screen comes back into view
  useFocusEffect(
    useCallback(() => {
      loadReportHistory().then(setHistory);
    }, []),
  );
  const openAgain = async (item: ReportHistoryItem) => {
    setBusyId(item.id);
    try {
      // links expire after 10 minutes, so ask for a fresh one each time
      const res = await customFetch<{ path: string }>(`/api/report-files/link?${item.query}`);
      await Linking.openURL(`${getBaseUrl()}${res.path}`);
    } catch (e) {
      Alert.alert("Could not open report", errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = (item: ReportHistoryItem) => {
    Alert.alert("Remove from downloads?", `${item.title} (${item.period})`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await removeReportFromHistory(item.id);
          setHistory(await loadReportHistory());
        },
      },
    ]);
  };

  const goReport = (key: string) => router.push({ pathname: "/report-form", params: { key } });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["reports", "downloads"] as const).map((t) => {
          const on = tab === t;
          return (
            <Pressable key={t} style={styles.tab} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, { color: on ? colors.primary : colors.mutedForeground }]}>
                {t.toUpperCase()}
              </Text>
              <View style={[styles.tabLine, { backgroundColor: on ? colors.primary : "transparent" }]} />
            </Pressable>
          );
        })}
      </View>

      {tab === "reports" ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {REPORT_GROUPS.map((g) => {
            const open = openGroup === g.id;
            return (
              <View key={g.id} style={[styles.block, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
                <Pressable style={styles.row} onPress={() => setOpenGroup(open ? null : g.id)}>
                  <Ionicons name={g.icon} size={26} color={colors.primary} />
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{g.title}</Text>
                  <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={20} color={colors.primary} />
                </Pressable>
                {open && (
                  <View style={styles.subWrap}>
                    {g.reports.map((r, i) => (
                      <Pressable
                        key={r.key}
                        onPress={() => goReport(r.key)}
                        style={[
                          styles.subRow,
                          { borderBottomColor: colors.border },
                          i === g.reports.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <Text style={[styles.subText, { color: colors.foreground }]}>{r.title}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          <View style={[styles.block, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <Pressable style={styles.row} onPress={() => goReport(EMPLOYEE_LIST_REPORT.key)}>
              <Ionicons name="people-outline" size={26} color={colors.primary} />
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Employee List</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          {history.length === 0 ? (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              Reports you download will be listed here so you can open them again.
            </Text>
          ) : (
            history.map((h) => (
              <View key={h.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <Ionicons name="document-text-outline" size={34} color="#16A34A" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>{h.title}</Text>
                    <View style={styles.cardMeta}>
                      <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{h.period}</Text>
                      <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {h.department}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <Pressable style={styles.action} onPress={() => openAgain(h)} disabled={busyId === h.id}>
                    {busyId === h.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={20} color={colors.primary} />
                        <Text style={[styles.actionText, { color: colors.primary }]}>Download</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable style={styles.action} onPress={() => remove(h)}>
                    <Ionicons name="trash-outline" size={20} color="#DC2626" />
                    <Text style={[styles.actionText, { color: "#DC2626" }]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: "center", paddingTop: 16 },
  tabText: { fontSize: 15, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4, paddingBottom: 12 },
  tabLine: { height: 3, alignSelf: "stretch" },
  block: { borderBottomWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 20 },
  rowTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_500Medium" },
  subWrap: { paddingLeft: 60, paddingRight: 24, paddingBottom: 8 },
  subRow: { paddingVertical: 17, borderBottomWidth: 1 },
  subText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  empty: { textAlign: "center", marginTop: 60, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, paddingHorizontal: 24 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTop: { flexDirection: "row", gap: 14 },
  cardTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  cardMeta: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 6 },
  cardSub: { fontSize: 14, fontFamily: "Inter_400Regular", flexShrink: 1 },
  cardActions: { flexDirection: "row", marginTop: 14 },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8 },
  actionText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});