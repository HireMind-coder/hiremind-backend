import { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  Platform, Modal, ScrollView, KeyboardAvoidingView, TextInput, Alert,
} from "react-native";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useListTasks, useUpdateTask, useCreateTask, useDeleteTask, useListEmployees } from "@workspace/api-client-react";

type Status = "all" | "pending" | "in_progress" | "completed";

const FILTERS: { label: string; value: Status }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "In Progress", value: "in_progress" },
  { label: "Done", value: "completed" },
];

const PRIORITY_COLORS: Record<string, { color: string; bg: string }> = {
  high: { color: "#DC2626", bg: "#FEE2E2" },
  medium: { color: "#D97706", bg: "#FEF3C7" },
  low: { color: "#16A34A", bg: "#DCFCE7" },
};

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  pending: { icon: "ellipse-outline", color: "#6B7280" },
  in_progress: { icon: "time-outline", color: "#576DFA" },
  completed: { icon: "checkmark-circle", color: "#16A34A" },
};

const PRIORITIES = ["low", "medium", "high"];

interface TaskForm {
  title: string;
  description: string;
  priority: string;
  dueDate: string;
  employeeId: number | null;
}

const EMPTY_FORM: TaskForm = { title: "", description: "", priority: "medium", dueDate: "", employeeId: null };

function TaskCard({ task, colors, onToggle, onDelete }: { task: any; colors: any; onToggle: (id: number, status: string) => void; onDelete: (id: number) => void }) {
  const s = STATUS_ICONS[task.status] ?? STATUS_ICONS.pending;
  const p = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.low;
  const isCompleted = task.status === "completed";

  return (
    <View style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border }, isCompleted && { opacity: 0.6 }]}>
      <Pressable onPress={() => onToggle(task.id, task.status)} style={styles.taskToggle}>
        <Ionicons name={s.icon as any} size={22} color={s.color} />
      </Pressable>
      <View style={styles.taskBody}>
        <View style={styles.taskHeader}>
          <Text
            style={[styles.taskTitle, { color: colors.foreground }, isCompleted && styles.strikethrough]}
            numberOfLines={1}
          >
            {task.title}
          </Text>
          <View style={[styles.priorityBadge, { backgroundColor: p.bg }]}>
            <Text style={[styles.priorityText, { color: p.color }]}>{task.priority}</Text>
          </View>
        </View>
        {task.description ? (
          <Text style={[styles.taskDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
            {task.description}
          </Text>
        ) : null}
        <View style={styles.taskMeta}>
          {task.assignedToName ? (
            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{task.assignedToName}</Text>
            </View>
          ) : null}
          {task.dueDate ? (
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {new Date(task.dueDate).toLocaleDateString("en", { day: "numeric", month: "short" })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Pressable onPress={() => onDelete(task.id)} hitSlop={8} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={15} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Status>("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [showEmpPicker, setShowEmpPicker] = useState(false);

  const { data: tasks, isLoading, refetch } = useListTasks({ status: filter !== "all" ? filter : undefined });
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const { data: employees } = useListEmployees({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const topPadding = Platform.OS === "web" ? 67 : 0;

  const handleToggle = (id: number, currentStatus: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextStatus = currentStatus === "completed" ? "pending" : currentStatus === "pending" ? "in_progress" : "completed";
    updateTask.mutate({ id, data: { status: nextStatus } }, { onSuccess: () => refetch() });
  };

  const handleDelete = (id: number) => {
    setConfirmDeleteId(id);
  };

  const handleCreate = () => {
    if (!form.title || !form.employeeId) {
      Alert.alert("Error", "Title and assignee are required.");
      return;
    }
    createTask.mutate(
      {
        data: {
          title: form.title,
          description: form.description || null,
          employeeId: form.employeeId,
          priority: form.priority,
          dueDate: form.dueDate || null,
        },
      },
      {
        onSuccess: () => {
          setShowModal(false);
          setForm(EMPTY_FORM);
          refetch();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        onError: () => Alert.alert("Error", "Could not create task."),
      }
    );
  };

  const selectedEmployee = employees?.find((e: any) => e.id === form.employeeId);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Filter tabs */}
      <View style={[styles.filterRow, { paddingTop: topPadding + 12, backgroundColor: colors.background }]}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            style={[
              styles.filterBtn,
              { borderColor: colors.border },
              filter === f.value && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterText, { color: filter === f.value ? "#fff" : colors.mutedForeground }]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={tasks ?? []}
          keyExtractor={(t) => String(t.id)}
          renderItem={({ item }) => (
            <TaskCard task={item} colors={colors} onToggle={handleToggle} onDelete={handleDelete} />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100) },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="checkbox-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {filter !== "all" ? "No tasks in this status" : "No tasks yet"}
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + (Platform.OS === "web" ? 34 + 24 : 100 + 12) }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowModal(true); }}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>

      {/* Create Task Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView style={[styles.modalRoot, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Task</Text>
              <Pressable onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Title *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.title}
              onChangeText={(v) => setForm(f => ({ ...f, title: v }))}
              placeholder="Task title"
              placeholderTextColor={colors.mutedForeground}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.description}
              onChangeText={(v) => setForm(f => ({ ...f, description: v }))}
              placeholder="Optional description..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Assign To *</Text>
            <Pressable
              style={[styles.pickerTrigger, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowEmpPicker(true)}
            >
              <Text style={[styles.pickerText, { color: selectedEmployee ? colors.foreground : colors.mutedForeground }]}>
                {selectedEmployee ? selectedEmployee.name : "Select employee..."}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Priority</Text>
            <View style={styles.optionRow}>
              {PRIORITIES.map((p) => {
                const pc = PRIORITY_COLORS[p];
                return (
                  <Pressable
                    key={p}
                    style={[styles.optionBtn, { borderColor: colors.border }, form.priority === p && { backgroundColor: pc.bg, borderColor: pc.color }]}
                    onPress={() => setForm(f => ({ ...f, priority: p }))}
                  >
                    <Text style={[styles.optionBtnText, { color: form.priority === p ? pc.color : colors.foreground }]}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Due Date (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.dueDate}
              onChangeText={(v) => setForm(f => ({ ...f, dueDate: v }))}
              placeholder="2026-02-28"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
            />

            <Pressable
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              onPress={handleCreate}
              disabled={createTask.isPending}
            >
              {createTask.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Create Task</Text>
              )}
            </Pressable>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Employee picker */}
      <Modal visible={showEmpPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEmpPicker(false)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Assign To</Text>
            <Pressable onPress={() => setShowEmpPicker(false)}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <FlatList
            data={employees ?? []}
            keyExtractor={(e) => String(e.id)}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.empRow, { borderBottomColor: colors.border }]}
                onPress={() => { setForm(f => ({ ...f, employeeId: item.id })); setShowEmpPicker(false); }}
              >
                <View style={[styles.empAvatar, { backgroundColor: colors.primary + "22" }]}>
                  <Text style={[styles.empAvatarText, { color: colors.primary }]}>{item.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.empName, { color: colors.foreground }]}>{item.name}</Text>
                  <Text style={[styles.empRole, { color: colors.mutedForeground }]}>{item.role}</Text>
                </View>
                {form.employeeId === item.id && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </Pressable>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </View>
      </Modal>
      <ConfirmModal
        visible={confirmDeleteId !== null}
        title="Delete Task"
        message="Remove this task permanently? This cannot be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId !== null) {
            deleteTask.mutate({ id: confirmDeleteId }, { onSuccess: () => { setConfirmDeleteId(null); refetch(); } });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  filterRow: {
    flexDirection: "row", paddingHorizontal: 16, gap: 8, paddingBottom: 12,
  },
  filterBtn: {
    flex: 1, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  filterText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  taskCard: {
    flexDirection: "row", alignItems: "flex-start", borderRadius: 14,
    padding: 14, borderWidth: 1, gap: 12,
  },
  taskToggle: { paddingTop: 1 },
  taskBody: { flex: 1 },
  taskHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  taskTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  strikethrough: { textDecorationLine: "line-through" },
  priorityBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  priorityText: { fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "capitalize" },
  taskDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 6 },
  taskMeta: { flexDirection: "row", gap: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  deleteBtn: { paddingTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  fab: {
    position: "absolute", right: 20, width: 56, height: 56,
    borderRadius: 28, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  modalRoot: { flex: 1, padding: 20 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
    fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 16,
  },
  textarea: { height: 80, paddingTop: 12, textAlignVertical: "top" },
  pickerTrigger: {
    height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
  },
  pickerText: { fontSize: 15, fontFamily: "Inter_400Regular", flex: 1 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  optionBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  optionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  submitBtn: { borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginTop: 8 },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  empRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12, borderBottomWidth: 1 },
  empAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  empAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  empName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  empRole: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
