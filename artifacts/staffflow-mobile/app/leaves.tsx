import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert, Linking,
} from "react-native";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { getBaseUrl } from "@/constants/api";
import {
  useListLeaves, useCreateLeave, useApproveLeave, useRejectLeave, useDeleteLeave,
  useGetLeaveBalances, useListEmployees, customFetch,
} from "@workspace/api-client-react";

type Filter = "all" | "pending" | "approved" | "rejected";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

const STATUS_MAP: Record<string, { color: string; bg: string; icon: string }> = {
  pending: { color: "#D97706", bg: "#FEF3C7", icon: "time-outline" },
  approved: { color: "#16A34A", bg: "#DCFCE7", icon: "checkmark-circle-outline" },
  rejected: { color: "#DC2626", bg: "#FEE2E2", icon: "close-circle-outline" },
};

const LEAVE_TYPES = ["sick", "casual", "earned", "other"];
const LEAVE_TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  sick: { color: "#DC2626", bg: "#FEE2E2" },
  casual: { color: "#2563EB", bg: "#DBEAFE" },
  earned: { color: "#16A34A", bg: "#DCFCE7" },
  other: { color: "#7C3AED", bg: "#EDE9FE" },
};

function LeaveRow({
  leave, colors, onApprove, onReject, onDelete,
}: {
  leave: any;
  colors: any;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const s = STATUS_MAP[leave.status] ?? STATUS_MAP.pending;
  const t = LEAVE_TYPE_COLORS[leave.type] ?? LEAVE_TYPE_COLORS.other;
  return (
    <View style={[styles.leaveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.leaveHeader}>
        <View style={styles.leaveTitleRow}>
          <View style={[styles.typeBadge, { backgroundColor: t.bg }]}>
            <Text style={[styles.typeBadgeText, { color: t.color }]}>{leave.type}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
            <Ionicons name={s.icon as any} size={12} color={s.color} />
            <Text style={[styles.statusText, { color: s.color }]}>{leave.status}</Text>
          </View>
        </View>
        <Pressable onPress={() => onDelete(leave.id)} hitSlop={8}>
          <Ionicons name="trash-outline" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <Text style={[styles.leaveEmployee, { color: colors.foreground }]}>{leave.employeeName}</Text>
      <View style={styles.leaveDates}>
        <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} />
        <Text style={[styles.leaveDateText, { color: colors.mutedForeground }]}>
          {new Date(leave.startDate).toLocaleDateString("en", { day: "numeric", month: "short" })}
          {" → "}
          {new Date(leave.endDate).toLocaleDateString("en", { day: "numeric", month: "short" })}
          {"  "}({leave.halfDay ? "Half day" : `${leave.days} ${leave.days === 1 ? "day" : "days"}`})
        </Text>
      </View>
      {leave.reason ? (
        <Text style={[styles.leaveReason, { color: colors.mutedForeground }]} numberOfLines={2}>
          {leave.reason}
        </Text>
      ) : null}
      {leave.attachmentUrl ? (
        <Pressable
          onPress={() => Linking.openURL(`${getBaseUrl()}${leave.attachmentUrl}`)}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          hitSlop={6}
        >
          <Ionicons name="attach" size={14} color="#1D9BF0" />
          <Text style={{ color: "#1D9BF0", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>View attachment</Text>
        </Pressable>
      ) : null}
      {leave.status === "pending" && (
        <View style={styles.leaveActions}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#DCFCE7", borderColor: "#16A34A22" }]}
            onPress={() => onApprove(leave.id)}
          >
            <Ionicons name="checkmark" size={14} color="#16A34A" />
            <Text style={[styles.actionBtnText, { color: "#16A34A" }]}>Approve</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#FEE2E2", borderColor: "#DC262622" }]}
            onPress={() => onReject(leave.id)}
          >
            <Ionicons name="close" size={14} color="#DC2626" />
            <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Reject</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

interface CreateLeaveForm {
  employeeId: number | null;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export default function LeavesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showBalances, setShowBalances] = useState(false);
  const [form, setForm] = useState<CreateLeaveForm>({
    employeeId: null, type: "sick", startDate: "", endDate: "", reason: "",
  });
  const [showEmpPicker, setShowEmpPicker] = useState(false);

  const { data: leaves, isLoading, refetch } = useListLeaves({
    status: filter !== "all" ? filter : undefined,
  });
  const { data: balances } = useGetLeaveBalances({});
  const { data: employees } = useListEmployees({});
  const { data: customLeaveTypes } = useQuery({
      queryKey: ["attendance-leave-types"],
      queryFn: () => customFetch<{ id: number; name: string }[]>("/api/attendance-settings/leave-types"),
      throwOnError: false,
    });
    const leaveTypes = [
      ...LEAVE_TYPES,
      ...(customLeaveTypes ?? []).map((l) => l.name).filter((n) => !LEAVE_TYPES.includes(n.toLowerCase())),
    ];
  const createLeave = useCreateLeave();
  const approveLeave = useApproveLeave();
  const rejectLeave = useRejectLeave();
  const deleteLeave = useDeleteLeave();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const handleApprove = (id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    approveLeave.mutate({ id, data: {} }, { onSuccess: () => refetch() });
  };

  const handleReject = (id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    rejectLeave.mutate({ id, data: {} }, { onSuccess: () => refetch() });
  };

  const handleDelete = (id: number) => {
    setConfirmDeleteId(id);
  };

  const handleCreate = () => {
    if (!form.employeeId || !form.startDate || !form.endDate) {
      Alert.alert("Error", "Employee, start date and end date are required.");
      return;
    }
    createLeave.mutate(
      { data: { employeeId: form.employeeId, type: form.type, startDate: form.startDate, endDate: form.endDate, reason: form.reason || undefined } },
      {
        onSuccess: () => {
          setShowCreate(false);
          setForm({ employeeId: null, type: "sick", startDate: "", endDate: "", reason: "" });
          refetch();
        },
        onError: () => Alert.alert("Error", "Failed to create leave request."),
      }
    );
  };

  const selectedEmployee = employees?.find((e: any) => e.id === form.employeeId);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Filter tabs */}
      <View style={[styles.filterRow, { backgroundColor: colors.background }]}>
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

      {/* Balances toggle */}
      <Pressable
        style={[styles.balanceToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => setShowBalances(v => !v)}
      >
        <Ionicons name="wallet-outline" size={16} color={colors.primary} />
        <Text style={[styles.balanceToggleText, { color: colors.foreground }]}>Leave Balances</Text>
        <Ionicons name={showBalances ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
      </Pressable>

      {showBalances && balances && balances.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.balancesScroll} contentContainerStyle={styles.balancesContainer}>
          {balances.map((b: any) => (
            <View key={b.employeeId} style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.balanceName, { color: colors.foreground }]} numberOfLines={1}>{b.employeeName}</Text>
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceType, { color: "#DC2626" }]}>Sick</Text>
                <Text style={[styles.balanceVal, { color: colors.foreground }]}>{b.sickRemaining}/{b.sick}</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceType, { color: "#2563EB" }]}>Casual</Text>
                <Text style={[styles.balanceVal, { color: colors.foreground }]}>{b.casualRemaining}/{b.casual}</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceType, { color: "#16A34A" }]}>Earned</Text>
                <Text style={[styles.balanceVal, { color: colors.foreground }]}>{b.earnedRemaining}/{b.earned}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={leaves ?? []}
          keyExtractor={(l) => String(l.id)}
          renderItem={({ item }) => (
            <LeaveRow leave={item} colors={colors} onApprove={handleApprove} onReject={handleReject} onDelete={handleDelete} />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="umbrella-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No leave requests</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 24 }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowCreate(true); }}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>

      {/* Create Leave Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView style={[styles.modalRoot, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Leave Request</Text>
              <Pressable onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Employee *</Text>
            <Pressable
              style={[styles.pickerTrigger, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowEmpPicker(true)}
            >
              <Text style={[styles.pickerTriggerText, { color: selectedEmployee ? colors.foreground : colors.mutedForeground }]}>
                {selectedEmployee ? selectedEmployee.name : "Select employee..."}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Leave Type</Text>
            <View style={styles.typeRow}>
              {leaveTypes.map((t) => (
                <Pressable
                  key={t}
                  style={[
                    styles.typeBtn,
                    { borderColor: colors.border },
                    form.type === t && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setForm(f => ({ ...f, type: t }))}
                >
                  <Text style={[styles.typeBtnText, { color: form.type === t ? "#fff" : colors.foreground }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Start Date * (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.startDate}
              onChangeText={(v) => setForm(f => ({ ...f, startDate: v }))}
              placeholder="2025-01-15"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>End Date * (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.endDate}
              onChangeText={(v) => setForm(f => ({ ...f, endDate: v }))}
              placeholder="2025-01-17"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Reason (optional)</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.reason}
              onChangeText={(v) => setForm(f => ({ ...f, reason: v }))}
              placeholder="Reason for leave..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />

            <Pressable
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              onPress={handleCreate}
              disabled={createLeave.isPending}
            >
              {createLeave.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Request</Text>
              )}
            </Pressable>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Employee Picker Modal */}
      <Modal visible={showEmpPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEmpPicker(false)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Employee</Text>
            <Pressable onPress={() => setShowEmpPicker(false)}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <FlatList
            data={employees ?? []}
            keyExtractor={(e) => String(e.id)}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.empPickerRow, { borderBottomColor: colors.border }]}
                onPress={() => { setForm(f => ({ ...f, employeeId: item.id })); setShowEmpPicker(false); }}
              >
                <View style={[styles.empPickerAvatar, { backgroundColor: colors.primary + "22" }]}>
                  <Text style={[styles.empPickerAvatarText, { color: colors.primary }]}>{item.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.empPickerName, { color: colors.foreground }]}>{item.name}</Text>
                  <Text style={[styles.empPickerRole, { color: colors.mutedForeground }]}>{item.role}</Text>
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
        title="Delete Leave"
        message="Remove this leave request? This cannot be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId !== null) {
            deleteLeave.mutate({ id: confirmDeleteId }, { onSuccess: () => { setConfirmDeleteId(null); refetch(); } });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
  },
  filterBtn: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  filterText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  balanceToggle: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 8,
  },
  balanceToggleText: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  balancesScroll: { marginBottom: 10 },
  balancesContainer: { paddingHorizontal: 16, gap: 10 },
  balanceCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    width: 140,
  },
  balanceName: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  balanceType: { fontSize: 12, fontFamily: "Inter_500Medium" },
  balanceVal: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  leaveCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  leaveHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  leaveTitleRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  typeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  leaveEmployee: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  leaveDates: { flexDirection: "row", alignItems: "center", gap: 6 },
  leaveDateText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  leaveReason: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  leaveActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 8, paddingVertical: 8, gap: 4, borderWidth: 1,
  },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
  pickerTriggerText: { fontSize: 15, fontFamily: "Inter_400Regular", flex: 1 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  typeBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  typeBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  submitBtn: {
    borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginTop: 8,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  empPickerRow: {
    flexDirection: "row", alignItems: "center", padding: 16, gap: 12,
    borderBottomWidth: 1,
  },
  empPickerAvatar: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
  },
  empPickerAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  empPickerName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  empPickerRole: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
