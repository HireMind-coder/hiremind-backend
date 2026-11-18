import { useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

type Holiday = { id: number; date: string; name: string };

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysUntil(ymd: string): number {
  const a = new Date(`${todayYmd()}T00:00:00`).getTime();
  const b = new Date(`${ymd}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export default function EmployeeHolidaysScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [year, setYear] = useState(new Date().getFullYear());

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["employee-holidays", year],
    queryFn: () => customFetch<Holiday[]>(`/api/attendance-settings/holidays?year=${year}`),
    throwOnError: false,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.yearBar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable hitSlop={12} onPress={() => setYear((y) => y - 1)}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.yearText, { color: colors.foreground }]}>{year}</Text>
        <Pressable hitSlop={12} onPress={() => setYear((y) => y + 1)}>
          <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(h) => String(h.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 8 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="sunny-outline" size={44} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No holidays added for {year}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const d = new Date(`${item.date}T00:00:00`);
            const diff = daysUntil(item.date);
            const past = diff < 0;
            const tag = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff > 1 && diff <= 30 ? `In ${diff} days` : null;

            return (
              <View
                style={[
                  styles.row,
                  { backgroundColor: colors.card, borderColor: diff === 0 ? colors.primary : colors.border },
                  past && { opacity: 0.55 },
                ]}
              >
                <View style={[styles.dateBox, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.dateDay, { color: colors.primary }]}>{d.getDate()}</Text>
                  <Text style={[styles.dateMonth, { color: colors.primary }]}>
                    {d.toLocaleDateString("en-IN", { month: "short" }).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
                  <Text style={[styles.weekday, { color: colors.mutedForeground }]}>
                    {d.toLocaleDateString("en-IN", { weekday: "long" })}
                  </Text>
                </View>
                {tag && (
                  <View style={[styles.tag, { backgroundColor: colors.primary }]}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  yearBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28, paddingVertical: 12, borderBottomWidth: 1 },
  yearText: { fontSize: 18, fontFamily: "Inter_700Bold", minWidth: 60, textAlign: "center" },
  empty: { alignItems: "center", marginTop: 70, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderWidth: 1, borderRadius: 14 },
  dateBox: { width: 54, height: 54, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dateDay: { fontSize: 20, fontFamily: "Inter_700Bold", lineHeight: 24 },
  dateMonth: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  weekday: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  tag: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
});