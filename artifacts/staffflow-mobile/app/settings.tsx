import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

function InfoRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function SettingRow({ icon, label, sublabel, iconBg, iconColor, onPress, right, colors }: {
  icon: string; label: string; sublabel?: string; iconBg: string; iconColor: string;
  onPress?: () => void; right?: React.ReactNode; colors: any;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.settingRow,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && onPress ? { opacity: 0.7 } : null,
      ]}
      onPress={onPress}
    >
      <View style={[styles.settingIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingLabel, { color: colors.foreground }]}>{label}</Text>
        {sublabel ? <Text style={[styles.settingSub, { color: colors.mutedForeground }]}>{sublabel}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} /> : null)}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile card */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.profileAvatarText}>{user?.name?.charAt(0) ?? "A"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.profileName, { color: colors.foreground }]}>{user?.name}</Text>
          <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{user?.email}</Text>
        </View>
      </View>

      {/* Account Info */}
      <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ACCOUNT INFO</Text>
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <InfoRow label="Name" value={user?.name ?? "—"} colors={colors} />
        <InfoRow label="Email" value={user?.email ?? "—"} colors={colors} />
        <InfoRow label="Company" value={user?.companyName ?? "—"} colors={colors} />
        <InfoRow label="Role" value={user?.role ?? "admin"} colors={colors} />
      </View>

      {/* Appearance */}
      <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>APPEARANCE</Text>
      <View style={styles.settingsGroup}>
        <SettingRow
          icon="phone-portrait-outline"
          label="Theme"
          sublabel="Follows your system appearance"
          iconBg={colors.muted}
          iconColor={colors.mutedForeground}
          colors={colors}
        />
      </View>

      {/* About */}
      <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ABOUT</Text>
      <View style={styles.settingsGroup}>
        <SettingRow
          icon="information-circle-outline"
          label="App Version"
          sublabel="HireMind Mobile 1.0.0"
          iconBg="#EDECFE"
          iconColor="#576DFA"
          colors={colors}
        />
        <SettingRow
          icon="shield-checkmark-outline"
          label="Privacy Policy"
          sublabel="How we handle your data"
          iconBg="#DBEAFE"
          iconColor="#2563EB"
          colors={colors}
          onPress={() => router.push("/privacy-policy")}
        />
      </View>

      {/* Sign out */}
      <Pressable
        style={({ pressed }) => [
          styles.signOutBtn,
          { borderColor: "#DC2626" + "44" },
          pressed && { opacity: 0.7 },
        ]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={20} color="#DC2626" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  profileCard: {
    flexDirection: "row", alignItems: "center", borderRadius: 16,
    padding: 16, borderWidth: 1, gap: 14, marginBottom: 28,
  },
  profileAvatar: {
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
  },
  profileAvatarText: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  profileName: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 2 },
  profileEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  sectionHeader: {
    fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8,
    marginBottom: 8, paddingHorizontal: 4,
  },
  infoCard: {
    borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 28,
  },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1,
  },
  infoLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "right", flex: 1, marginLeft: 12 },
  settingsGroup: { marginBottom: 28, gap: 6 },
  settingRow: {
    flexDirection: "row", alignItems: "center", padding: 14,
    borderWidth: 1, borderRadius: 14, gap: 14,
  },
  settingIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
  settingSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  signOutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 14, paddingVertical: 14, borderWidth: 1, gap: 8,
  },
  signOutText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#DC2626" },
});
