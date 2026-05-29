import { useState } from "react";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  Platform, Modal, ScrollView, Alert, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  useListAttendance, useGetAttendanceSummary, useMarkAttendance,
  useListEmployees,
} from "@workspace/api-client-react";
import { sendAttendanceEmail } from "../lib/emailService";
import { usersTable } from "@workspace/db";
import { FaceAttendanceModal } from "@/components/FaceAttendanceModal";
import { Linking } from "react-native";
import { router } from "expo-router";

function formatDisplayTime(time: string): string {
  if (!time) return "";
  if (time.includes("AM") || time.includes("PM")) return time;
  const [hourStr, minuteStr] = time.split(":");
  const hour = parseInt(hourStr);
  const minutes = minuteStr?.slice(0, 2) || "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  const hours12 = hour % 12 || 12;
  return `${String(hours12).padStart(2, "0")}:${minutes} ${ampm}`;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const STATUSES = [
  { value: "present", label: "Present", color: "#16A34A", bg: "#DCFCE7", icon: "checkmark-circle" },
  { value: "absent", label: "Absent", color: "#DC2626", bg: "#FEE2E2", icon: "close-circle" },
  { value: "half_day", label: "Half Day", color: "#D97706", bg: "#FEF3C7", icon: "remove-circle" },
];

function SummaryChip({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipCount, { color }]}>{count}</Text>
      <Text style={[styles.chipLabel, { color }]}>{label}</Text>
    </View>
  );
}

function AttendanceRow({ record, colors, onCheckout }: { record: any; colors: any; onCheckout: (record: any) => void }) {
  const statusMap: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    present: { label: "Present", color: "#16A34A", bg: "#DCFCE7", icon: "checkmark-circle" },
    absent: { label: "Absent", color: "#DC2626", bg: "#FEE2E2", icon: "close-circle" },
    half_day: { label: "Half Day", color: "#D97706", bg: "#FEF3C7", icon: "remove-circle" },
  };
  const s = statusMap[record.status] ?? statusMap.absent;

  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.rowAvatar, { backgroundColor: colors.primary + "22" }]}>
        <Text style={[styles.rowAvatarText, { color: colors.primary }]}>
          {(record.employeeName ?? "?").charAt(0)}
        </Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>{record.employeeName}</Text>
        <Text style={[styles.rowDate, { color: colors.mutedForeground }]}>
          {new Date(record.date).toLocaleDateString("en", { day: "numeric", month: "short" })}
          {record.checkIn ? `  •  In: ${formatDisplayTime(record.checkIn)}` : ""}
          {record.checkOut ? `  •  Out: ${formatDisplayTime(record.checkOut)}` : ""}
        </Text>
        {record.latitude && record.longitude && (
          <Pressable onPress={() => {
            const url = `https://www.google.com/maps?q=${record.latitude},${record.longitude}`;
            Linking.openURL(url);
          }}>
            <Text style={{ color: "#2563EB", fontSize: 11, fontFamily: "Inter_500Medium" }}>
              📍 View Location
            </Text>
          </Pressable>
        )}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {record.status === "present" && record.checkIn && !record.checkOut && (
          <Pressable
            style={[styles.rowBadge, { backgroundColor: "#DBEAFE" }]}
            onPress={() => onCheckout(record)}
          >
            <Ionicons name="log-out-outline" size={14} color="#2563EB" />
            <Text style={[styles.rowBadgeText, { color: "#2563EB" }]}>Out</Text>
          </Pressable>
        )}
        <View style={[styles.rowBadge, { backgroundColor: s.bg }]}>
          <Ionicons name={s.icon as any} size={14} color={s.color} />
          <Text style={[styles.rowBadgeText, { color: s.color }]}>{s.label}</Text>
        </View>
      </View>
    </View>
  );
}
interface MarkForm {
  employeeId: number | null;
  date: string;
  status: string;
  checkIn: string;
  checkOut: string;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function AttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [markForm, setMarkForm] = useState<MarkForm>({
   employeeId: null, date: todayStr(), status: "present", checkIn: (() => { const n = new Date(); const h = n.getHours(); const m = String(n.getMinutes()).padStart(2,"0"); return `${String(h%12||12).padStart(2,"0")}:${m} ${h>=12?"PM":"AM"}`; })(), checkOut: "",
  });
  const [markAll, setMarkAll] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("present");
  const [showFaceModal, setShowFaceModal] = useState(false);

  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: attendance, isLoading } = useListAttendance({ month, year });
  const { data: summary } = useGetAttendanceSummary({ month, year });
  const { data: employees } = useListEmployees({});
  const markAttendance = useMarkAttendance();

  const invalidateAttendance = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
    queryClient.invalidateQueries({ queryKey: ["/api/attendance/summary"] });
  };
    const handleCheckout = (record: any) => {
      const now = new Date();
     const hours = now.getHours();
     const minutes = String(now.getMinutes()).padStart(2, "0");
     const ampm = hours >= 12 ? "PM" : "AM";
     const hours12 = hours % 12 || 12;
     const checkOut = `${String(hours12).padStart(2, "0")}:${minutes} ${ampm}`;
      setMarkForm({
        employeeId: record.employeeId,
        date: record.date,
        status: "present",
        checkIn: record.checkIn || "",  // keep existing checkIn!
        checkOut: checkOut,             // set current time as checkout
      });
      setShowMarkModal(true);
    };

  const handleFaceSubmit = (employeeId: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const now = new Date();
     const hours = now.getHours();
     const minutes = String(now.getMinutes()).padStart(2, "0");
     const ampm = hours >= 12 ? "PM" : "AM";
     const hours12 = hours % 12 || 12;
     const checkIn = `${String(hours12).padStart(2, "0")}:${minutes} ${ampm}`;
      markAttendance.mutate(
        { data: { records: [{ employeeId, date: todayStr(), status: "present", checkIn, checkOut: null }] } },
        { onSuccess: () => { invalidateAttendance(); resolve(); }, onError: reject }
      );
    });
  };

  const topPadding = Platform.OS === "web" ? 67 : 0;

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth() + 1)) return;
    setMonth(nm); setYear(ny);
  };

  const totalPresent = summary?.reduce((a: number, b: any) => a + (b.present ?? 0), 0) ?? 0;
  const totalAbsent = summary?.reduce((a: number, b: any) => a + (b.absent ?? 0), 0) ?? 0;
  const totalHalf = summary?.reduce((a: number, b: any) => a + (b.halfDay ?? 0), 0) ?? 0;

  const handleMark = () => {
    if (!markAll && !markForm.employeeId) {
      Alert.alert("Error", "Select an employee.");
      return;
    }
    if (!markForm.date) {
      Alert.alert("Error", "Enter a date.");
      return;
    }

    let records: any[] = [];
    if (markAll) {
      records = (employees ?? []).map((e: any) => ({
        employeeId: e.id,
        date: markForm.date,
        status: bulkStatus,
        checkIn: markForm.checkIn || null,
        checkOut: markForm.checkOut || null,
      }));
    } else {
      records = [{
        employeeId: markForm.employeeId!,
        date: markForm.date,
        status: markForm.status,
        checkIn: markForm.checkIn || null,
        checkOut: markForm.checkOut || null,
      }];
    }

    markAttendance.mutate(
      { data: { records } },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setShowMarkModal(false);
         const n = new Date(); const h = n.getHours(); const m = String(n.getMinutes()).padStart(2,"0");
         setMarkForm({ employeeId: null, date: todayStr(), status: "present", checkIn: `${String(h%12||12).padStart(2,"0")}:${m} ${h>=12?"PM":"AM"}`, checkOut: "" });
          invalidateAttendance();
        },
        onError: () => Alert.alert("Error", "Failed to mark attendance."),
      }
    );
  };

  const selectedEmployee = employees?.find((e: any) => e.id === markForm.employeeId);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Month navigator */}
      <View style={[styles.monthNav, { paddingTop: topPadding + 12, backgroundColor: colors.background }]}>
        <Pressable onPress={prevMonth} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: colors.foreground }]}>
          {MONTH_NAMES[month - 1]} {year}
        </Text>
        <Pressable onPress={nextMonth} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerBtns}>
            <Pressable
              style={[styles.markBtn, { backgroundColor: "#7C3AED" }]}
              onPress={() => router.push("/kiosk")}
            >
              <Ionicons name="tv-outline" size={14} color="#fff" />
              <Text style={styles.markBtnText}>Kiosk</Text>
            </Pressable>
            <Pressable
              style={[styles.scanBtn, { backgroundColor: "#16A34A" }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowFaceModal(true); }}
            >
              <Ionicons name="scan" size={15} color="#fff" />
              <Text style={styles.markBtnText}>Scan</Text>
            </Pressable>
          <Pressable
            style={[styles.markBtn, { backgroundColor: colors.primary }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowMarkModal(true); }}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.markBtnText}>Mark</Text>
          </Pressable>
        </View>
      </View>

      {/* Summary chips */}
      <View style={styles.chips}>
        <SummaryChip label="Present" count={totalPresent} color="#16A34A" bg="#DCFCE7" />
        <SummaryChip label="Absent" count={totalAbsent} color="#DC2626" bg="#FEE2E2" />
        <SummaryChip label="Half Day" count={totalHalf} color="#D97706" bg="#FEF3C7" />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={attendance ?? []}
          keyExtractor={(r) => String(r.id)}
          renderItem={({ item }) => <AttendanceRow record={item} colors={colors} onCheckout={handleCheckout} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100) },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="calendar-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No attendance records</Text>
            </View>
          }
        />
      )}

      {/* Mark Attendance Modal */}
      <Modal visible={showMarkModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowMarkModal(false)}>
        <ScrollView style={[styles.modalRoot, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Mark Attendance</Text>
            <Pressable onPress={() => setShowMarkModal(false)}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Mark All toggle */}
          <Pressable
            style={[styles.markAllRow, { backgroundColor: markAll ? colors.primary + "18" : colors.card, borderColor: markAll ? colors.primary : colors.border }]}
            onPress={() => setMarkAll(v => !v)}
          >
            <Ionicons name={markAll ? "checkbox" : "square-outline"} size={20} color={markAll ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.markAllText, { color: colors.foreground }]}>Mark all employees for this date</Text>
          </Pressable>

          {!markAll && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Employee *</Text>
              <Pressable
                style={[styles.pickerTrigger, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setShowEmpPicker(true)}
              >
                <Text style={[styles.pickerText, { color: selectedEmployee ? colors.foreground : colors.mutedForeground }]}>
                  {selectedEmployee ? selectedEmployee.name : "Select employee..."}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
              </Pressable>
            </>
          )}

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Date * (YYYY-MM-DD)</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.inputInner, { color: colors.foreground }]}
              value={markForm.date}
              onChangeText={(v) => setMarkForm(f => ({ ...f, date: v }))}
              placeholder={todayStr()}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
            />
            <Pressable onPress={() => setMarkForm(f => ({ ...f, date: todayStr() }))}>
              <Text style={[styles.todayText, { color: colors.primary }]}>Today</Text>
            </Pressable>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Status</Text>
          <View style={styles.statusRow}>
            {STATUSES.map((s) => (
              <Pressable
                key={s.value}
                style={[
                  styles.statusBtn,
                  { borderColor: colors.border },
                  (markAll ? bulkStatus : markForm.status) === s.value && { backgroundColor: s.bg, borderColor: s.color },
                ]}
                onPress={() => {
                  if (markAll) setBulkStatus(s.value);
                  else setMarkForm(f => ({ ...f, status: s.value }));
                }}
              >
                <Ionicons name={s.icon as any} size={16} color={(markAll ? bulkStatus : markForm.status) === s.value ? s.color : colors.mutedForeground} />
                <Text style={[styles.statusBtnText, { color: (markAll ? bulkStatus : markForm.status) === s.value ? s.color : colors.foreground }]}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {!markAll && (
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Check In (HH:MM)</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.inputInner, { color: colors.foreground }]}
                    value={markForm.checkIn}
                    onChangeText={(v) => setMarkForm(f => ({ ...f, checkIn: v }))}
                    placeholder="09:00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Check Out (HH:MM)</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.inputInner, { color: colors.foreground }]}
                    value={markForm.checkOut}
                    onChangeText={(v) => setMarkForm(f => ({ ...f, checkOut: v }))}
                    placeholder="18:00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
            </View>
          )}

          <Pressable
            style={[styles.submitBtn, { backgroundColor: colors.primary }]}
            onPress={handleMark}
            disabled={markAttendance.isPending}
          >
            {markAttendance.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>
                {markAll ? `Mark All (${employees?.length ?? 0}) Employees` : "Mark Attendance"}
              </Text>
            )}
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </Modal>

      {/* Face Attendance Modal */}
      <FaceAttendanceModal
        visible={showFaceModal}
        employees={(employees ?? []) as { id: number; name: string; role: string; department?: string | null }[]}
        onClose={() => setShowFaceModal(false)}
        onSuccess={() => {
          setShowFaceModal(false);
          router.replace("/(tabs)/" as never);
        }}
      />

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
                onPress={() => { setMarkForm(f => ({ ...f, employeeId: item.id })); setShowEmpPicker(false); }}
              >
                <View style={[styles.empAvatar, { backgroundColor: colors.primary + "22" }]}>
                  <Text style={[styles.empAvatarText, { color: colors.primary }]}>{item.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.empName, { color: colors.foreground }]}>{item.name}</Text>
                  <Text style={[styles.empRole, { color: colors.mutedForeground }]}>{item.role}</Text>
                </View>
                {markForm.employeeId === item.id && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </Pressable>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  monthNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 12, paddingBottom: 12,
  },
  navBtn: { padding: 2 },
  monthLabel: {  flexWrap: "nowrap", textAlign: "center", fontSize: 15, fontFamily: "Inter_700Bold",  marginHorizontal: 4, },
  headerBtns: { flexDirection: "row", gap: 6 , },
  scanBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7,
  },
  markBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7,
  },
  markBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  chips: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 12 },
  chip: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  chipCount: { fontSize: 22, fontFamily: "Inter_700Bold" },
  chipLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  row: {
    flexDirection: "row", alignItems: "center", borderRadius: 14,
    padding: 12, borderWidth: 1, gap: 12,
  },
  rowAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  rowDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  rowBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  modalRoot: { flex: 1, padding: 20 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  markAllRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 20,
  },
  markAllText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  inputRow: {
    height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
  },
  inputInner: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  todayText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  pickerTrigger: {
    height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
  },
  pickerText: { fontSize: 15, fontFamily: "Inter_400Regular", flex: 1 },
  statusRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statusBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 10, borderWidth: 1, paddingVertical: 10, gap: 6,
  },
  statusBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  timeRow: { flexDirection: "row", gap: 12 },
  submitBtn: { borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginTop: 8 },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  empRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12, borderBottomWidth: 1 },
  empAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  empAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  empName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  empRole: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
