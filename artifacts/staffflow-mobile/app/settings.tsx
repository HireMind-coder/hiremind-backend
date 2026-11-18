import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert,
  Switch, Linking, Modal, TextInput, ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

import { NOTIF_KEY, registerForPush, unregisterPush } from "@/services/pushNotifications";
const ANDROID_PACKAGE = "com.allegient.hiremind";

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

  // ── App Notifications preference (saved on device) ──
  const [notificationsOn, setNotificationsOn] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(NOTIF_KEY).then((v) => {
      if (v !== null) setNotificationsOn(v === "true");
    });
  }, []);
    const toggleNotifications = async (value: boolean) => {
      setNotificationsOn(value);
      Haptics.selectionAsync();
      await AsyncStorage.setItem(NOTIF_KEY, String(value));

      if (value) {
        const result = await registerForPush();
        if (!result.ok) {
          setNotificationsOn(false);
          await AsyncStorage.setItem(NOTIF_KEY, "false");
          if (result.reason === "unsupported") {
            Alert.alert(
              "Push needs the development app",
              "Push notifications don't work in Expo Go. Install the HireMind development build to use them.",
            );
          } else if (result.reason === "denied") {
            Alert.alert(
              "Notifications blocked",
              "Please allow notifications for HireMind in your phone settings.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() },
              ],
            );
          } else {
            Alert.alert("Could not enable notifications", result.message ?? "Please try again.");
          }
        }
      } else {
        await unregisterPush();
      }
    };

  // ── Rate Us ──
  const handleRateUs = async () => {
    try {
      await Linking.openURL(`market://details?id=${ANDROID_PACKAGE}`);
    } catch {
      Linking.openURL(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`);
    }
  };

  // ── Delete All Staff (admin only, type DELETE to confirm) ──
  const queryClient = useQueryClient();
  const isAdmin = user?.role !== "employee";
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const closeDelete = () => {
    if (deleting) return;
    setDeleteVisible(false);
    setConfirmText("");
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const res = await customFetch<{ deletedCount: number }>("/api/employees", { method: "DELETE" });
      await queryClient.invalidateQueries();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDeleteVisible(false);
      setConfirmText("");
      Alert.alert("Done", `${res?.deletedCount ?? 0} staff member(s) deleted.`);
    } catch (e: any) {
      Alert.alert("Could not delete staff", e?.message ?? "Please try again.");
    } finally {
      setDeleting(false);
    }
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
      {/* Workspace (admins only) */}
 {(user?.role === "admin" || user?.role === "ca") && (
        <>
          <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>WORKSPACE</Text>
          <View style={styles.settingsGroup}>
            {user?.role === "admin" && (
              <SettingRow
                icon="people-outline"
                label="Users & Permissions"
                sublabel="Admins, roles and accountants"
                iconBg="#CCFBF1"
                iconColor="#0D9488"
                colors={colors}
                onPress={() => router.push("/users-permissions")}
              />
            )}
                        {user?.role === "admin" && (
                          <SettingRow
                            icon="business-outline"
                            label="Company Settings"
                            sublabel="Details, branches and departments"
                            iconBg="#EDECFE"
                            iconColor="#576DFA"
                            colors={colors}
                            onPress={() => router.push("/company-settings")}
                          />
                        )}
                        {user?.role === "admin" && (
                          <SettingRow
                            icon="card-outline"
                            label="Subscriptions & Billing"
                            sublabel="Plan, wallet and invoices"
                            iconBg="#D1FAE5"
                            iconColor="#059669"
                            colors={colors}
                            onPress={() => router.push("/billing")}
                          />
                        )}
                        {user?.role === "admin" && (
                          <SettingRow
                            icon="gift-outline"
                            label="Refer a Friend"
                            sublabel="Share your code, earn wallet rewards"
                            iconBg="#FEF3C7"
                            iconColor="#D97706"
                            colors={colors}
                            onPress={() => router.push("/refer-a-friend")}
                          />
                        )}
          {user?.role === "admin" && (
              <SettingRow
                 icon="calendar-outline"
                 label="Attendance Settings"
                 sublabel="Geofence, fake GPS, devices, leaves & holidays"
                 iconBg="#D1FAE5"
                 iconColor="#059669"
                 colors={colors}
                 onPress={() => router.push("/attendance-settings")}
                    />
                  )}
            <SettingRow
              icon="bar-chart-outline"
              label="Reports"
              sublabel="Attendance, payroll and employee reports"
              iconBg="#DBEAFE"
              iconColor="#2563EB"
              colors={colors}
              onPress={() => router.push("/reports")}
            />
          </View>
        </>
      )}

      {/* Preferences */}
      <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>PREFERENCES</Text>
      <View style={styles.settingsGroup}>
        <SettingRow
          icon="notifications-outline"
          label="App Notifications"
          sublabel="Alerts for check-ins, leaves and tasks"
          iconBg="#D1FAE5"
          iconColor="#059669"
          colors={colors}
          right={
            <Switch
              value={notificationsOn}
              onValueChange={toggleNotifications}
              trackColor={{ false: colors.border, true: colors.primary + "88" }}
              thumbColor={notificationsOn ? colors.primary : "#f4f3f4"}
            />
          }
        />
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
          sublabel="HireMind Mobile 1.0.1"
          iconBg="#EDECFE"
          iconColor="#576DFA"
          colors={colors}
        />
        <SettingRow
          icon="thumbs-up-outline"
          label="Rate Us"
          sublabel="Enjoying HireMind? Leave a review"
          iconBg="#FEF3C7"
          iconColor="#D97706"
          colors={colors}
          onPress={handleRateUs}
        />
        <SettingRow
          icon="bulb-outline"
          label="Request a Feature"
          sublabel="Tell us what to build next"
          iconBg="#FCE7F3"
          iconColor="#DB2777"
          colors={colors}
          onPress={() => router.push("/request-feature")}
        />
        <SettingRow
          icon="document-text-outline"
          label="Terms & Conditions"
          sublabel="Rules for using HireMind"
          iconBg="#E0E7FF"
          iconColor="#4F46E5"
          colors={colors}
          onPress={() => router.push("/terms")}
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

      {/* Danger zone (admins only) */}
      {isAdmin && (
        <>
          <Text style={[styles.sectionHeader, { color: "#DC2626" }]}>DANGER ZONE</Text>
          <View style={styles.settingsGroup}>
            <SettingRow
              icon="trash-outline"
              label="Delete All Staff"
              sublabel="Permanently remove every staff member"
              iconBg="#FEE2E2"
              iconColor="#DC2626"
              colors={colors}
              onPress={() => setDeleteVisible(true)}
            />
          </View>
        </>
      )}

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

      {/* Delete All Staff confirmation */}
      <Modal visible={deleteVisible} transparent animationType="fade" onRequestClose={closeDelete}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: "#DC2626" }]}>Delete all staff?</Text>
            <Text style={[styles.modalText, { color: colors.mutedForeground }]}>
              This permanently deletes every staff member and all of their attendance, leave,
              payment and task records. This cannot be undone.
            </Text>
            <Text style={[styles.modalText, { color: colors.foreground, marginBottom: 8 }]}>
              Type DELETE to confirm:
            </Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="DELETE"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border }]}
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { borderColor: colors.border, borderWidth: 1 }]} onPress={closeDelete}>
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={confirmText !== "DELETE" || deleting}
                style={[styles.modalBtn, { backgroundColor: "#DC2626", opacity: confirmText === "DELETE" && !deleting ? 1 : 0.4 }]}
                onPress={handleDeleteAll}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: "#fff" }]}>Delete All</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  modalCard: { borderRadius: 16, borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 10 },
  modalText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, marginBottom: 14 },
  modalInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 18,
  },
  modalActions: { flexDirection: "row", gap: 10 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  modalBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});