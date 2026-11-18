import { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Alert, Modal, TextInput, ActivityIndicator, RefreshControl,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { errMsg } from "@/hooks/useAttendanceSettings";

type LeaveType = { id: number; name: string; daysPerYear: number; color: string };

const PALETTE = ["#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#EF4444"];
const LEAVE_TYPES_KEY = ["attendance-leave-types"];

export default function CustomLeavesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [name, setName] = useState("");
  const [days, setDays] = useState("");
  const [color, setColor] = useState(PALETTE[0]);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: LEAVE_TYPES_KEY,
    queryFn: () => customFetch<LeaveType[]>("/api/attendance-settings/leave-types"),
    throwOnError: false,
  });

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ name: name.trim(), daysPerYear: days.trim() === "" ? 0 : Number(days), color });
      return editing
        ? customFetch(`/api/attendance-settings/leave-types/${editing.id}`, { method: "PATCH", body })
        : customFetch("/api/attendance-settings/leave-types", { method: "POST", body });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: LEAVE_TYPES_KEY });
      closeModal();
    },
    onError: (e) => Alert.alert("Could not save", errMsg(e)),
    throwOnError: false,
  });

  const remove = useMutation({
    mutationFn: (id: number) => customFetch(`/api/attendance-settings/leave-types/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LEAVE_TYPES_KEY }),
    onError: (e) => Alert.alert("Could not delete", errMsg(e)),
    throwOnError: false,
  });

  const openAdd = () => {
    setEditing(null);
    setName("");
    setDays("");
    setColor(PALETTE[0]);
    setModalOpen(true);
  };

  const openEdit = (l: LeaveType) => {
    setEditing(l);
    setName(l.name);
    setDays(l.daysPerYear ? String(l.daysPerYear) : "");
    setColor(l.color);
    setModalOpen(true);
  };

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Leave name required", "Enter a name like “Casual Leave”.");
      return;
    }
    if (days.trim() !== "" && (!/^\d+$/.test(days.trim()) || Number(days) > 365)) {
      Alert.alert("Invalid days", "Days per year must be a whole number from 0 to 365.");
      return;
    }
    save.mutate();
  };

  const showMenu = (l: LeaveType) =>
    Alert.alert(l.name, undefined, [
      { text: "Edit", onPress: () => openEdit(l) },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert("Delete leave?", `“${l.name}” will be removed from your leave list.`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => remove.mutate(l.id) },
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
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 110, gap: 8 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="ribbon-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No custom leaves yet. Tap “Add New Leave”.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openEdit(item)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: item.color }]}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                  {item.daysPerYear > 0 ? `${item.daysPerYear} days / year` : "No fixed yearly quota"}
                </Text>
              </View>
              <Pressable hitSlop={12} onPress={() => showMenu(item)}>
                <Ionicons name="ellipsis-vertical" size={20} color={colors.mutedForeground} />
              </Pressable>
            </Pressable>
          )}
        />
      )}

      <Pressable
        onPress={openAdd}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.primary, bottom: insets.bottom + 20 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Add New Leave</Text>
      </Pressable>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.backdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editing ? "Edit Leave" : "Add New Leave"}
            </Text>

            <Text style={[styles.label, { color: colors.mutedForeground }]}>Leave name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={40}
              placeholder="e.g. Casual Leave"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            />

            <Text style={[styles.label, { color: colors.mutedForeground }]}>Days per year (optional)</Text>
            <TextInput
              value={days}
              onChangeText={(t) => setDays(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="e.g. 12"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            />

            <Text style={[styles.label, { color: colors.mutedForeground }]}>Colour</Text>
            <View style={styles.palette}>
              {PALETTE.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
                >
                  {color === c && <Ionicons name="checkmark" size={16} color="#fff" />}
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]}
                onPress={closeModal}
                disabled={save.isPending}
              >
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={save.isPending}
              >
                {save.isPending ? <ActivityIndicator color="#fff" /> : <Text style={[styles.modalBtnText, { color: "#fff" }]}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderWidth: 1, borderRadius: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  fab: {
    position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 28,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  fabText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  modalCard: { borderRadius: 16, borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 14 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 10 },
  palette: { flexDirection: "row", gap: 10, marginBottom: 18, marginTop: 2 },
  swatch: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  swatchActive: { borderWidth: 3, borderColor: "rgba(0,0,0,0.25)" },
  modalActions: { flexDirection: "row", gap: 10 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  modalBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});