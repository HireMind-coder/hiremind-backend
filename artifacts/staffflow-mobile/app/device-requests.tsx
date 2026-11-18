import { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { errMsg } from "@/hooks/useAttendanceSettings";

type DeviceRow = {
  id: number;
  employeeId: number;
  employeeName: string;
  deviceId: string;
  deviceName: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

const FILTERS: Array<{ key: DeviceRow["status"]; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const STATUS_STYLE: Record<DeviceRow["status"], { bg: string; fg: string }> = {
  pending: { bg: "#FEF3C7", fg: "#D97706" },
  approved: { bg: "#DCFCE7", fg: "#16A34A" },
  rejected: { bg: "#FEE2E2", fg: "#DC2626" },
};

const DEVICES_KEY = ["attendance-devices"];

export default function DeviceRequestsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<DeviceRow["status"]>("pending");

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: DEVICES_KEY,
    queryFn: () => customFetch<DeviceRow[]>("/api/attendance-settings/devices"),
    throwOnError: false,
  });

  const decide = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "approved" | "rejected" }) =>
      customFetch(`/api/attendance-settings/devices/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: DEVICES_KEY });
    },
    onError: (e) => Alert.alert("Could not update", errMsg(e)),
    throwOnError: false,
  });

  const remove = useMutation({
    mutationFn: (id: number) => customFetch(`/api/attendance-settings/devices/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEVICES_KEY }),
    onError: (e) => Alert.alert("Could not remove", errMsg(e)),
    throwOnError: false,
  });

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    (data ?? []).forEach((d) => { c[d.status] += 1; });
    return c;
  }, [data]);

  const rows = useMemo(() => (data ?? []).filter((d) => d.status === filter), [data, filter]);

  const confirmRemove = (d: DeviceRow) =>
    Alert.alert(
      "Remove device?",
      `${d.employeeName} will have to register a phone again the next time they mark attendance.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => remove.mutate(d.id) },
      ],
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.chip,
                { borderColor: colors.border, backgroundColor: colors.card },
                active && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? "#fff" : colors.foreground }]}>
                {f.label} ({counts[f.key]})
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: insets.bottom + 24, gap: 8 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="phone-portrait-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No {filter} device requests
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const st = STATUS_STYLE[item.status];
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.foreground }]}>{item.employeeName}</Text>
                    <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                      {item.deviceName ?? "Unknown device"} ·{" "}
                      {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.badgeText, { color: st.fg }]}>{item.status}</Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  {item.status !== "approved" && (
                    <Pressable
                      style={[styles.btn, { backgroundColor: "#16A34A" }]}
                      onPress={() => decide.mutate({ id: item.id, status: "approved" })}
                    >
                      <Text style={styles.btnText}>Approve</Text>
                    </Pressable>
                  )}
                  {item.status === "pending" && (
                    <Pressable
                      style={[styles.btn, { backgroundColor: "#DC2626" }]}
                      onPress={() => decide.mutate({ id: item.id, status: "rejected" })}
                    >
                      <Text style={styles.btnText}>Reject</Text>
                    </Pressable>
                  )}
                  {item.status !== "pending" && (
                    <Pressable
                      style={[styles.btn, { borderWidth: 1, borderColor: colors.border }]}
                      onPress={() => confirmRemove(item)}
                    >
                      <Text style={[styles.btnText, { color: colors.foreground }]}>Remove</Text>
                    </Pressable>
                  )}
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
  chips: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 12 },
  chip: { flex: 1, alignItems: "center", paddingVertical: 9, borderWidth: 1, borderRadius: 10 },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  actions: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10 },
  btnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});