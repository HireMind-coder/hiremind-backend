import { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput, Alert,
  ActivityIndicator, ScrollView, RefreshControl,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

type Member = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isOwner: boolean;
};
type TeamResponse = { canManage: boolean; members: Member[] };

const AVATAR_COLORS = ["#EF5A5A", "#F5A623", "#5B9EE9", "#8B5CF6", "#10B981", "#EC4899"];

function errMsg(e: any, fallback = "Something went wrong") {
  return e?.data?.error ?? e?.message ?? fallback;
}

export default function TeamMembersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === "ca" ? "ca" : "admin";
  const noun = kind === "ca" ? "Accountant" : "Admin";

  const { data, isLoading, refetch, isRefetching, error } = useQuery({
   queryKey: ["team-members", kind],
   queryFn: () => customFetch<TeamResponse>(`/api/team/members?kind=${kind}`),
   throwOnError: false,
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName(""); setPhone(""); setEmail(""); setPassword("");
  };
  const closeSheet = () => {
    if (saving) return;
    setSheetOpen(false);
    resetForm();
  };

  const handleAdd = async () => {
    setSaving(true);
    try {
      await customFetch("/api/team/members", {
        method: "POST",
        body: JSON.stringify({
          kind,
          name: name.trim(),
          phone: `+91${phone.replace(/\D/g, "")}`,
          email: email.trim(),
          password,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.invalidateQueries({ queryKey: ["team-members", kind] });
      setSheetOpen(false);
      resetForm();
    } catch (e) {
      Alert.alert(`Could not add ${noun.toLowerCase()}`, errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = (m: Member) => {
    Alert.alert(
      `Remove ${m.name}?`,
      `They will lose access to the company immediately.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await customFetch(`/api/team/members/${m.id}`, { method: "DELETE" });
              await queryClient.invalidateQueries({ queryKey: ["team-members", kind] });
            } catch (e) {
              Alert.alert("Could not remove", errMsg(e));
            }
          },
        },
      ],
    );
  };

  const canSubmit =
    name.trim().length >= 2 &&
    phone.replace(/\D/g, "").length >= 7 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    password.length >= 6;

  const canManage = !!data?.canManage;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: kind === "ca" ? "Chartered Accountants" : "Admins" }} />

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : error ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>{errMsg(error)}</Text>
      ) : (
        <FlatList
          data={data?.members ?? []}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              No {kind === "ca" ? "accountants" : "admins"} added yet.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[item.id % AVATAR_COLORS.length] }]}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                {kind === "admin" && (
                  <View style={styles.star}>
                    <Ionicons name="star" size={12} color="#F5B800" />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.foreground }]}>
                  {item.name}
                  {item.isOwner ? "  (Owner)" : ""}
                </Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                  {item.phone ? item.phone : item.email}
                </Text>
              </View>
              {canManage && !item.isOwner && (
                <Pressable hitSlop={12} onPress={() => confirmRemove(item)}>
                  <Ionicons name="ellipsis-vertical" size={20} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
          )}
        />
      )}

      {canManage && (
        <Pressable
          onPress={() => setSheetOpen(true)}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: colors.primary, bottom: insets.bottom + 20, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="person-add-outline" size={20} color="#fff" />
          <Text style={styles.fabText}>Add {noun}</Text>
        </Pressable>
      )}

      {/* Add sheet */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={closeSheet}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Add {noun}</Text>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={[styles.input, styles.code, { borderColor: colors.border }]}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 15 }}>+91</Text>
              </View>
              <TextInput
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
                placeholder="Phone Number"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border }]}
              />
            </View>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email Id"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password (min 6 characters)"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              autoCapitalize="none"
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {noun === "Admin"
                ? "They sign in with this email and password and get full access to the company."
                : "They sign in with this email and password and can view data but not change it."}
            </Text>

            <Pressable
              disabled={!canSubmit || saving}
              onPress={handleAdd}
              style={[styles.submit, { backgroundColor: colors.primary, opacity: canSubmit && !saving ? 1 : 0.45 }]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Add {noun}</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: "center", marginTop: 40, fontSize: 14, fontFamily: "Inter_400Regular", paddingHorizontal: 24 },
  item: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  star: {
    position: "absolute", right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
  },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  meta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  fab: {
    position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 28, elevation: 4,
  },
  fabText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, maxHeight: "85%" },
  handle: { alignSelf: "center", width: 48, height: 5, borderRadius: 3, marginBottom: 16 },
  sheetTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 16 },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 12,
  },
  code: { justifyContent: "center", alignItems: "center", minWidth: 64 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 16 },
  submit: { borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  submitText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});