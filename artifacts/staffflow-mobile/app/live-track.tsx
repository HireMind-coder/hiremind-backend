import { View, Text, StyleSheet, FlatList, Pressable, Linking, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

type LivePoint = {
  employeeId: number;
  employeeName: string;
  role: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
};

const LIVE_WINDOW_MIN = 10;

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function timeAgo(iso: string): string {
  const mins = minutesAgo(iso);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60} min ago`;
}

export default function LiveTrackScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["live-track-live"],
    queryFn: () => customFetch<LivePoint[]>("/api/live-track/live"),
    refetchInterval: 30_000,
    throwOnError: false,
  });

  const openMap = (p: LivePoint) =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(p) => String(p.employeeId)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 8 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="location-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No live locations yet.{"\n"}Employees show up here after they punch in, once Auto-Live Track is on.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const live = minutesAgo(item.recordedAt) <= LIVE_WINDOW_MIN;
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarText}>{item.employeeName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.foreground }]}>{item.employeeName}</Text>
                  <View style={styles.statusRow}>
                    <View style={[styles.dot, { backgroundColor: live ? "#16A34A" : colors.mutedForeground }]} />
                    <Text style={[styles.status, { color: live ? "#16A34A" : colors.mutedForeground }]}>
                      {live ? "Live" : "Last seen"} · {timeAgo(item.recordedAt)}
                    </Text>
                  </View>
                  {item.accuracy != null && (
                    <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                      Accuracy ±{Math.round(item.accuracy)} m
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => openMap(item)}
                  style={({ pressed }) => [styles.mapBtn, { borderColor: colors.primary }, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="map-outline" size={16} color={colors.primary} />
                  <Text style={[styles.mapBtnText, { color: colors.primary }]}>Map</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", marginTop: 60, gap: 12, paddingHorizontal: 24 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderRadius: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontSize: 12, fontFamily: "Inter_500Medium" },
  meta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  mapBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  mapBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});