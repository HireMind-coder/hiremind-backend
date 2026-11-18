import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAttendanceSettings, errMsg, type AttendanceSettings } from "@/hooks/useAttendanceSettings";

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  iconBg: string;
  iconColor: string;
  colors: ReturnType<typeof useColors>;
  onPress?: () => void;
  right?: React.ReactNode;
  disabled?: boolean;
};

function Row({ icon, label, sublabel, iconBg, iconColor, colors, onPress, right, disabled }: RowProps) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
        disabled && { opacity: 0.55 },
        pressed && onPress ? { opacity: 0.7 } : null,
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {sublabel ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sublabel}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} /> : null)}
    </Pressable>
  );
}

function SoonBadge({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.soon, { backgroundColor: colors.muted }]}>
      <Text style={[styles.soonText, { color: colors.mutedForeground }]}>Coming soon</Text>
    </View>
  );
}

export default function AttendanceSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, isLoading, isError, error, refetch, update } = useAttendanceSettings();

  const save = (patch: Partial<AttendanceSettings>) => {
    Haptics.selectionAsync();
    update.mutate(patch, {
      onError: (e) => Alert.alert("Could not save", errMsg(e)),
    });
  };

  const toggleWithNotice = (key: "deviceVerification" | "blockFakeGps", value: boolean, notice: string) => {
    if (!value) {
      save({ [key]: false });
      return;
    }
    Alert.alert("Turn on?", notice, [
      { text: "Cancel", style: "cancel" },
      { text: "Turn on", onPress: () => save({ [key]: true }) },
    ]);
  };
  const toggleAutoTrack = (value: boolean) => {
    if (!value) {
      save({ autoLiveTrack: false });
      return;
    }
    Alert.alert("Enable Auto tracking?", "Track employee's live location for 12 hours when they punch in", [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: () => save({ autoLiveTrack: true }) },
    ]);
  };
  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError || !settings) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 6 }}>
          Could not load attendance settings
        </Text>
        <Text style={{ color: "#DC2626", fontFamily: "Inter_500Medium", fontSize: 12, textAlign: "center", marginBottom: 12 }}>
          {errMsg(error, "Unknown error")}
        </Text>
        <Pressable onPress={() => refetch()} style={[styles.retry, { backgroundColor: colors.primary }]}>
          <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const geofenceSub = settings.geofenceEnabled
    ? `On · within ${settings.geofenceRadius} m of office`
    : settings.geofenceLat != null
      ? "Off · office location saved"
      : "Allow attendance only near your office";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.header, { color: colors.mutedForeground }]}>ATTENDANCE MODES</Text>
      <View style={styles.group}>
        <Row
          icon="scan-outline"
          label="Attendance Kiosk"
          sublabel="Face attendance on a shared tablet / phone"
          iconBg="#DBEAFE"
          iconColor="#2563EB"
          colors={colors}
          onPress={() => router.push("/kiosk")}
        />
      </View>

      <Text style={[styles.header, { color: colors.mutedForeground }]}>FRAUD PREVENTION & SECURE ATTENDANCE</Text>
      <View style={styles.group}>
        <Row
          icon="location-outline"
          label="GPS Based Geofence"
          sublabel={geofenceSub}
          iconBg="#D1FAE5"
          iconColor="#059669"
          colors={colors}
          onPress={() => router.push("/geofence-settings")}
        />
        <Row
          icon="phone-portrait-outline"
          label="Device Verification"
          sublabel="Employees can mark attendance only from an approved phone"
          iconBg="#EDECFE"
          iconColor="#576DFA"
          colors={colors}
          right={
            <Switch
              value={settings.deviceVerification}
              onValueChange={(v) =>
                toggleWithNotice(
                  "deviceVerification",
                  v,
                  "Each employee's first phone is approved automatically. A different phone needs your approval. Employees on an older app version must update first.",
                )
              }
              trackColor={{ false: colors.border, true: colors.primary + "88" }}
              thumbColor={settings.deviceVerification ? colors.primary : "#f4f3f4"}
            />
          }
        />
        <Row
          icon="time-outline"
          label="Device Verification Requests"
          sublabel="Approve or reject new phones"
          iconBg="#FEF3C7"
          iconColor="#D97706"
          colors={colors}
          onPress={() => router.push("/device-requests")}
        />
        <Row
          icon="eye-outline"
          label="Liveness Detection"
          sublabel="Blink / head-turn check during face attendance"
          iconBg={colors.muted}
          iconColor={colors.mutedForeground}
          colors={colors}
          disabled
          right={<SoonBadge colors={colors} />}
        />
        <Row
          icon="navigate-circle-outline"
          label="Block Fake GPS Attendance"
          sublabel="Reject attendance sent with a mock location"
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          colors={colors}
          right={
            <Switch
              value={settings.blockFakeGps}
              onValueChange={(v) =>
                toggleWithNotice(
                  "blockFakeGps",
                  v,
                  "Employees using a fake-GPS app will be blocked. Employees on an older app version must update first.",
                )
              }
              trackColor={{ false: colors.border, true: colors.primary + "88" }}
              thumbColor={settings.blockFakeGps ? colors.primary : "#f4f3f4"}
            />
          }
        />
      </View>

      <Text style={[styles.header, { color: colors.mutedForeground }]}>LEAVES & HOLIDAYS</Text>
      <View style={styles.group}>
        <Row
          icon="calendar-outline"
          label="Leave Requests"
          sublabel="Approve & manage leave requests"
          iconBg="#FEF3C7"
          iconColor="#D97706"
          colors={colors}
          onPress={() => router.push("/leaves")}
        />
        <Row
          icon="ribbon-outline"
          label="Custom Paid Leaves"
          sublabel="Create your own leave types"
          iconBg="#DCFCE7"
          iconColor="#16A34A"
          colors={colors}
          onPress={() => router.push("/custom-leaves")}
        />
        <Row
          icon="sunny-outline"
          label="Holiday List"
          sublabel="Public and company holidays"
          iconBg="#FCE7F3"
          iconColor="#DB2777"
          colors={colors}
          onPress={() => router.push("/holidays")}
        />
      </View>

      <Text style={[styles.header, { color: colors.mutedForeground }]}>AUTOMATION</Text>
      <View style={styles.group}>
        <Row
          icon="pin-outline"
          label="Auto-Live Track"
          sublabel="Track employee location for 12 hours after punch-in"
          iconBg="#D1FAE5"
          iconColor="#059669"
          colors={colors}
          right={
            <Switch
              value={settings.autoLiveTrack}
              onValueChange={toggleAutoTrack}
              trackColor={{ false: colors.border, true: colors.primary + "88" }}
              thumbColor={settings.autoLiveTrack ? colors.primary : "#f4f3f4"}
            />
          }
        />
        <Row
          icon="map-outline"
          label="Live Locations"
          sublabel="See where your team is right now"
          iconBg="#DBEAFE"
          iconColor="#2563EB"
          colors={colors}
          onPress={() => router.push("/live-track")}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  retry: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10 },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  header: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 8, paddingHorizontal: 4 },
  group: { marginBottom: 24, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1, borderRadius: 14, gap: 14 },
  rowIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  soon: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  soonText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});