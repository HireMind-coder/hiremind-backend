import { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal, FlatList, TextInput,
  Alert, ActivityIndicator, Linking,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { getBaseUrl } from "@/constants/api";
import { dayLabel, findReport, monthLabel, toDateStr } from "@/constants/reports";
import { addReportToHistory } from "@/services/reportHistory";

type Staff = { id: number; name: string; department?: string | null };

function errMsg(e: any, fallback = "Something went wrong") {
  return e?.data?.error ?? e?.message ?? fallback;
}

export default function ReportFormScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { key } = useLocalSearchParams<{ key?: string }>();
  const def = findReport(key);

  const now = new Date();
  const [department, setDepartment] = useState<string | null>(null); // null = all
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [day, setDay] = useState(now);
  const [lateAfter, setLateAfter] = useState("10:00");
  const [monthSheet, setMonthSheet] = useState(false);
  const [deptSheet, setDeptSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const staffQuery = useQuery({
    queryKey: ["team-staff"],
    queryFn: () => customFetch<Staff[]>("/api/employees"),
    throwOnError: false,
  });

  const departments = useMemo(() => {
    const set = new Set<string>();
    (staffQuery.data ?? []).forEach((s) => {
      const d = (s.department ?? "").trim();
      if (d) set.add(d);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [staffQuery.data]);

  // last 24 months, newest first
  const months = useMemo(() => {
    const list: { month: number; year: number }[] = [];
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 0; i < 24; i++) {
      list.push({ month: d.getMonth() + 1, year: d.getFullYear() });
      d.setMonth(d.getMonth() - 1);
    }
    return list;
  }, []);

  if (!def) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Unknown report.</Text>
      </View>
    );
  }

  const dateStr = toDateStr(day);
  const isToday = dateStr === toDateStr(new Date());
  const shiftDay = (delta: number) => {
    const next = new Date(day);
    next.setDate(next.getDate() + delta);
    if (next > new Date()) return;
    setDay(next);
  };

  const lateOk = /^([01]?\d|2[0-3]):[0-5]\d$/.test(lateAfter.trim());
  const periodText =
    def.needs === "month" ? monthLabel(month, year) : def.needs === "date" ? dayLabel(dateStr) : "Current list";

  const download = async () => {
    const q = new URLSearchParams({ report: def.key });
    if (def.needs === "month") {
      q.set("month", String(month));
      q.set("year", String(year));
    }
    if (def.needs === "date") q.set("date", dateStr);
    if (department) q.set("department", department);
    if (def.key === "late_arrival") q.set("lateAfter", lateAfter.trim());
    const query = q.toString();

    setBusy(true);
    try {
      const res = await customFetch<{ path: string }>(`/api/report-files/link?${query}`);
      await addReportToHistory({
        key: def.key,
        title: def.title,
        period: periodText,
        department: department ?? "All Departments",
        query,
      });
      // The phone's browser downloads the file; Android then offers Excel / Google Sheets.
      await Linking.openURL(`${getBaseUrl()}${res.path}`);
    } catch (e) {
      Alert.alert("Could not create report", errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: def.title }} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {def.blurb ? (
          <View style={[styles.blurb, { backgroundColor: colors.primary + "14" }]}>
            <Text style={[styles.blurbText, { color: colors.mutedForeground }]}>{def.blurb}</Text>
          </View>
        ) : null}

        {departments.length > 0 && (
          <>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Select Department</Text>
            <Pressable
              onPress={() => setDeptSheet(true)}
              style={[styles.select, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <Text style={[styles.selectText, { color: colors.foreground }]} numberOfLines={1}>
                {department ?? "All Departments"}
              </Text>
              <Ionicons name="chevron-down" size={20} color={colors.foreground} />
            </Pressable>
          </>
        )}

        {def.needs === "month" && (
          <>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Select Duration</Text>
            <Pressable
              onPress={() => setMonthSheet(true)}
              style={[styles.pill, { borderColor: colors.foreground, backgroundColor: colors.card }]}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.foreground} />
              <Text style={[styles.pillText, { color: colors.foreground }]}>{monthLabel(month, year)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.foreground} />
            </Pressable>
          </>
        )}

        {def.needs === "date" && (
          <>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Select Date</Text>
            <View style={styles.dateRow}>
              <Pressable hitSlop={10} onPress={() => shiftDay(-1)}>
                <Ionicons name="chevron-back" size={24} color={colors.foreground} />
              </Pressable>
              <View style={[styles.pill, { borderColor: colors.foreground, backgroundColor: colors.card }]}>
                <Ionicons name="calendar-outline" size={20} color={colors.foreground} />
                <Text style={[styles.pillText, { color: colors.foreground }]}>{dayLabel(dateStr)}</Text>
              </View>
              <Pressable hitSlop={10} onPress={() => shiftDay(1)} disabled={isToday} style={{ opacity: isToday ? 0.25 : 1 }}>
                <Ionicons name="chevron-forward" size={24} color={colors.foreground} />
              </Pressable>
            </View>
          </>
        )}

        {def.key === "late_arrival" && (
          <>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Count as late after (24-hour time)</Text>
            <TextInput
              value={lateAfter}
              onChangeText={setLateAfter}
              placeholder="10:00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              style={[
                styles.select,
                styles.timeInput,
                { borderColor: lateOk ? colors.border : "#DC2626", color: colors.foreground, backgroundColor: colors.card },
              ]}
            />
            {!lateOk && <Text style={styles.err}>Enter a time like 09:30 or 10:00</Text>}
          </>
        )}

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Select Format</Text>
        <View style={[styles.format, { borderColor: colors.primary, backgroundColor: colors.primary + "14" }]}>
          <View style={[styles.radio, { borderColor: colors.primary }]}>
            <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
          </View>
          <Ionicons name={def.format === "print" ? "print-outline" : "document-text-outline"} size={26} color={colors.foreground} />
          <Text style={[styles.formatText, { color: colors.foreground }]}>{def.format === "print" ? "PDF (print)" : "CSV"}</Text>
        </View>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {def.format === "print" ? "Opens in your browser. Tap “Print / Save as PDF”." : "Opens in Excel or Google Sheets."}
        </Text>

        <Pressable
          onPress={download}
          disabled={busy || (def.key === "late_arrival" && !lateOk)}
          style={[
            styles.download,
            { backgroundColor: colors.primary, opacity: busy || (def.key === "late_arrival" && !lateOk) ? 0.5 : 1 },
          ]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.downloadText}>{def.format === "print" ? "View Pay Slips" : "Download Report"}</Text>}
        </Pressable>
      </ScrollView>

      {/* Month sheet */}
      <Modal visible={monthSheet} transparent animationType="slide" onRequestClose={() => setMonthSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMonthSheet(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Select Month</Text>
          <FlatList
            data={months}
            keyExtractor={(m) => `${m.year}-${m.month}`}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => {
              const on = item.month === month && item.year === year;
              return (
                <Pressable
                  style={styles.optRow}
                  onPress={() => {
                    setMonth(item.month);
                    setYear(item.year);
                    setMonthSheet(false);
                  }}
                >
                  <Text style={[styles.optLabel, { color: colors.foreground }]}>{monthLabel(item.month, item.year)}</Text>
                  <View style={[styles.radio, { borderColor: on ? colors.primary : colors.mutedForeground }]}>
                    {on && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>

      {/* Department sheet */}
      <Modal visible={deptSheet} transparent animationType="slide" onRequestClose={() => setDeptSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setDeptSheet(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Select Department</Text>
          <FlatList
            data={[null, ...departments] as (string | null)[]}
            keyExtractor={(d) => d ?? "__all"}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => {
              const on = item === department;
              return (
                <Pressable
                  style={styles.optRow}
                  onPress={() => {
                    setDepartment(item);
                    setDeptSheet(false);
                  }}
                >
                  <Text style={[styles.optLabel, { color: colors.foreground }]}>{item ?? "All Departments"}</Text>
                  <View style={[styles.radio, { borderColor: on ? colors.primary : colors.mutedForeground }]}>
                    {on && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  blurb: { borderRadius: 8, padding: 16, marginBottom: 12 },
  blurbText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  label: { fontSize: 15, fontFamily: "Inter_500Medium", marginTop: 18, marginBottom: 10 },
  select: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 15,
  },
  selectText: { fontSize: 16, fontFamily: "Inter_400Regular", flex: 1 },
  timeInput: { fontSize: 16, fontFamily: "Inter_400Regular", maxWidth: 160 },
  err: { color: "#DC2626", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start",
    borderWidth: 1, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12,
  },
  pillText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  format: {
    flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "flex-start",
    borderWidth: 1, borderRadius: 30, paddingHorizontal: 16, paddingVertical: 12,
  },
  formatText: { fontSize: 17, fontFamily: "Inter_400Regular" },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8 },
  download: { borderRadius: 8, paddingVertical: 16, alignItems: "center", marginTop: 34 },
  downloadText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: "center", width: 48, height: 5, borderRadius: 3, marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 8 },
  optRow: { flexDirection: "row", alignItems: "center", paddingVertical: 15 },
  optLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
});