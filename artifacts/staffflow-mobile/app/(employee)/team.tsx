import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAccessRole } from "@/hooks/useAccessRole";

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
};

function Row({ icon, label, sublabel, onPress, colors }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.muted }]}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>{sublabel}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function TeamToolsScreen() {
  const colors = useColors();
  const { label, canMarkAttendance, canManageSalary } = useAccessRole();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.badge, { backgroundColor: colors.primary + "1A" }]}>
        <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
        <Text style={[styles.badgeText, { color: colors.primary }]}>Your role: {label}</Text>
      </View>

      {canMarkAttendance && (
        <Row
          icon="calendar-outline"
          label="Team Attendance"
          sublabel="Mark attendance for everyone"
          colors={colors}
          onPress={() => router.push("/team-attendance")}
        />
      )}
      {canManageSalary && (
        <>
          <Row
            icon="cash-outline"
            label="Salary & Payroll"
            sublabel="View and process salaries"
            colors={colors}
            onPress={() => router.push("/salary")}
          />
          <Row
            icon="card-outline"
            label="Payments"
            sublabel="Record and review payments"
            colors={colors}
            onPress={() => router.push("/payments")}
          />
        </>
      )}
      {!canMarkAttendance && (
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          You don't have any team tools yet. Ask your admin to change your role.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 120 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginBottom: 8,
  },
  badgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 16, borderWidth: 1, borderRadius: 14,
  },
  iconWrap: { width: 42, height: 42, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  note: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 24, lineHeight: 21 },
});