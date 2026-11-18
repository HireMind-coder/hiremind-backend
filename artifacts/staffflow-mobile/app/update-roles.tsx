import { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput, Alert,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

type Staff = { id: number; name: string; accessRole?: string | null };

const ROLE_LABEL: Record<string, string> = {
  employee: "Employee",
  attendance_manager: "Attendance Manager",
  branch_admin: "Branch Admin",
};

const ROLE_OPTIONS = [
  { value: "branch_admin", title: "Branch Admin", desc: "Mark attendance & salary of all employees" },
  { value: "attendance_manager", title: "Attendance Manager", desc: "Mark attendance of all employees" },
  { value: "employee", title: "Employee", desc: "Mark their own attendance" },
];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "employee", label: "Employee" },
  { key: "branch_admin", label: "Branch Admin" },
  { key: "attendance_manager", label: "Attendance Manager" },
];

const AVATAR_COLORS = ["#EC4899", "#8B5CF6", "#F5A623", "#5B9EE9", "#10B981", "#EF5A5A"];

function errMsg(e: any, fallback = "Something went wrong") {
  return e?.data?.error ?? e?.message ?? fallback;
}

export default function UpdateRolesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

    const { data, isLoading, refetch, isRefetching, error } = useQuery({
      queryKey: ["team-staff"],
      queryFn: () => customFetch<Staff[]>("/api/employees"),
      throwOnError: false,
    });

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Staff | null>(null);
  const [selected, setSelected] = useState("employee");
  const [saving, setSaving] = useState(false);

  const roleOf = (s: Staff) => s.accessRole || "employee";

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((s) => (filter === "all" ? true : roleOf(s) === filter))
      .filter((s) => (q ? s.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, filter, search]);

  const openEdit = (s: Staff) => {
    setEditing(s);
    setSelected(roleOf(s));
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await customFetch(`/api/team/employees/${editing.id}/access-role`, {
        method: "PATCH",
        body: JSON.stringify({ accessRole: selected }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.invalidateQueries({ queryKey: ["team-staff"] });
      setEditing(null);
    } catch (e) {
      Alert.alert("Could not update role", errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.chip,
                { backgroundColor: active ? colors.primary : colors.muted },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? "#fff" : colors.foreground }]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search employee"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : error ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>{errMsg(error)}</Text>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 30 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.mutedForeground }]}>No employees found.</Text>}
          renderItem={({ item }) => {
            const role = roleOf(item);
            return (
              <View style={styles.item}>
                <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[item.id % AVATAR_COLORS.length] }]}>
                  <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
                  <Text
                    style={[
                      styles.role,
                      role === "employee"
                        ? { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }
                        : { color: colors.primary, fontFamily: "Inter_700Bold", textTransform: "uppercase" },
                    ]}
                  >
                    {ROLE_LABEL[role] ?? role}
                  </Text>
                </View>
                <Pressable
                  onPress={() => openEdit(item)}
                  style={({ pressed }) => [styles.editBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                >
                  <Text style={styles.editText}>EDIT ROLE</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      {/* Select Role dialog */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => !saving && setEditing(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.dialog, { backgroundColor: colors.card }]}>
            <Text style={[styles.dialogTitle, { color: colors.foreground }]}>Select Role</Text>
            {editing && (
              <Text style={[styles.dialogFor, { color: colors.mutedForeground }]}>{editing.name}</Text>
            )}

            {ROLE_OPTIONS.map((opt) => {
              const on = selected === opt.value;
              return (
                <Pressable key={opt.value} style={styles.option} onPress={() => setSelected(opt.value)}>
                  <View style={[styles.radio, { borderColor: on ? colors.primary : colors.mutedForeground }]}>
                    {on && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optTitle, { color: colors.foreground }]}>{opt.title}</Text>
                    <Text style={[styles.optDesc, { color: colors.mutedForeground }]}>{opt.desc}</Text>
                  </View>
                </Pressable>
              );
            })}

            <View style={styles.dialogActions}>
              <Pressable disabled={saving} onPress={() => setEditing(null)} style={styles.dialogBtn}>
                <Text style={[styles.dialogBtnText, { color: colors.mutedForeground }]}>CLOSE</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={handleUpdate} style={styles.dialogBtn}>
                {saving ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={[styles.dialogBtnText, { color: colors.primary }]}>UPDATE</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  chipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  search: {
    flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, borderWidth: 1, borderRadius: 12,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14, fontFamily: "Inter_400Regular", paddingHorizontal: 24 },
  item: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  name: { fontSize: 16, fontFamily: "Inter_500Medium", marginBottom: 2 },
  role: { fontSize: 13 },
  editBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 4 },
  editText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  dialog: { borderRadius: 8, padding: 22 },
  dialogTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  dialogFor: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 14 },
  option: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 2 },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  optTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  optDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 },
  dialogBtn: { paddingHorizontal: 14, paddingVertical: 10, minWidth: 80, alignItems: "center" },
  dialogBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
});