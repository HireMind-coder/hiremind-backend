import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useBillingSummary, formatDate } from "@/hooks/useBilling";

export default function PlanDetailsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useBillingSummary();

  if (isLoading || !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const statusColor = data.status === "expired" ? "#DC2626" : data.status === "expiring" ? "#D97706" : "#16A34A";
  const statusText =
    data.status === "expired" ? "Expired" : data.isTrial ? "Free trial" : data.status === "expiring" ? "Expiring soon" : "Active";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.topRow}>
          <View style={styles.stat}>
            <View style={styles.statIcon}>
              <Ionicons name="people-outline" size={26} color="#2563EB" />
            </View>
            <View>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Staff Limit</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{data.staffLimit}</Text>
              <Text style={[styles.statSub, { color: colors.mutedForeground }]}>{data.activeStaff} active</Text>
            </View>
          </View>
          <View style={styles.stat}>
            <View style={styles.statIcon}>
              <Ionicons name="calendar-outline" size={26} color="#2563EB" />
            </View>
            <View>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Valid Till</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{formatDate(data.validTill)}</Text>
              <Text style={[styles.statSub, { color: statusColor }]}>{statusText}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.sectionHead}>
          <Ionicons name="star" size={18} color={colors.mutedForeground} />
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>FEATURES</Text>
        </View>
        {data.features.map((f) => (
          <Pressable key={f.id} onPress={() => Alert.alert(f.name, f.description)} style={styles.itemRow}>
            <Text style={[styles.itemName, { color: colors.foreground }]}>{f.name}</Text>
            <Ionicons name="information-circle-outline" size={24} color={colors.mutedForeground} />
          </Pressable>
        ))}

        <View style={[styles.divider, { backgroundColor: colors.border, marginTop: 10 }]} />

        <View style={styles.sectionHead}>
          <Ionicons name="add" size={20} color={colors.mutedForeground} />
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ADDONS</Text>
        </View>
        {data.addons.length === 0 ? (
          <Text style={[styles.none, { color: colors.foreground }]}>No Addons included in your plan</Text>
        ) : (
          data.addons.map((a) => (
            <Pressable key={a.id} onPress={() => Alert.alert(a.name, a.description)} style={styles.itemRow}>
              <Text style={[styles.itemName, { color: colors.foreground }]}>{a.name}</Text>
              <Ionicons name="information-circle-outline" size={24} color={colors.mutedForeground} />
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 18, padding: 18 },
  topRow: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  statIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: "#E8F0FE", alignItems: "center", justifyContent: "center" },
  statLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statValue: { fontSize: 17, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  statSub: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  divider: { height: 1, marginVertical: 18 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  itemName: { fontSize: 17, fontFamily: "Inter_500Medium" },
  none: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center", paddingVertical: 8 },
});