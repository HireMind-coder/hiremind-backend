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

type Department = { id: number; name: string };

const KEY = ["company-departments"];

function errText(e: any): string {
  return e?.data?.error ?? e?.message ?? "Something went wrong. Please try again.";
}

export default function DepartmentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [name, setName] = useState("");

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: KEY,
    queryFn: () => customFetch<Department[]>("/api/company/departments"),
    throwOnError: false,
  });

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setName("");
  };

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ name: name.trim() });
      return editing
        ? customFetch(`/api/company/departments/${editing.id}`, { method: "PATCH", body })
        : customFetch("/api/company/departments", { method: "POST", body });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: KEY });
      // names on the employee list may have changed after a rename
      queryClient.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes("employees") });
      closeModal();
    },
    onError: (e) => Alert.alert("Could not save", errText(e)),
    throwOnError: false,
  });

  const remove = useMutation({
    mutationFn: (id: number) => customFetch(`/api/company/departments/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    onError: (e) => Alert.alert("Could not delete", errText(e)),
    throwOnError: false,
  });

  const openAdd = () => {
    setEditing(null);
    setName("");
    setModalOpen(true);
  };

  const openEdit = (d: Department) => {
    setEditing(d);
    setName(d.name);
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Enter the department name.");
      return;
    }
    save.mutate();
  };

  const showMenu = (d: Department) =>
    Alert.alert(d.name, undefined, [
      { text: "Rename", onPress: () => openEdit(d) },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            "Delete department?",
            `“${d.name}” will be removed from the list. Employees already in it keep their department name.`,
            [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => remove.mutate(d.id) },
            ],
          ),
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
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 110 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No Departments Added</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openEdit(item)}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: colors.border, backgroundColor: colors.card },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
                <Ionicons name="people-outline" size={20} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
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
        <Text style={styles.fabText}>Add Department</Text>
      </Pressable>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.backdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editing ? "Rename Department" : "Add Department"}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={60}
              autoFocus
              placeholder="e.g. Sales"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            />
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
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 18, fontFamily: "Inter_500Medium" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  name: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  fab: {
    position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 28,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  fabText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  modalCard: { borderRadius: 16, borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 14 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 16 },
  modalActions: { flexDirection: "row", gap: 10 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  modalBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});