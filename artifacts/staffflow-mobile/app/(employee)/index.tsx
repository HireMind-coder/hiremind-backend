import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { router } from "expo-router";
import { useListAttendance, useListTasks } from "@workspace/api-client-react";
import { useState } from "react";

function StatCard({ label, value, icon, color, bg, onPress }: { label: string; value: string | number; icon: string; color: string; bg: string; onPress?: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}

// Tiles under the stats. Add a line here to add a tile.
const QUICK_ACTIONS: Array<{
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  bg: string;
  color: string;
}> = [
  { label: "Request Leave", icon: "airplane-outline", href: "/request-leave", bg: "#FEF3C7", color: "#D97706" },
  { label: "Holiday List", icon: "calendar-outline", href: "/employee-holidays", bg: "#FCE7F3", color: "#DB2777" },
  { label: "My Documents", icon: "folder-open-outline", href: "/documents", bg: "#DBEAFE", color: "#2563EB" },
  { label: "Refer a Friend", icon: "gift-outline", href: "/refer-a-friend", bg: "#D1FAE5", color: "#059669" },
];

export default function EmployeeDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const now = new Date();
  const [refreshing, setRefreshing] = useState(false);

  const { data: attendance, refetch: refetchAttendance } = useListAttendance({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });

  const { data: tasks, refetch: refetchTasks } = useListTasks({});

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchAttendance(), refetchTasks()]);
    setRefreshing(false);
  };

  // Filter for this employee only
  const empId = (user as any)?.employeeId;
  const myAttendance = (attendance ?? []).filter((a: any) => a.employeeId === empId);
  const myTasks = (tasks ?? []).filter((t: any) => t.employeeId === empId);

  const presentDays = myAttendance.filter((a: any) => a.status === "present").length;
  const absentDays = myAttendance.filter((a: any) => a.status === "absent").length;
  const pendingTasks = myTasks.filter((t: any) => t.status !== "completed").length;
  const completedTasks = myTasks.filter((t: any) => t.status === "completed").length;

  // Today's attendance
  const todayStr = now.toISOString().split("T")[0];
  const todayAttendance = myAttendance.find((a: any) => a.date === todayStr);

  const topPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Greeting */}
      <View style={[styles.greeting, { paddingTop: topPadding + 8 }]}>
        <View>
          <Text style={[styles.greetingName, { color: colors.foreground }]}>
            Hello, {user?.name?.split(" ")[0]} 👋
          </Text>
          <Text style={[styles.greetingUser, { color: colors.mutedForeground }]}>
            {now.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })}
          </Text>
        </View>
        <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0) ?? "E"}</Text>
        </View>
      </View>

      {/* Today's Status */}
      <View style={[styles.todayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.todayTitle, { color: colors.foreground }]}>Today's Status</Text>
        {todayAttendance ? (
          <View style={styles.todayInfo}>
            <View style={[styles.statusBadge, { backgroundColor: "#DCFCE7" }]}>
              <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
              <Text style={[styles.statusText, { color: "#16A34A" }]}>Present</Text>
            </View>
            <Text style={[styles.todayTime, { color: colors.mutedForeground }]}>
              {todayAttendance.checkIn ? `In: ${todayAttendance.checkIn}` : ""}
              {todayAttendance.checkOut ? `  •  Out: ${todayAttendance.checkOut}` : ""}
            </Text>
          </View>
        ) : (
          <View style={styles.todayInfo}>
            <View style={[styles.statusBadge, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="close-circle" size={16} color="#DC2626" />
              <Text style={[styles.statusText, { color: "#DC2626" }]}>Not Marked</Text>
            </View>
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsGrid}>
        <StatCard
          label="Present Days"
          value={presentDays}
          icon="checkmark-circle"
          color="#22C55E"
          bg="#DCFCE7"
          onPress={() => router.push("/(employee)/attendance")}
        />
        <StatCard
          label="Absent Days"
          value={absentDays}
          icon="close-circle"
          color="#EF4444"
          bg="#FEE2E2"
          onPress={() => router.push("/(employee)/attendance")}
        />
        <StatCard
          label="Pending Tasks"
          value={pendingTasks}
          icon="time"
          color="#F59E0B"
          bg="#FEF3C7"
          onPress={() => router.push("/(employee)/tasks")}
        />
        <StatCard
          label="Completed Tasks"
          value={completedTasks}
          icon="checkmark-done"
          color="#38BDF8"
          bg="#E0F2FE"
          onPress={() => router.push("/(employee)/tasks")}
        />
      </View>
      {/* Quick Actions */}
      <View style={styles.actionsGrid}>
        {QUICK_ACTIONS.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => router.push(a.href as any)}
            style={({ pressed }) => [styles.actionTile, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.actionIcon, { backgroundColor: a.bg }]}>
              <Ionicons name={a.icon} size={22} color={a.color} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.foreground }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      {/* Recent Attendance */}
      {myAttendance.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Attendance</Text>
          {myAttendance.slice(0, 5).map((a: any) => (
            <View key={a.id} style={[styles.attRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.attDate, { color: colors.foreground }]}>
                {new Date(a.date).toLocaleDateString("en", { day: "numeric", month: "short" })}
              </Text>
              <Text style={[styles.attTime, { color: colors.mutedForeground }]}>
                {a.checkIn ? `In: ${a.checkIn}` : ""}
                {a.checkOut ? ` • Out: ${a.checkOut}` : ""}
              </Text>
              <View style={[styles.attBadge, { backgroundColor: a.status === "present" ? "#DCFCE7" : "#FEE2E2" }]}>
                <Text style={{ color: a.status === "present" ? "#16A34A" : "#DC2626", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {a.status === "present" ? "Present" : a.status === "absent" ? "Absent" : "Half Day"}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: insets.bottom + 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  greeting: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 20,
  },
  greetingName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  greetingUser: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  todayCard: {
    marginHorizontal: 16, marginBottom: 16, borderRadius: 16,
    padding: 16, borderWidth: 1,
  },
  todayTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  todayInfo: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  statusText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  todayTime: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12, marginBottom: 16 },
  statCard: { width: "47%", borderRadius: 16, padding: 16, borderWidth: 1, gap: 8 },
  statIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 26, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, paddingHorizontal: 16, marginBottom: 16 },
  actionTile: { width: "31%", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 8, borderWidth: 1, alignItems: "center", gap: 10 },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  section: { marginHorizontal: 16, marginBottom: 16, borderRadius: 16, padding: 16, borderWidth: 1 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  attRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderTopWidth: 1, gap: 8 },
  attDate: { fontSize: 13, fontFamily: "Inter_600SemiBold", width: 60 },
  attTime: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  attBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
});
