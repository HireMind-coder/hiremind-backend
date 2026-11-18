import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useGetDashboardStats, useGetSmartInsights, useGetAttendanceTrend } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";

function StatCard({ label, value, icon, color, bg, onPress }: { label: string; value: string | number; icon: string; color: string; bg: string; onPress?: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}

function TrendBar({ day, count, total }: { day: string; count: number; total: number }) {
  const colors = useColors();
  const pct = total > 0 ? count / total : 0;
  return (
    <View style={styles.barGroup}>
      <View style={[styles.barTrack, { backgroundColor: colors.muted }]}>
        <View style={[styles.barFill, { height: `${Math.max(pct * 100, 4)}%` as any, backgroundColor: colors.primary }]} />
      </View>
      <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>{day}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetDashboardStats();
  const { data: insights, isLoading: insightsLoading } = useGetSmartInsights();
  const { data: trend, isLoading: trendLoading } = useGetAttendanceTrend();

  const isLoading = statsLoading || insightsLoading || trendLoading;

  const onRefresh = () => refetchStats();

  const topPadding = Platform.OS === "web" ? 67 : 0;

  if (isLoading) {
    return (
      <View style={[styles.loader, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Greeting */}
      <View
        style={[
          styles.greeting,
          { paddingTop: topPadding + 8, flexDirection: "column", alignItems: "stretch" },
        ]}
      >
        {/* One line: company name + bell + avatar */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={[styles.greetingName, { color: colors.foreground, flex: 1, marginRight: 12 }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {user?.companyName ?? "Dashboard"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, flexShrink: 0 }}>
            <Pressable onPress={() => router.push("/notifications")} hitSlop={10}>
              <Ionicons name="notifications-outline" size={26} color={colors.foreground} />
            </Pressable>
            <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0) ?? "A"}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.greetingUser, { color: colors.mutedForeground, marginTop: -4 }]}>
          Welcome back, {user?.name?.split(" ")[0]}
        </Text>
      </View>
      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <StatCard
          label="Total Employees"
          value={stats?.totalEmployees ?? 0}
          icon="people"
          color="#576DFA"
          bg="#EDECFE"
          onPress={() => router.push("/(tabs)/employees")}
        />
        <StatCard
          label="Present Today"
          value={stats?.presentToday ?? 0}
          icon="checkmark-circle"
          color="#22C55E"
          bg="#DCFCE7"
          onPress={() => router.push("/(tabs)/attendance")}
        />
        <StatCard
          label="Pending Leaves"
          value={stats?.pendingLeaves ?? 0}
          icon="time"
          color="#F59E0B"
          bg="#FEF3C7"
          onPress={() => router.push("/leaves")}
        />
        <StatCard
          label="Active Tasks"
          value={stats?.activeTasks ?? 0}
          icon="list"
          color="#38BDF8"
          bg="#E0F2FE"
          onPress={() => router.push("/(tabs)/tasks")}
        />
      </View>

      {/* Attendance trend */}
      {trend && trend.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Attendance — Last 7 Days</Text>
          <View style={styles.trendChart}>
            {trend.map((d: any) => (
              <TrendBar
                key={d.date}
                day={new Date(d.date).toLocaleDateString("en", { weekday: "short" })}
                count={d.present}
                total={d.total}
              />
            ))}
          </View>
        </View>
      )}

      {/* Smart insights */}
      {insights && insights.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Smart Insights</Text>
          {insights.map((insight: any, i: number) => (
            <View
              key={i}
              style={[styles.insightRow, { borderTopColor: colors.border, borderTopWidth: i > 0 ? 1 : 0 }]}
            >
              <View style={[styles.insightDot, { backgroundColor: insight.type === "warning" ? "#F59E0B" : insight.type === "error" ? "#EF4444" : "#22C55E" }]} />
              <Text style={[styles.insightText, { color: colors.foreground }]}>{insight.message}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 100) }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  greetingName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  greetingUser: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: "47%",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 16,
  },
  trendChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 80,
    gap: 8,
  },
  barGroup: {
    flex: 1,
    alignItems: "center",
    height: "100%",
    justifyContent: "flex-end",
    gap: 4,
  },
  barTrack: {
    width: "100%",
    flex: 1,
    borderRadius: 4,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    gap: 10,
  },
  insightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
