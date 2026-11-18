import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useListPayments, useCreatePayment, useDeletePayment, useListEmployees } from "@workspace/api-client-react";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const PAYMENT_TYPES = ["salary", "advance", "bonus", "incentive", "reimbursement", "deduction", "loan", "loan_repayment", "tds"];

// Types that are taken back from the employee (shown with a minus sign)
const DEDUCTION_TYPES = ["deduction", "loan_repayment", "tds"];

const TYPE_LABELS: Record<string, string> = {
  salary: "Salary", advance: "Advance", bonus: "Bonus", incentive: "Incentive",
  reimbursement: "Reimbursement", deduction: "Deduction", loan: "Loan",
  loan_repayment: "Loan repayment", tds: "TDS",
};
const PAYMENT_METHODS = ["cash", "upi", "bank"];

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  salary: { color: "#576DFA", bg: "#EDECFE" },
  advance: { color: "#D97706", bg: "#FEF3C7" },
  bonus: { color: "#16A34A", bg: "#DCFCE7" },
   deduction: { color: "#DC2626", bg: "#FEE2E2" },
   incentive: { color: "#0D9488", bg: "#CCFBF1" },
   reimbursement: { color: "#2563EB", bg: "#DBEAFE" },
   loan: { color: "#7C3AED", bg: "#EDE9FE" },
   loan_repayment: { color: "#9333EA", bg: "#F3E8FF" },
   tds: { color: "#B45309", bg: "#FEF3C7" },
 };

const METHOD_COLORS: Record<string, { color: string; bg: string }> = {
  cash: { color: "#16A34A", bg: "#DCFCE7" },
  upi: { color: "#7C3AED", bg: "#EDE9FE" },
  bank: { color: "#2563EB", bg: "#DBEAFE" },
};

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  paid: { color: "#16A34A", bg: "#DCFCE7" },
  pending: { color: "#D97706", bg: "#FEF3C7" },
  cancelled: { color: "#DC2626", bg: "#FEE2E2" },
};

function PaymentRow({ payment, colors, onDelete }: { payment: any; colors: any; onDelete: (id: number) => void }) {
  const t = TYPE_COLORS[payment.type] ?? TYPE_COLORS.salary;
  const m = METHOD_COLORS[payment.method] ?? METHOD_COLORS.cash;
  const st = STATUS_COLORS[payment.status] ?? STATUS_COLORS.pending;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>{payment.employeeName.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.empName, { color: colors.foreground }]} numberOfLines={1}>{payment.employeeName}</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: t.bg }]}>
              <Text style={[styles.badgeText, { color: t.color }]}>{TYPE_LABELS[payment.type] ?? payment.type}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: m.bg }]}>
              <Text style={[styles.badgeText, { color: m.color }]}>{payment.method}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: st.bg }]}>
              <Text style={[styles.badgeText, { color: st.color }]}>{payment.status ?? "pending"}</Text>
            </View>
          </View>
        </View>
        <View style={styles.amountCol}>
          <Text style={[styles.amount, { color: DEDUCTION_TYPES.includes(payment.type) ? "#DC2626" : "#16A34A" }]}>
            {DEDUCTION_TYPES.includes(payment.type) ? "-" : "+"}₹{payment.amount.toLocaleString("en-IN")}
          </Text>
          <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
            {payment.month && payment.year ? `${MONTH_NAMES[payment.month - 1]} ${payment.year}` : "—"}
          </Text>
        </View>
        <Pressable onPress={() => onDelete(payment.id)} hitSlop={8} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
      {payment.note ? (
        <Text style={[styles.note, { color: colors.mutedForeground }]} numberOfLines={1}>{payment.note}</Text>
      ) : null}
    </View>
  );
}

const PAYMENT_STATUSES = [
  { value: "paid", label: "Paid", color: "#16A34A", bg: "#DCFCE7" },
  { value: "pending", label: "Pending", color: "#D97706", bg: "#FEF3C7" },
];

interface CreatePaymentForm {
  employeeId: number | null;
  amount: string;
  type: string;
  method: string;
  status: string;
  month: string;
  year: string;
  note: string;
}

export default function PaymentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [showAll, setShowAll] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<CreatePaymentForm>({
    employeeId: null, amount: "", type: "salary", method: "bank", status: "paid",
    month: String(now.getMonth() + 1), year: String(now.getFullYear()), note: "",
  });

  const queryClient = useQueryClient();
  const { data: payments, isLoading } = useListPayments(
    showAll ? {} : { month: filterMonth, year: filterYear }
  );
  const { data: employees } = useListEmployees({});
  const createPayment = useCreatePayment();
  const deletePayment = useDeletePayment();

  const invalidatePayments = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
  };

  const prevMonth = () => {
    if (filterMonth === 1) { setFilterMonth(12); setFilterYear(y => y - 1); }
    else setFilterMonth(m => m - 1);
  };
  const nextMonth = () => {
    const nm = filterMonth === 12 ? 1 : filterMonth + 1;
    const ny = filterMonth === 12 ? filterYear + 1 : filterYear;
    if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth() + 1)) return;
    setFilterMonth(nm); setFilterYear(ny);
  };

  const handleDelete = (id: number) => {
    setConfirmDeleteId(id);
  };

  const handleCreate = () => {
    if (!form.employeeId || !form.amount) {
      Alert.alert("Error", "Employee and amount are required.");
      return;
    }
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Error", "Enter a valid amount.");
      return;
    }
    createPayment.mutate(
      {
        data: {
          employeeId: form.employeeId,
          amount: amt,
          type: form.type,
          method: form.method,
          status: form.status,
          month: form.month ? parseInt(form.month) : null,
          year: form.year ? parseInt(form.year) : null,
          note: form.note || null,
        },
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setShowCreate(false);
          setForm({ employeeId: null, amount: "", type: "salary", method: "bank", status: "paid", month: String(now.getMonth() + 1), year: String(now.getFullYear()), note: "" });
          invalidatePayments();
        },
        onError: () => Alert.alert("Error", "Failed to add payment."),
      }
    );
  };

  const paymentsList: any[] = payments ?? [];
  const totalIn = paymentsList.filter(p => !DEDUCTION_TYPES.includes(p.type)).reduce((s, p) => s + p.amount, 0);
  const totalDeduct = paymentsList.filter(p => DEDUCTION_TYPES.includes(p.type)).reduce((s, p) => s + p.amount, 0);
  const selectedEmployee = employees?.find((e: any) => e.id === form.employeeId);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Month nav or All toggle */}
      <View style={[styles.monthNav, { backgroundColor: colors.background }]}>
        {!showAll && (
          <>
            <Pressable onPress={prevMonth} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.monthLabel, { color: colors.foreground }]}>
              {MONTH_NAMES[filterMonth - 1]} {filterYear}
            </Text>
            <Pressable onPress={nextMonth} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
            </Pressable>
          </>
        )}
        {showAll && <Text style={[styles.monthLabel, { color: colors.foreground }]}>All Payments</Text>}
        <Pressable
          style={[styles.allToggle, { backgroundColor: showAll ? colors.primary : colors.card, borderColor: colors.border }]}
          onPress={() => setShowAll(v => !v)}
        >
          <Text style={[styles.allToggleText, { color: showAll ? "#fff" : colors.foreground }]}>All</Text>
        </Pressable>
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: "#DCFCE7" }]}>
          <Text style={[styles.summaryAmount, { color: "#16A34A" }]}>₹{totalIn.toLocaleString("en-IN")}</Text>
          <Text style={[styles.summaryLabel, { color: "#16A34A" }]}>Total Paid</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#FEE2E2" }]}>
          <Text style={[styles.summaryAmount, { color: "#DC2626" }]}>₹{totalDeduct.toLocaleString("en-IN")}</Text>
          <Text style={[styles.summaryLabel, { color: "#DC2626" }]}>Deductions</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#EDECFE" }]}>
          <Text style={[styles.summaryAmount, { color: "#576DFA" }]}>{paymentsList.length}</Text>
          <Text style={[styles.summaryLabel, { color: "#576DFA" }]}>Records</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={paymentsList}
          keyExtractor={(p) => String(p.id)}
          renderItem={({ item }) => <PaymentRow payment={item} colors={colors} onDelete={handleDelete} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="cash-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No payments found</Text>
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

      {/* Create Payment Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView style={[styles.modalRoot, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Payment</Text>
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

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Amount *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.amount}
              onChangeText={(v) => setForm(f => ({ ...f, amount: v }))}
              placeholder="5000"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Payment Type</Text>
            <View style={styles.optionRow}>
              {PAYMENT_TYPES.map((t) => (
                <Pressable
                  key={t}
                  style={[styles.optionBtn, { borderColor: colors.border }, form.type === t && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setForm(f => ({ ...f, type: t }))}
                >
                  <Text style={[styles.optionBtnText, { color: form.type === t ? "#fff" : colors.foreground }]}>
                      {TYPE_LABELS[t] ?? t}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Method</Text>
            <View style={styles.optionRow}>
              {PAYMENT_METHODS.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.optionBtn, { borderColor: colors.border }, form.method === m && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setForm(f => ({ ...f, method: m }))}
                >
                  <Text style={[styles.optionBtnText, { color: form.method === m ? "#fff" : colors.foreground }]}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Status</Text>
            <View style={[styles.optionRow, { marginBottom: 16 }]}>
              {PAYMENT_STATUSES.map((s) => (
                <Pressable
                  key={s.value}
                  style={[
                    styles.optionBtn,
                    { borderColor: colors.border },
                    form.status === s.value && { backgroundColor: s.bg, borderColor: s.color },
                  ]}
                  onPress={() => setForm(f => ({ ...f, status: s.value }))}
                >
                  <Text style={[styles.optionBtnText, { color: form.status === s.value ? s.color : colors.foreground }]}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Month (1–12)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={form.month}
                  onChangeText={(v) => setForm(f => ({ ...f, month: v }))}
                  placeholder="1"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Year</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={form.year}
                  onChangeText={(v) => setForm(f => ({ ...f, year: v }))}
                  placeholder="2025"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Note (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.note}
              onChangeText={(v) => setForm(f => ({ ...f, note: v }))}
              placeholder="e.g. January salary"
              placeholderTextColor={colors.mutedForeground}
            />

            <Pressable
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              onPress={handleCreate}
              disabled={createPayment.isPending}
            >
              {createPayment.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Add Payment</Text>
              )}
            </Pressable>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Employee Picker */}
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
                style={[styles.empRow, { borderBottomColor: colors.border }]}
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
        title="Delete Payment"
        message="Remove this payment record? This cannot be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId !== null) {
            deletePayment.mutate({ id: confirmDeleteId }, { onSuccess: () => { setConfirmDeleteId(null); invalidatePayments(); } });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  monthNav: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 12, gap: 8,
  },
  navBtn: { padding: 6 },
  monthLabel: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Inter_700Bold" },
  allToggle: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1,
  },
  allToggleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  summaryRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 12 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  summaryAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 2 },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 6 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  empName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  badges: { flexDirection: "row", gap: 6 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  amountCol: { alignItems: "flex-end" },
  amount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  dateText: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  deleteBtn: { paddingLeft: 8 },
  note: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },
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
  pickerTrigger: {
    height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
  },
  pickerTriggerText: { fontSize: 15, fontFamily: "Inter_400Regular", flex: 1 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  optionBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  optionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  rowInputs: { flexDirection: "row", gap: 12 },
  submitBtn: { borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginTop: 8 },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  empRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12, borderBottomWidth: 1 },
  empPickerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  empPickerAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  empPickerName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  empPickerRole: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
