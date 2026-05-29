import { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useColors } from "@/hooks/useColors";
import {
  useListEmployees,
  useListAttendance,
  useMarkAttendance,
  useUpdateEmployee,
} from "@workspace/api-client-react";

const SCREEN_WIDTH = Dimensions.get("window").width;

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const SHORT_MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const ROLES = ["Developer","BDM","Manager","HR","Sales","Marketing","Accountant","IT Support","Operations","Other"];
const DEPARTMENTS = ["Engineering","Design","Management","HR","Sales","Marketing","Finance","Support","Operations","Other"];
const SALARY_TYPES = ["monthly","daily"];
const STATUSES = ["active","inactive"];

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  present:   { color: "#FFFFFF", bg: "#16A34A", border: "#16A34A" },
  absent:    { color: "#FFFFFF", bg: "#DC2626", border: "#DC2626" },
  half_day:  { color: "#FFFFFF", bg: "#D97706", border: "#D97706" },
  paid_leave:{ color: "#FFFFFF", bg: "#7C3AED", border: "#7C3AED" },
  week_off:  { color: "#FFFFFF", bg: "#6B7280", border: "#6B7280" },
  future:    { color: "#9CA3AF", bg: "#F3F4F6", border: "#E5E7EB" },
  none:      { color: "#9CA3AF", bg: "#E5E7EB", border: "#E5E7EB" },
};

function getDateStatus(dateStr: string, records: any[], dayOfWeek: number) {
  const rec = records.find((r) => r.date?.startsWith(dateStr));
  if (rec) {
    const isLate = rec.checkIn && rec.checkIn > "09:30:00";
    return { status: rec.status, isLate, record: rec };
  }
  if (dayOfWeek === 0 || dayOfWeek === 6) return { status: "week_off", isLate: false, record: null };
  return { status: "none", isLate: false, record: null };
}

function formatTime(t: string | null | undefined): string {
  if (!t) return "—";
  if (t.includes("AM") || t.includes("PM")) return t;
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${m?.slice(0, 2) ?? "00"} ${ampm}`;
}

// ─── Cell size: fit 7 columns with padding ────────────────────────────────────
const CAL_PADDING = 12;
const CAL_GAP = 3;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 32 - CAL_PADDING * 2 - CAL_GAP * 6) / 7);

// ─── Calendar Cell ────────────────────────────────────────────────────────────
function CalendarCell({ day, statusKey, isLate, isFuture, isToday, onPress }: {
  day: number; statusKey: string; isLate: boolean;
  isFuture: boolean; isToday: boolean; onPress: () => void;
}) {
  const cfg = isFuture ? STATUS_CONFIG.future : (STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.none);
  return (
    <Pressable
      onPress={onPress}
      style={[
        calSt.cell,
        { backgroundColor: cfg.bg, borderColor: isToday ? "#576DFA" : cfg.border },
        isToday && { borderWidth: 2 },
      ]}
    >
      <Text style={[calSt.dayNum, { color: cfg.color }]}>{String(day).padStart(2, "0")}</Text>
      {isLate && !isFuture && <Text style={calSt.late}>LATE</Text>}
    </Pressable>
  );
}

const calSt = StyleSheet.create({
  cell: {
    width: CELL_SIZE, height: CELL_SIZE, borderRadius: 7,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  dayNum: { fontSize: 12, fontFamily: "Inter_700Bold" },
  late: { fontSize: 6, fontFamily: "Inter_700Bold", color: "#fff", marginTop: 1 },
});

// ─── Summary Strip ────────────────────────────────────────────────────────────
function SummaryStrip({ records, month, year }: { records: any[]; month: number; year: number }) {
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  const filtered  = records.filter((r) => r.date?.startsWith(monthStr));
  const present   = filtered.filter((r) => r.status === "present").length;
  const absent    = filtered.filter((r) => r.status === "absent").length;
  const halfDay   = filtered.filter((r) => r.status === "half_day").length;
  const paidLeave = filtered.filter((r) => r.status === "paid_leave").length;
  const weekOff   = filtered.filter((r) => r.status === "week_off").length;

  const items = [
    { label: "Present",    value: present,   color: "#16A34A", bg: "#DCFCE7" },
    { label: "Absent",     value: absent,    color: "#DC2626", bg: "#FEE2E2" },
    { label: "Half day",   value: halfDay,   color: "#D97706", bg: "#FEF3C7" },
    { label: "Paid Leave", value: paidLeave, color: "#7C3AED", bg: "#EDE9FE" },
    { label: "Week Off",   value: weekOff,   color: "#6B7280", bg: "#F3F4F6" },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 10 }}>
      {items.map((item) => (
        <View key={item.label} style={[sumSt.chip, { backgroundColor: item.bg, borderLeftColor: item.color }]}>
          <Text style={[sumSt.label, { color: item.color }]}>{item.label}</Text>
          <Text style={[sumSt.value, { color: item.color }]}>{item.value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const sumSt = StyleSheet.create({
  chip: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, minWidth: 84, alignItems: "center" },
  label: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 2 },
  value: { fontSize: 22, fontFamily: "Inter_700Bold" },
});

// ─── Date Detail Modal (check-in / check-out + mark status) ──────────────────
function DateDetailModal({
  visible, dateStr, employeeId, existingRecord, colors, onClose, onSuccess,
}: {
  visible: boolean; dateStr: string; employeeId: number;
  existingRecord: any; colors: any; onClose: () => void; onSuccess: () => void;
}) {
  const markAttendance = useMarkAttendance();
  const [status, setStatus] = useState<string>(existingRecord?.status ?? "present");

  // sync status when modal opens for a different day
  useMemo(() => { setStatus(existingRecord?.status ?? "present"); }, [existingRecord, dateStr]);

  const OPTS = [
    { value: "present",    label: "Present",    color: "#16A34A", bg: "#DCFCE7" },
    { value: "absent",     label: "Absent",     color: "#DC2626", bg: "#FEE2E2" },
    { value: "half_day",   label: "Half Day",   color: "#D97706", bg: "#FEF3C7" },
    { value: "paid_leave", label: "Paid Leave", color: "#7C3AED", bg: "#EDE9FE" },
  ];

  const handleSave = () => {
    markAttendance.mutate(
      { data: { employeeId, date: dateStr, status } },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onSuccess();
          onClose();
        },
        onError: () => Alert.alert("Error", "Could not mark attendance."),
      }
    );
  };

  const displayDate = dateStr
    ? new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={dtSt.overlay} onPress={onClose}>
        <Pressable style={[dtSt.sheet, { backgroundColor: colors.card }]}>
          {/* Header */}
          <View style={dtSt.sheetHeader}>
            <Text style={[dtSt.sheetTitle, { color: colors.foreground }]}>{displayDate}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Check-in / Check-out row */}
          <View style={[dtSt.timeRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={dtSt.timeCell}>
              <Ionicons name="log-in-outline" size={18} color="#16A34A" />
              <Text style={[dtSt.timeLabel, { color: colors.mutedForeground }]}>Check In</Text>
              <Text style={[dtSt.timeValue, { color: colors.foreground }]}>
                {formatTime(existingRecord?.checkIn)}
              </Text>
            </View>
            <View style={[dtSt.timeDivider, { backgroundColor: colors.border }]} />
            <View style={dtSt.timeCell}>
              <Ionicons name="log-out-outline" size={18} color="#DC2626" />
              <Text style={[dtSt.timeLabel, { color: colors.mutedForeground }]}>Check Out</Text>
              <Text style={[dtSt.timeValue, { color: colors.foreground }]}>
                {formatTime(existingRecord?.checkOut)}
              </Text>
            </View>
          </View>

          {/* Status options
          <Text style={[dtSt.sectionLabel, { color: colors.mutedForeground }]}>MARK ATTENDANCE</Text>
          <View style={dtSt.opts}>
            {OPTS.map((o) => (
              <Pressable
                key={o.value}
                onPress={() => setStatus(o.value)}
                style={[
                  dtSt.opt,
                  { backgroundColor: o.bg, borderColor: status === o.value ? o.color : "transparent" },
                  status === o.value && { borderWidth: 2 },
                ]}
              >
                <Text style={[dtSt.optLabel, { color: o.color }]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
             */}
          {/* Save
          <Pressable
            style={[dtSt.saveBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={markAttendance.isPending}
          >
            {markAttendance.isPending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={dtSt.saveBtnText}>Save</Text>}
          </Pressable>
           */}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const dtSt = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  timeRow: { flexDirection: "row", borderRadius: 14, borderWidth: 1, marginBottom: 20, overflow: "hidden" },
  timeCell: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 4 },
  timeDivider: { width: 1 },
  timeLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  timeValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 10 },
  opts: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  opt: { flex: 1, minWidth: "45%", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  optLabel: { fontSize: 14, fontFamily: "Inter_700Bold" },
  saveBtn: { borderRadius: 12, height: 50, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});

// ─── Dropdown ─────────────────────────────────────────────────────────────────
function Dropdown({ label, value, options, placeholder, onSelect, colors }: {
  label: string; value: string; options: string[];
  placeholder: string; onSelect: (v: string) => void; colors: any;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[edSt.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TouchableOpacity
        style={[edSt.input, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
        onPress={() => setOpen(true)} activeOpacity={0.7}
      >
        <Text style={{ color: value ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15 }}>{value || placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setOpen(false)}>
          <View style={[{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: 400, paddingBottom: 30 }]}>
            <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>{label}</Text>
              <Pressable onPress={() => setOpen(false)}><Ionicons name="close" size={22} color={colors.mutedForeground} /></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {options.map((opt) => (
                <TouchableOpacity key={opt}
                  style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }, value === opt && { backgroundColor: colors.primary + "18" }]}
                  onPress={() => { onSelect(opt); setOpen(false); }} activeOpacity={0.6}
                >
                  <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: value === opt ? colors.primary : colors.foreground }}>{opt}</Text>
                  {value === opt && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Edit Employee Modal ───────────────────────────────────────────────────────
function EditEmployeeModal({ visible, employee, colors, onClose, onSuccess }: {
  visible: boolean; employee: any; colors: any; onClose: () => void; onSuccess: () => void;
}) {
  const updateEmployee = useUpdateEmployee();
  const [form, setForm] = useState({
    name: "", phone: "", email: "", role: "", department: "",
    salary: "", salaryType: "monthly", joiningDate: "", status: "active", password: "",
  });

  useMemo(() => {
    if (employee) {
      setForm({
        name: employee.name ?? "",
        phone: employee.phone ? employee.phone.replace(/^\+91/, "").replace(/^91/, "") : "",
        email: employee.email ?? "",
        role: employee.role ?? "",
        department: employee.department ?? "",
        salary: String(employee.salary ?? ""),
        salaryType: employee.salaryType ?? "monthly",
        joiningDate: employee.joiningDate ?? "",
        status: employee.status ?? "active",
        password: "",
      });
    }
  }, [employee, visible]);

  const handleSave = () => {
    if (!form.name || !form.role || !form.salary || !form.phone) {
      Alert.alert("Error", "Name, phone, role and salary are required."); return;
    }
    if (form.phone.length !== 10) {
      Alert.alert("Error", "Enter a valid 10-digit phone number."); return;
    }
    const salary = parseFloat(form.salary);
    if (isNaN(salary) || salary <= 0) {
      Alert.alert("Error", "Enter a valid salary amount."); return;
    }
    const payload: any = {
      name: form.name, phone: `+91${form.phone}`,
      email: form.email || null, role: form.role,
      department: form.department || null, salary,
      salaryType: form.salaryType,
      joiningDate: form.joiningDate || new Date().toISOString().split("T")[0],
      status: form.status,
    };
    if (form.password) payload.password = form.password;

    updateEmployee.mutate({ id: employee.id, data: payload }, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess(); onClose();
      },
      onError: () => Alert.alert("Error", "Could not update employee."),
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={[{ flex: 1, padding: 20, backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground }}>Edit Employee</Text>
            <Pressable onPress={onClose}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
          </View>

          <Text style={[edSt.fieldLabel, { color: colors.mutedForeground }]}>Full Name *</Text>
          <TextInput style={[edSt.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={form.name} onChangeText={(v) => setForm(f => ({ ...f, name: v }))}
            placeholder="John Doe" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />

          <Text style={[edSt.fieldLabel, { color: colors.mutedForeground }]}>Phone *</Text>
          <View style={[edSt.phoneRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[edSt.phonePrefix, { borderRightColor: colors.border }]}>
              <Text style={[edSt.phonePrefixText, { color: colors.foreground }]}>🇮🇳 +91</Text>
            </View>
            <TextInput style={[edSt.phoneInput, { color: colors.foreground }]}
              value={form.phone} onChangeText={(v) => setForm(f => ({ ...f, phone: v.replace(/[^0-9]/g, "") }))}
              placeholder="9876543210" placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad" maxLength={10} />
          </View>

          <Text style={[edSt.fieldLabel, { color: colors.mutedForeground }]}>Email</Text>
          <TextInput style={[edSt.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={form.email} onChangeText={(v) => setForm(f => ({ ...f, email: v }))}
            placeholder="john@company.com" placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address" autoCapitalize="none" />

          <Dropdown label="Role *" value={form.role} options={ROLES} placeholder="Select role..." onSelect={(v) => setForm(f => ({ ...f, role: v }))} colors={colors} />
          <Dropdown label="Department" value={form.department} options={DEPARTMENTS} placeholder="Select department..." onSelect={(v) => setForm(f => ({ ...f, department: v }))} colors={colors} />

          <Text style={[edSt.fieldLabel, { color: colors.mutedForeground }]}>Joining Date (YYYY-MM-DD)</Text>
          <TextInput style={[edSt.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={form.joiningDate} onChangeText={(v) => setForm(f => ({ ...f, joiningDate: v }))}
            placeholder={new Date().toISOString().split("T")[0]} placeholderTextColor={colors.mutedForeground}
            keyboardType="numbers-and-punctuation" />

          <Text style={[edSt.fieldLabel, { color: colors.mutedForeground }]}>New Password (leave blank to keep)</Text>
          <TextInput style={[edSt.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={form.password} onChangeText={(v) => setForm(f => ({ ...f, password: v }))}
            placeholder="Min 6 characters" placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none" secureTextEntry />

          <Text style={[edSt.fieldLabel, { color: colors.mutedForeground }]}>Salary Amount *</Text>
          <TextInput style={[edSt.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={form.salary} onChangeText={(v) => setForm(f => ({ ...f, salary: v }))}
            placeholder="25000" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" />

          <Text style={[edSt.fieldLabel, { color: colors.mutedForeground }]}>Salary Type</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            {SALARY_TYPES.map((t) => (
              <Pressable key={t} onPress={() => setForm(f => ({ ...f, salaryType: t }))}
                style={[edSt.optBtn, { borderColor: colors.border }, form.salaryType === t && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                <Text style={{ color: form.salaryType === t ? "#fff" : colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[edSt.fieldLabel, { color: colors.mutedForeground }]}>Status</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            {STATUSES.map((s) => (
              <Pressable key={s} onPress={() => setForm(f => ({ ...f, status: s }))}
                style={[edSt.optBtn, { borderColor: colors.border }, form.status === s && { backgroundColor: s === "active" ? "#16A34A" : "#DC2626", borderColor: "transparent" }]}>
                <Text style={{ color: form.status === s ? "#fff" : colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={[edSt.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={updateEmployee.isPending}>
            {updateEmployee.isPending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={edSt.saveBtnText}>Save Changes</Text>}
          </Pressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const edSt = StyleSheet.create({
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 14 },
  phoneRow: { height: 48, borderRadius: 12, borderWidth: 1, marginBottom: 14, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  phonePrefix: { paddingHorizontal: 12, height: "100%", justifyContent: "center", borderRightWidth: 1 },
  phonePrefixText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  phoneInput: { flex: 1, paddingHorizontal: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  optBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  saveBtn: { borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginTop: 8 },
  saveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});

// ─── Salary Tab ───────────────────────────────────────────────────────────────
function SalaryTab({ employee, records }: { employee: any; records: any[] }) {
  const colors = useColors();
  const present   = records.filter((r) => r.status === "present").length;
  const halfDays  = records.filter((r) => r.status === "half_day").length;
  const paidLeave = records.filter((r) => r.status === "paid_leave").length;
  const dailyRate = employee.salaryType === "daily" ? employee.salary : employee.salary / 26;
  const earned    = (present + paidLeave) * dailyRate + halfDays * dailyRate * 0.5;
  const deduction = Math.max(employee.salary - earned, 0);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={[salSt.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[salSt.heading, { color: colors.mutedForeground }]}>Salary Breakdown</Text>
        {[
          { label: "Base Salary", value: `₹${employee.salary.toLocaleString("en-IN")}/${employee.salaryType === "monthly" ? "mo" : "day"}`, color: colors.foreground },
          { label: "Present Days", value: `${present} days`, color: "#16A34A" },
          { label: "Half Days", value: `${halfDays} days`, color: "#D97706" },
          { label: "Paid Leave", value: `${paidLeave} days`, color: "#7C3AED" },
        ].map((r) => (
          <View key={r.label} style={salSt.row}>
            <Text style={[salSt.label, { color: colors.mutedForeground }]}>{r.label}</Text>
            <Text style={[salSt.value, { color: r.color }]}>{r.value}</Text>
          </View>
        ))}
        <View style={[salSt.divider, { backgroundColor: colors.border }]} />
        <View style={salSt.row}>
          <Text style={[salSt.label, { color: colors.mutedForeground }]}>Earned (est.)</Text>
          <Text style={[salSt.big, { color: "#16A34A" }]}>₹{Math.round(earned).toLocaleString("en-IN")}</Text>
        </View>
        <View style={salSt.row}>
          <Text style={[salSt.label, { color: colors.mutedForeground }]}>Deduction (est.)</Text>
          <Text style={[salSt.big, { color: "#DC2626" }]}>-₹{Math.round(deduction).toLocaleString("en-IN")}</Text>
        </View>
      </View>
      <View style={[salSt.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[salSt.heading, { color: colors.mutedForeground }]}>Employee Info</Text>
        {[
          { label: "Phone", value: employee.phone },
          { label: "Email", value: employee.email ?? "—" },
          { label: "Role", value: employee.role },
          { label: "Department", value: employee.department ?? "—" },
          { label: "Joined", value: employee.joiningDate ?? "—" },
          { label: "Status", value: employee.status },
        ].map((r) => (
          <View key={r.label} style={salSt.row}>
            <Text style={[salSt.label, { color: colors.mutedForeground }]}>{r.label}</Text>
            <Text style={[salSt.value, { color: colors.foreground }]}>{r.value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const salSt = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 16 },
  heading: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  label: { fontSize: 14, fontFamily: "Inter_400Regular" },
  value: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  big: { fontSize: 16, fontFamily: "Inter_700Bold" },
  divider: { height: 1, marginVertical: 8 },
});

// ─── Notes Tab ────────────────────────────────────────────────────────────────
function NotesTab({ employee }: { employee: any }) {
  const colors = useColors();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, alignItems: "center", paddingTop: 48 }}>
      <Ionicons name="document-text-outline" size={48} color={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15, marginTop: 12 }}>
        No notes yet for {employee.name}.
      </Text>
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function EmployeeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const employeeId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const now = new Date();
  const [year, setYear]       = useState(now.getFullYear());
  const [month, setMonth]     = useState(now.getMonth());
  const [activeTab, setActiveTab] = useState<"attendance" | "salary" | "notes">("attendance");
  const [dateModal, setDateModal] = useState<{ visible: boolean; dateStr: string; record: any }>({
    visible: false, dateStr: "", record: null,
  });
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showEditModal,   setShowEditModal]   = useState(false);

  const { data: employees, isLoading: empLoading, refetch: refetchEmp } = useListEmployees({});
  const employee = employees?.find((e: any) => e.id === employeeId);

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay    = new Date(year, month + 1, 0).getDate();
  const monthEnd   = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: attendanceData, isLoading: attLoading, refetch } = useListAttendance({
    employeeId, from: monthStart, to: monthEnd,
  });

  const records: any[] = useMemo(
    () => (attendanceData ?? []).filter((r: any) => r.employeeId === employeeId),
    [attendanceData, employeeId]
  );

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const rows = Math.ceil((firstDayOfWeek + lastDay) / 7);

  const goMonth = (dir: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let m = month + dir, y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };

  const openDateModal = (dateStr: string) => {
    const cellDate = new Date(dateStr);
    if (cellDate > new Date()) return;
    const record = records.find((r: any) => r.date?.startsWith(dateStr)) ?? null;
    setDateModal({ visible: true, dateStr, record });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleDownloadReport = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const monthStr = `${MONTH_NAMES[month]} ${year}`;
      const present   = records.filter((r) => r.status === "present").length;
      const absent    = records.filter((r) => r.status === "absent").length;
      const halfDay   = records.filter((r) => r.status === "half_day").length;
      const paidLeave = records.filter((r) => r.status === "paid_leave").length;
      const weekOff   = records.filter((r) => r.status === "week_off").length;

      const rows = records
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => `
          <tr>
            <td>${new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
            <td style="color:${
              r.status === "present"    ? "#16A34A" :
              r.status === "absent"     ? "#DC2626" :
              r.status === "half_day"   ? "#D97706" :
              r.status === "paid_leave" ? "#7C3AED" : "#6B7280"
            }; font-weight:bold; text-transform:capitalize;">
              ${r.status.replace("_", " ")}
            </td>
            <td>${r.checkIn  ? formatTime(r.checkIn)  : "—"}</td>
            <td>${r.checkOut ? formatTime(r.checkOut) : "—"}</td>
          </tr>
        `).join("");

      const html = `
        <html>
        <head>
          <meta charset="utf-8"/>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1   { font-size: 20px; margin-bottom: 4px; }
            p    { color: #666; margin: 0 0 20px; }
            .summary { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
            .chip { padding: 10px 16px; border-radius: 8px; min-width: 80px; text-align: center; }
            .chip span { display: block; font-size: 11px; margin-bottom: 4px; }
            .chip strong { font-size: 22px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-size: 13px; }
            td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
            tr:last-child td { border-bottom: none; }
          </style>
        </head>
        <body>
          <h1>${employee.name} — Attendance Report</h1>
          <p>${monthStr} &nbsp;|&nbsp; ${employee.role}${employee.department ? " · " + employee.department : ""}</p>
          <div class="summary">
            <div class="chip" style="background:#DCFCE7;color:#16A34A"><span>Present</span><strong>${present}</strong></div>
            <div class="chip" style="background:#FEE2E2;color:#DC2626"><span>Absent</span><strong>${absent}</strong></div>
            <div class="chip" style="background:#FEF3C7;color:#D97706"><span>Half Day</span><strong>${halfDay}</strong></div>
            <div class="chip" style="background:#EDE9FE;color:#7C3AED"><span>Paid Leave</span><strong>${paidLeave}</strong></div>
            <div class="chip" style="background:#F3F4F6;color:#6B7280"><span>Week Off</span><strong>${weekOff}</strong></div>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Status</th><th>Check In</th><th>Check Out</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `${employee.name} Attendance - ${monthStr}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Saved", `Report saved to:\n${uri}`);
      }
    } catch (err) {
      Alert.alert("Error", "Could not generate report.");
    }
  };

  if (empLoading) {
    return (
      <View style={[st.loader, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!employee) {
    return (
      <View style={[st.loader, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.destructive} />
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 12 }}>Employee not found.</Text>
      </View>
    );
  }

  return (
    <>
      {/* ── Hide the Expo Router header & bottom tab bar for this screen ── */}
      <Stack.Screen options={{ headerShown: false, tabBarStyle: { display: "none" } }} />

      <View style={[st.root, { backgroundColor: colors.background }]}>

        {/* ── Custom Header ── */}
        <View style={[st.header, { paddingTop: insets.top + (Platform.OS === "android" ? 8 : 4), backgroundColor: colors.background }]}>
          <Pressable onPress={() => router.back()} style={st.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={[st.headerAvatar, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[st.headerAvatarText, { color: colors.primary }]}>{employee.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={[st.headerName, { color: colors.foreground }]} numberOfLines={1}>{employee.name}</Text>
          <Pressable style={[st.editBtn, { backgroundColor: colors.primary }]} onPress={() => setShowEditModal(true)}>
            <Text style={st.editBtnText}>EDIT</Text>
          </Pressable>
          <Pressable style={st.moreBtn} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.foreground} />
          </Pressable>
        </View>

        {/* ── Tabs ── */}
        <View style={[st.tabRow, { borderBottomColor: colors.border }]}>
          {(["attendance", "salary", "notes"] as const).map((tab) => (
            <Pressable
              key={tab}
              style={[st.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2.5 }]}
              onPress={() => { setActiveTab(tab); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[st.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
                {tab.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Attendance Tab ── */}
        {activeTab === "attendance" && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>

            {/* Month picker bar */}
            <View style={[st.monthRow, { backgroundColor: "#FFFDE7" }]}>
              <View style={st.monthLeft}>
                <Ionicons name="information-circle-outline" size={18} color="#B45309" />
                <Text style={[st.monthLabel, { color: "#B45309" }]}>Attendance For</Text>
              </View>
              <Pressable onPress={() => setShowMonthPicker(true)}
                style={[st.monthPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                <Text style={[st.monthPickerText, { color: colors.foreground }]}>{MONTH_NAMES[month]} {year}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Quick actions
            <View style={[st.actionsRow, { borderBottomColor: colors.border }]}>
              {[
                { icon: "person-add-outline", label: "Mark All\nPresent" },
                { icon: "locate-outline",     label: "Live Location" },
                { icon: "list-outline",       label: "List view" },
              ].map((a, i) => (
                <View key={a.label} style={{ flexDirection: "row", flex: 1, alignItems: "center" }}>
                  {i > 0 && <View style={[st.actionDivider, { backgroundColor: colors.border }]} />}
                  <Pressable style={st.actionBtn}>
                    <Ionicons name={a.icon as any} size={20} color={colors.primary} />
                    <Text style={[st.actionLabel, { color: colors.primary }]}>{a.label}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
                    */}
           {/* Summary */}
           {attLoading
             ? <View style={{ paddingVertical: 16, alignItems: "center", marginTop: 12 }}>
                 <ActivityIndicator color={colors.primary} />
               </View>
             : <View style={{ marginTop: 12 }}>
                 <SummaryStrip records={records} month={month} year={year} />
               </View>}
            {/* Calendar */}
            <View style={[st.calBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* month nav */}
              <View style={st.calHeader}>
                <Pressable onPress={() => goMonth(-1)} hitSlop={10}>
                  <Ionicons name="chevron-back" size={20} color={colors.foreground} />
                </Pressable>
                <Text style={[st.calTitle, { color: colors.foreground }]}>{MONTH_NAMES[month]} {year}</Text>
                <Pressable onPress={() => goMonth(1)} hitSlop={10}>
                  <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
                </Pressable>
              </View>

              {/* Day name headers */}
              <View style={st.calDayRow}>
                {DAY_NAMES.map((d) => (
                  <Text key={d} style={[st.calDayName, { color: colors.mutedForeground, width: CELL_SIZE }]}>{d}</Text>
                ))}
              </View>

              {/* Grid rows */}
              {Array.from({ length: rows }).map((_, rowIdx) => (
                <View key={rowIdx} style={[st.calRow, { gap: CAL_GAP }]}>
                  {Array.from({ length: 7 }).map((_, colIdx) => {
                    const cellIdx = rowIdx * 7 + colIdx;
                    const dayNum  = cellIdx - firstDayOfWeek + 1;

                    if (dayNum < 1 || dayNum > lastDay) {
                      return <View key={colIdx} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
                    }

                    const dateStr   = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                    const today     = new Date();
                    const cellDate  = new Date(dateStr);
                    const isFuture  = cellDate > today;
                    const isToday   = cellDate.toDateString() === today.toDateString();
                    const dow       = new Date(year, month, dayNum).getDay();
                    const { status, isLate } = getDateStatus(dateStr, records, dow);

                    return (
                      <CalendarCell
                        key={colIdx}
                        day={dayNum}
                        statusKey={status}
                        isLate={isLate}
                        isFuture={isFuture}
                        isToday={isToday}
                        onPress={() => openDateModal(dateStr)}
                      />
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Legend */}
            <View style={st.legendRow}>
              {[
                { color: "#16A34A", label: "Present" },
                { color: "#DC2626", label: "Absent" },
                { color: "#D97706", label: "Half Day" },
                { color: "#7C3AED", label: "Paid Leave" },
                { color: "#6B7280", label: "Week Off" },
              ].map((item) => (
                <View key={item.label} style={st.legendItem}>
                  <View style={[st.legendDot, { backgroundColor: item.color }]} />
                  <Text style={[st.legendText, { color: colors.mutedForeground }]}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* Download */}
            <Pressable
              style={[st.downloadBtn, { borderColor: colors.primary }]}
              onPress={handleDownloadReport}
            >
              <Ionicons name="download-outline" size={18} color={colors.primary} />
              <Text style={[st.downloadText, { color: colors.primary }]}>Download Report</Text>
            </Pressable>
          </ScrollView>
        )}

        {activeTab === "salary" && <SalaryTab employee={employee} records={records} />}
        {activeTab === "notes"  && <NotesTab employee={employee} />}

        {/* ── Date Detail Modal ── */}
        <DateDetailModal
          visible={dateModal.visible}
          dateStr={dateModal.dateStr}
          employeeId={employeeId}
          existingRecord={dateModal.record}
          colors={colors}
          onClose={() => setDateModal((p) => ({ ...p, visible: false }))}
          onSuccess={refetch}
        />

        {/* ── Month Picker Modal ── */}
        <Modal visible={showMonthPicker} transparent animationType="fade" onRequestClose={() => setShowMonthPicker(false)}>
          <Pressable style={dtSt.overlay} onPress={() => setShowMonthPicker(false)}>
            <Pressable style={[dtSt.sheet, { backgroundColor: colors.card }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Pressable onPress={() => setYear((y) => y - 1)} hitSlop={8}>
                  <Ionicons name="chevron-back" size={22} color={colors.foreground} />
                </Pressable>
                <Text style={[dtSt.sheetTitle, { color: colors.foreground }]}>{year}</Text>
                <Pressable onPress={() => setYear((y) => y + 1)} hitSlop={8}>
                  <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {SHORT_MONTH.map((m, idx) => (
                  <Pressable key={m}
                    onPress={() => { setMonth(idx); setShowMonthPicker(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    style={[{ flex: 1, minWidth: "22%", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
                      idx === month ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted }]}>
                    <Text style={{ color: idx === month ? "#fff" : colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{m}</Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── Edit Employee Modal ── */}
        <EditEmployeeModal
          visible={showEditModal}
          employee={employee}
          colors={colors}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => refetchEmp()}
        />
      </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root:   { flex: 1 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  backBtn: { padding: 4 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerAvatarText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  headerName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  editBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  editBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  moreBtn: { padding: 4 },

  tabRow: { flexDirection: "row", borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 13, alignItems: "center", borderBottomWidth: 2.5, borderBottomColor: "transparent" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },

  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  monthLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  monthLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  monthPicker: { flexDirection: "row", alignItems: "center", borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  monthPickerText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  actionsRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 0.5, marginBottom: 12 },
  actionBtn: { flex: 1, alignItems: "center", gap: 4 },
  actionLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  actionDivider: { width: 1, height: 36 },

  calBox: { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, padding: CAL_PADDING, marginBottom: 8 },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  calDayRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  calDayName: { textAlign: "center", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  calRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: CAL_GAP },

  legendRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 10, marginTop: 8, marginBottom: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  downloadBtn: { marginHorizontal: 16, borderWidth: 1.5, borderRadius: 12, height: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  downloadText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});