import { useMemo, useState } from "react";
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

type Holiday = { id: number; date: string; name: string };
type Suggestion = { date: string; name: string; added: boolean };
type Item =
  | { kind: "added"; id: number; date: string; name: string }
  | { kind: "suggestion"; date: string; name: string };

function prettyDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function HolidaysScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [modalOpen, setModalOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  const holidaysKey = ["attendance-holidays", year];
  const suggestionsKey = ["attendance-holiday-suggestions", year];

  const holidaysQ = useQuery({
    queryKey: holidaysKey,
    queryFn: () => customFetch<Holiday[]>(`/api/attendance-settings/holidays?year=${year}`),
    throwOnError: false,
  });
  const suggestionsQ = useQuery({
    queryKey: suggestionsKey,
    queryFn: () => customFetch<Suggestion[]>(`/api/attendance-settings/holidays/suggestions?year=${year}`),
    throwOnError: false,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: holidaysKey });
    queryClient.invalidateQueries({ queryKey: suggestionsKey });
  };

  const addOne = useMutation({
    mutationFn: (h: { date: string; name: string }) =>
      customFetch("/api/attendance-settings/holidays", { method: "POST", body: JSON.stringify(h) }),
    onSuccess: () => { Haptics.selectionAsync(); refreshAll(); },
    onError: (e) => Alert.alert("Could not add holiday", errMsg(e)),
    throwOnError: false,
  });

  const addBulk = useMutation({
    mutationFn: (holidays: Array<{ date: string; name: string }>) =>
      customFetch<{ added: number }>("/api/attendance-settings/holidays/bulk", {
        method: "POST",
        body: JSON.stringify({ holidays }),
      }),
    onSuccess: (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshAll();
      Alert.alert("Done", `${res?.added ?? 0} holiday(s) added.`);
    },
    onError: (e) => Alert.alert("Could not add holidays", errMsg(e)),
    throwOnError: false,
  });

  const removeOne = useMutation({
    mutationFn: (id: number) => customFetch(`/api/attendance-settings/holidays/${id}`, { method: "DELETE" }),
    onSuccess: refreshAll,
    onError: (e) => Alert.alert("Could not delete", errMsg(e)),
    throwOnError: false,
  });

  const pendingSuggestions = useMemo(
    () => (suggestionsQ.data ?? []).filter((s) => !s.added),
    [suggestionsQ.data],
  );

  const items: Item[] = useMemo(() => {
    const added: Item[] = (holidaysQ.data ?? []).map((h) => ({ kind: "added", id: h.id, date: h.date, name: h.name }));
    const sugg: Item[] = pendingSuggestions.map((s) => ({ kind: "suggestion", date: s.date, name: s.name }));
    return [...added, ...sugg].sort((a, b) => a.date.localeCompare(b.date));
  }, [holidaysQ.data, pendingSuggestions]);

  const confirmDelete = (h: { id: number; name: string }) =>
    Alert.alert("Remove holiday?", `“${h.name}” will be removed from the list.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeOne.mutate(h.id) },
    ]);

  const openModal = () => {
    setNewDate(`${year}-`);
    setNewName("");
    setModalOpen(true);
  };

  const handleAddNew = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate.trim())) {
      Alert.alert("Invalid date", "Enter the date as YYYY-MM-DD, e.g. 2026-11-08.");
      return;
    }
    if (!newName.trim()) {
      Alert.alert("Name required", "Enter the holiday name.");
      return;
    }
    addOne.mutate(
      { date: newDate.trim(), name: newName.trim() },
      {
        onSuccess: () => {
          const y = Number(newDate.slice(0, 4));
          if (y !== year) setYear(y);
          setModalOpen(false);
        },
      },
    );
  };

  const loading = holidaysQ.isLoading || suggestionsQ.isLoading;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.yearBar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable hitSlop={12} onPress={() => setYear((y) => y - 1)}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.yearText, { color: colors.foreground }]}>{year}</Text>
        <Pressable hitSlop={12} onPress={() => setYear((y) => y + 1)}>
          <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => `${i.kind}-${i.date}`}
          contentContainerStyle={{ paddingBottom: 150 }}
          refreshControl={
            <RefreshControl
              refreshing={holidaysQ.isRefetching || suggestionsQ.isRefetching}
              onRefresh={refreshAll}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="sunny-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No holidays for {year}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.date, { color: colors.mutedForeground }]}>{prettyDate(item.date)}</Text>
                <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
              </View>
              {item.kind === "suggestion" ? (
                <Pressable
                  onPress={() => addOne.mutate({ date: item.date, name: item.name })}
                  style={[styles.addBtn, { borderColor: colors.primary }]}
                >
                  <Text style={[styles.addBtnText, { color: colors.primary }]}>ADD</Text>
                </Pressable>
              ) : (
                <Pressable hitSlop={10} onPress={() => confirmDelete({ id: item.id, name: item.name })}>
                  <Ionicons name="trash-outline" size={20} color="#DC2626" />
                </Pressable>
              )}
            </View>
          )}
        />
      )}

      <View
        style={[
          styles.footer,
          { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 },
        ]}
      >
        {pendingSuggestions.length > 0 && (
          <Pressable
            disabled={addBulk.isPending}
            onPress={() => addBulk.mutate(pendingSuggestions.map(({ date, name }) => ({ date, name })))}
            style={({ pressed }) => [styles.bigBtn, { borderColor: colors.primary }, pressed && { opacity: 0.7 }]}
          >
            {addBulk.isPending ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[styles.bigBtnText, { color: colors.primary }]}>Add all Public Holidays</Text>
            )}
          </Pressable>
        )}
        <Pressable onPress={openModal} style={styles.linkBtn}>
          <Text style={[styles.linkText, { color: colors.primary }]}>Add New Holidays</Text>
        </Pressable>
      </View>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Holiday</Text>

            <Text style={[styles.label, { color: colors.mutedForeground }]}>Date (YYYY-MM-DD)</Text>
            <TextInput
              value={newDate}
              onChangeText={setNewDate}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              placeholder="2026-11-08"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            />

            <Text style={[styles.label, { color: colors.mutedForeground }]}>Holiday name</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              maxLength={80}
              placeholder="e.g. Diwali"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setModalOpen(false)}
                disabled={addOne.isPending}
              >
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={handleAddNew}
                disabled={addOne.isPending}
              >
                {addOne.isPending ? <ActivityIndicator color="#fff" /> : <Text style={[styles.modalBtnText, { color: "#fff" }]}>Add</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  yearBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28, paddingVertical: 12, borderBottomWidth: 1 },
  yearText: { fontSize: 18, fontFamily: "Inter_700Bold", minWidth: 60, textAlign: "center" },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  date: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 2 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  addBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 22, paddingVertical: 8 },
  addBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12 },
  bigBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  bigBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  linkBtn: { alignItems: "center", paddingVertical: 12 },
  linkText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  modalCard: { borderRadius: 16, borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 14 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 10 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  modalBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});