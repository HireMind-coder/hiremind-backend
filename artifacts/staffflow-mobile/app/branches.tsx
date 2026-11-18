import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

type Branch = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  radius: number;
};

export default function BranchesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["company-branches"],
    queryFn: () => customFetch<Branch[]>("/api/company/branches"),
    throwOnError: false,
  });

  const remove = useMutation({
    mutationFn: (id: number) => customFetch(`/api/company/branches/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-branches"] }),
    onError: (e: any) => Alert.alert("Could not delete", e?.data?.error ?? e?.message ?? "Please try again."),
    throwOnError: false,
  });

  const showMenu = (b: Branch) =>
    Alert.alert(b.name, undefined, [
      { text: "Edit", onPress: () => router.push({ pathname: "/add-branch", params: { id: String(b.id) } }) },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert("Delete branch?", `“${b.name}” will be removed.`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => remove.mutate(b.id) },
          ]),
      },
      { text: "Cancel", style: "cancel" },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="git-network-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No branches added yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: "/add-branch", params: { id: String(item.id) } })}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: colors.border, backgroundColor: colors.card },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={styles.radius}>
                <Ionicons name="locate-outline" size={26} color={colors.mutedForeground} />
                <Text style={[styles.radiusValue, { color: colors.mutedForeground }]}>{item.radius} M</Text>
                <Text style={[styles.radiusLabel, { color: colors.mutedForeground }]}>Radius</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[styles.address, { color: colors.mutedForeground }]}>
                  {[item.address, item.city, [item.state, item.pincode].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(", ") || "No address added"}
                </Text>
                {item.latitude == null && (
                  <Text style={styles.warn}>Location not set (not used for attendance radius)</Text>
                )}
              </View>
              <Pressable hitSlop={12} onPress={() => showMenu(item)}>
                <Ionicons name="ellipsis-vertical" size={20} color={colors.mutedForeground} />
              </Pressable>
            </Pressable>
          )}
        />
      )}

      <Pressable
        onPress={() => router.push("/add-branch")}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.primary, bottom: insets.bottom + 20 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Add Branch</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", marginTop: 80, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1 },
  radius: { alignItems: "center", width: 64 },
  radiusValue: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 2 },
  radiusLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  address: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  warn: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#D97706", marginTop: 4 },
  fab: {
    position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 28,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  fabText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});