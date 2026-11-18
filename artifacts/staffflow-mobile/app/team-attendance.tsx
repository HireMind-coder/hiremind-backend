import { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

type Staff = { id: number; name: string; role?: string | null };
type Att = { id: number; employeeId: number; status: string; checkIn?: string | null; checkOut?: string | null };

const STATUSES = [
  { value: "present", label: "Present", color: "#059669", bg: "#D1FAE5" },
  { value: "half_day", label: "Half Day", color: "#D97706", bg: "#FEF3C7" },
  { value: "absent", label: "Absent", color: "#DC2626", bg: "#FEE2E2" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function errMsg(e: any, fallback = "Something went wrong") {
  return e?.data?.error ?? e?.message ?? fallback;
}

export default function TeamAttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [day, setDay] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  const dateStr = toStr(day);
  const isToday = dateStr === toStr(new Date());

  const staffQuery = useQuery({
    queryKey: ["team-emps"],
    queryFn: () => customFetch<Staff[]>("/api/employees"),
    throwOnError: false,
  });
  const attQuery = useQuery({
    queryKey: ["team-att", dateStr],
    queryFn: () => customFetch<Att[]>(`/api/attendance?date=${dateStr}`),
    throwOnError: false,
  });

  const byEmployee = useMemo(() => {
    const map = new Map<number, Att>();
    (attQuery.data ?? []).forEach((a) => map.set(a.employeeId, a));
    return map;
  }, [attQuery.data]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (staffQuery.data ?? [])
      .filter((s) => (q ? s.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staffQuery.data, search]);

  const counts = useMemo(() => {
    const c = { present: 0, half_day: 0, absent: 0 } as Record<string, number>;
    (attQuery.data ?? []).forEach((a) => { if (a.status in c) c[a.status] += 1; });
    return c;
  }, [attQuery.data]);

  const shiftDay = (delta: number) => {
    const next = new Date(day);
    next.setDate(next.getDate() + delta);
    if (next > new Date()) return; // no future dates
    setDay(next);
  };

  const mark = async (emp: Staff, status: string) => {
    const existing = byEmployee.get(emp.id);
    if (existing?.status === status) return;
    setSavingId(emp.id);
    try {
      await customFetch("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          records: [{
            employeeId: emp.id,
            date: dateStr,
            status,
            // keep times that were already recorded (saving would otherwise clear them)
            checkIn: existing?.checkIn ?? null,
            checkOut: existing?.checkOut ?? null,
          }],
        }),
      });
      Haptics.selectionAsync();
      await queryClient.invalidateQueries({ queryKey: ["team-att", dateStr] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
    } catch (e) {
      Alert.alert("Could not save", errMsg(e));
    } finally {
      setSavingId(null);
    }
  };

  const loading = staffQuery.isLoading || attQuery.isLoading;
  const error = staffQuery.error || attQuery.error;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Date bar */}
      <View style={[styles.dateBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable hitSlop={10} onPress={() => shiftDay(-1)}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.dateText, { color: colors.foreground }]}>
            {day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </Text>
          {isToday && <Text style={[styles.todayTag, { color: colors.primary }]}>Today</Text>}
        </View>
        <Pressable hitSlop={10} onPress={() => shiftDay(1)} disabled={isToday} style={{ opacity: isToday ? 0.25 : 1 }}>
          <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Counts */}
      <View style={styles.counts}>
        {STATUSES.map((s) => (
          <View key={s.value} style={[styles.countBox, { backgroundColor: s.bg }]}>
            <Text style={[styles.countNum, { color: s.color }]}>{counts[s.value] ?? 0}</Text>
            <Text style={[styles.countLabel, { color: s.color }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search employee"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : error ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>{errMsg(error)}</Text>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120 }}
          refreshControl={
            <RefreshControl
              refreshing={staffQuery.isRefetching || attQuery.isRefetching}
              onRefresh={() => { staffQuery.refetch(); attQuery.refetch(); }}
            />
          }
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.mutedForeground }]}>No employees found.</Text>}
          renderItem={({ item }) => {
            const current = byEmployee.get(item.id)?.status;
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
                  {savingId === item.id && <ActivityIndicator size="small" color={colors.primary} />}
                </View>
                {item.role ? (
                  <Text style={[styles.jobRole, { color: colors.mutedForeground }]} numberOfLines={1}>{item.role}</Text>
                ) : null}
                <View style={styles.actions}>
                  {STATUSES.map((s) => {
                    const on = current === s.value;
                    return (
                      <Pressable
                        key={s.value}
                        disabled={savingId !== null}
                        onPress={() => mark(item, s.value)}
                        style={[
                          styles.statusBtn,
                          on
                            ? { backgroundColor: s.color, borderColor: s.color }
                            : { backgroundColor: "transparent", borderColor: colors.border },
                        ]}
                      >
                        <Text style={[styles.statusText, { color: on ? "#fff" : colors.foreground }]}>{s.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dateBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderRadius: 14,
  },
  dateText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  todayTag: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  counts: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  countBox: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  countNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  countLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  search: {
    flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginVertical: 12,
    paddingHorizontal: 14, borderWidth: 1, borderRadius: 12,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14, fontFamily: "Inter_400Regular", paddingHorizontal: 24 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold", flex: 1 },
  jobRole: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  statusBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  statusText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});