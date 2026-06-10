import { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Platform, Alert, Dimensions, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useListAttendance, useMarkAttendance } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const SCREEN_WIDTH = Dimensions.get("window").width;

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const CAL_PADDING = 12;
const CAL_GAP = 3;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 32 - CAL_PADDING * 2 - CAL_GAP * 6) / 7);

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  present:    { color: "#FFFFFF", bg: "#16A34A", border: "#16A34A" },
  absent:     { color: "#FFFFFF", bg: "#DC2626", border: "#DC2626" },
  half_day:   { color: "#FFFFFF", bg: "#D97706", border: "#D97706" },
  paid_leave: { color: "#FFFFFF", bg: "#7C3AED", border: "#7C3AED" },
  week_off:   { color: "#FFFFFF", bg: "#6B7280", border: "#6B7280" },
  future:     { color: "#9CA3AF", bg: "#F3F4F6", border: "#E5E7EB" },
  none:       { color: "#9CA3AF", bg: "#E5E7EB", border: "#E5E7EB" },
};

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${minutes} ${ampm}`;
}

function formatDisplayTime(t: string | null | undefined): string {
  if (!t) return "—";
  if (t.includes("AM") || t.includes("PM")) return t;
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${m?.slice(0, 2) ?? "00"} ${ampm}`;
}

function getDateStatus(dateStr: string, records: any[], dayOfWeek: number) {
  const rec = records.find((r) => r.date?.startsWith(dateStr));
  if (rec) {
    const isLate = rec.checkIn && rec.checkIn > "09:30:00";
    return { status: rec.status, isLate, record: rec };
  }
  if (dayOfWeek === 0 || dayOfWeek === 6) return { status: "week_off", isLate: false, record: null };
  return { status: "none", isLate: false, record: null };
}

// ─── Calendar Cell (tappable, read-only status) ───────────────────────────────
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
  cell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 7, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  dayNum: { fontSize: 12, fontFamily: "Inter_700Bold" },
  late: { fontSize: 6, fontFamily: "Inter_700Bold", color: "#fff", marginTop: 1 },
});

// ─── Summary Strip ────────────────────────────────────────────────────────────
function SummaryStrip({ records, month, year }: { records: any[]; month: number; year: number }) {
  const monthStr  = `${year}-${String(month).padStart(2, "0")}`;
  const filtered  = records.filter((r) => r.date?.startsWith(monthStr));
  const present   = filtered.filter((r) => r.status === "present").length;
  const absent    = filtered.filter((r) => r.status === "absent").length;
  const halfDay   = filtered.filter((r) => r.status === "half_day").length;
  const paidLeave = filtered.filter((r) => r.status === "paid_leave").length;

  const items = [
    { label: "Present",    value: present,   color: "#16A34A", bg: "#DCFCE7" },
    { label: "Absent",     value: absent,    color: "#DC2626", bg: "#FEE2E2" },
    { label: "Half day",   value: halfDay,   color: "#D97706", bg: "#FEF3C7" },
    { label: "Paid Leave", value: paidLeave, color: "#7C3AED", bg: "#EDE9FE" },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
      {items.map((item) => (
        <View key={item.label} style={[sumSt.chip, { backgroundColor: item.bg, borderColor: item.color }]}>
          <Text style={[sumSt.label, { color: item.color }]}>{item.label}</Text>
          <Text style={[sumSt.value, { color: item.color }]}>{item.value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const sumSt = StyleSheet.create({
  chip: { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 10, minWidth: 90, alignItems: "center" },
  label: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
  value: { fontSize: 24, fontFamily: "Inter_700Bold" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function EmployeeAttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const markAttendance = useMarkAttendance();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  // ── Date popup state ──
  const [datePopup, setDatePopup] = useState<{ visible: boolean; dateStr: string; record: any }>({
    visible: false, dateStr: "", record: null,
  });

  const empId   = (user as any)?.employeeId;
  const empName = (user as any)?.name ?? "Employee";

  const { data: attendance, isLoading } = useListAttendance({ month, year });
  const records = useMemo(
    () => (attendance ?? []).filter((a: any) => a.employeeId === empId),
    [attendance, empId]
  );

  const todayStr    = now.toISOString().split("T")[0];
  const todayRecord = records.find((a: any) => a.date === todayStr);

  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const lastDay        = new Date(year, month, 0).getDate();
  const rows           = Math.ceil((firstDayOfWeek + lastDay) / 7);

  const goMonth = (dir: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let m = month + dir, y = year;
    if (m < 1)  { m = 12; y--; }
    if (m > 12) { m = 1;  y++; }
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) return;
    setMonth(m); setYear(y);
  };

  // ── Open date popup ──
  const openDatePopup = (dateStr: string) => {
    const record = records.find((r: any) => r.date?.startsWith(dateStr)) ?? null;
    setDatePopup({ visible: true, dateStr, record });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });

  const handleCheckIn = async () => {
    if (todayRecord?.checkIn) {
      Alert.alert("Already Checked In", `You checked in at ${formatDisplayTime(todayRecord.checkIn)}`);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Location permission is required for attendance.");
      return;
    }
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude } = location.coords;
    const checkIn = formatTime(new Date());
    markAttendance.mutate(
      { data: { records: [{ employeeId: empId, date: todayStr, status: "present", checkIn, checkOut: null, latitude, longitude }] } },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          invalidate();
          Alert.alert("✅ Checked In", `Time: ${checkIn}\n📍 Location saved`);
        },
        onError: () => Alert.alert("Error", "Failed to check in"),
      }
    );
  };

  const handleCheckOut = () => {
    if (!todayRecord?.checkIn) { Alert.alert("Not Checked In", "Please check in first"); return; }
    if (todayRecord?.checkOut) { Alert.alert("Already Checked Out", `You checked out at ${formatDisplayTime(todayRecord.checkOut)}`); return; }
    const checkOut = formatTime(new Date());
    markAttendance.mutate(
      { data: { records: [{ employeeId: empId, date: todayStr, status: "present", checkIn: todayRecord.checkIn, checkOut }] } },
      {
        onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); invalidate(); },
        onError: () => Alert.alert("Error", "Failed to check out"),
      }
    );
  };

  const handleDownloadReport = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const monthStr  = `${year}-${String(month).padStart(2, "0")}`;
      const filtered  = records.filter((r: any) => r.date?.startsWith(monthStr));
      const present   = filtered.filter((r: any) => r.status === "present").length;
      const absent    = filtered.filter((r: any) => r.status === "absent").length;
      const halfDay   = filtered.filter((r: any) => r.status === "half_day").length;
      const paidLeave = filtered.filter((r: any) => r.status === "paid_leave").length;

      const tableRows = filtered
        .sort((a: any, b: any) => a.date.localeCompare(b.date))
        .map((r: any) => `
          <tr>
            <td>${new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
            <td style="color:${r.status === "present" ? "#16A34A" : r.status === "absent" ? "#DC2626" : r.status === "half_day" ? "#D97706" : "#7C3AED"}; font-weight:bold; text-transform:capitalize;">
              ${r.status.replace("_", " ")}
            </td>
            <td>${formatDisplayTime(r.checkIn)}</td>
            <td>${formatDisplayTime(r.checkOut)}</td>
          </tr>
        `).join("");

      const html = `
        <html><head><meta charset="utf-8"/>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          p  { color: #666; margin: 0 0 20px; }
          .summary { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
          .chip { padding: 10px 16px; border-radius: 8px; min-width: 80px; text-align: center; }
          .chip span { display: block; font-size: 11px; margin-bottom: 4px; }
          .chip strong { font-size: 22px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-size: 13px; }
          td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        </style></head>
        <body>
          <h1>${empName} — Attendance Report</h1>
          <p>${MONTH_NAMES[month - 1]} ${year}</p>
          <div class="summary">
            <div class="chip" style="background:#DCFCE7;color:#16A34A"><span>Present</span><strong>${present}</strong></div>
            <div class="chip" style="background:#FEE2E2;color:#DC2626"><span>Absent</span><strong>${absent}</strong></div>
            <div class="chip" style="background:#FEF3C7;color:#D97706"><span>Half Day</span><strong>${halfDay}</strong></div>
            <div class="chip" style="background:#EDE9FE;color:#7C3AED"><span>Paid Leave</span><strong>${paidLeave}</strong></div>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Status</th><th>Check In</th><th>Check Out</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </body></html>
      `;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `${empName} Attendance - ${MONTH_NAMES[month - 1]} ${year}`, UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("Saved", `Report saved to:\n${uri}`);
      }
    } catch {
      Alert.alert("Error", "Could not generate report.");
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* ── Month Picker bar ── */}
        <View style={[st.monthBarOuter, { backgroundColor: "#FFFDE7", marginTop: topPadding + 8 }]}>
          <View style={st.monthBarLeft}>
            <Ionicons name="information-circle-outline" size={18} color="#B45309" />
            <Text style={[st.monthBarLabel, { color: "#B45309" }]}>Attendance For</Text>
          </View>
          <View style={[st.monthPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={[st.monthPillText, { color: colors.foreground }]}>{MONTH_NAMES[month - 1]} {year}</Text>
            <Pressable onPress={() => goMonth(-1)} hitSlop={8}>
              <Ionicons name="chevron-back" size={16} color={colors.mutedForeground} />
            </Pressable>
            <Pressable onPress={() => goMonth(1)} hitSlop={8}>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {/* ── Summary Strip ── */}
        {isLoading
          ? <View style={{ paddingVertical: 16, alignItems: "center", marginTop: 12 }}><ActivityIndicator color={colors.primary} /></View>
          : <View style={{ marginTop: 12 }}><SummaryStrip records={records} month={month} year={year} /></View>}

        {/* ── Calendar ── */}
        <View style={[st.calBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={st.calHeader}>
            <Pressable onPress={() => goMonth(-1)} hitSlop={10}>
              <Ionicons name="chevron-back" size={20} color={colors.foreground} />
            </Pressable>
            <Text style={[st.calTitle, { color: colors.foreground }]}>{MONTH_NAMES[month - 1]} {year}</Text>
            <Pressable onPress={() => goMonth(1)} hitSlop={10}>
              <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={st.calDayRow}>
            {DAY_NAMES.map((d) => (
              <Text key={d} style={[st.calDayName, { color: colors.mutedForeground, width: CELL_SIZE }]}>{d}</Text>
            ))}
          </View>

          {Array.from({ length: rows }).map((_, rowIdx) => (
            <View key={rowIdx} style={[st.calRow, { gap: CAL_GAP }]}>
              {Array.from({ length: 7 }).map((_, colIdx) => {
                const cellIdx = rowIdx * 7 + colIdx;
                const dayNum  = cellIdx - firstDayOfWeek + 1;
                if (dayNum < 1 || dayNum > lastDay) {
                  return <View key={colIdx} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
                }
                const dateStr  = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                const cellDate = new Date(dateStr);
                const isFuture = cellDate > now;
                const isToday  = cellDate.toDateString() === now.toDateString();
                const dow      = new Date(year, month - 1, dayNum).getDay();
                const { status, isLate } = getDateStatus(dateStr, records, dow);
                return (
                  <CalendarCell
                    key={colIdx}
                    day={dayNum}
                    statusKey={status}
                    isLate={isLate}
                    isFuture={isFuture}
                    isToday={isToday}
                    onPress={() => openDatePopup(dateStr)}
                  />
                );
              })}
            </View>
          ))}
        </View>

        {/* ── Legend ── */}
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

        {/* ── Today's Check In/Out ── */}
        <View style={[st.checkCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.checkTitle, { color: colors.foreground }]}>Today's Attendance</Text>
          <View style={st.checkBtns}>
            <Pressable
              style={[st.checkBtn, { backgroundColor: todayRecord?.checkIn ? "#DCFCE7" : "#16A34A" }]}
              onPress={handleCheckIn}
              disabled={markAttendance.isPending || !!todayRecord?.checkIn}
            >
              <Ionicons name="log-in-outline" size={20} color={todayRecord?.checkIn ? "#16A34A" : "#fff"} />
              <Text style={[st.checkBtnText, { color: todayRecord?.checkIn ? "#16A34A" : "#fff" }]}>
                {todayRecord?.checkIn ? `In: ${formatDisplayTime(todayRecord.checkIn)}` : "Check In"}
              </Text>
            </Pressable>
            <Pressable
              style={[st.checkBtn, { backgroundColor: todayRecord?.checkOut ? "#DBEAFE" : "#2563EB", opacity: !todayRecord?.checkIn ? 0.5 : 1 }]}
              onPress={handleCheckOut}
              disabled={markAttendance.isPending || !!todayRecord?.checkOut || !todayRecord?.checkIn}
            >
              <Ionicons name="log-out-outline" size={20} color={todayRecord?.checkOut ? "#2563EB" : "#fff"} />
              <Text style={[st.checkBtnText, { color: todayRecord?.checkOut ? "#2563EB" : "#fff" }]}>
                {todayRecord?.checkOut ? `Out: ${formatDisplayTime(todayRecord.checkOut)}` : "Check Out"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Download Report ── */}
        <Pressable style={[st.downloadBtn, { borderColor: colors.primary }]} onPress={handleDownloadReport}>
          <Ionicons name="download-outline" size={18} color={colors.primary} />
          <Text style={[st.downloadText, { color: colors.primary }]}>Download Report</Text>
        </Pressable>

      </ScrollView>

      {/* ── Date Popup (read-only check-in/out) ── */}
      <Modal
        visible={datePopup.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setDatePopup((p) => ({ ...p, visible: false }))}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
          onPress={() => setDatePopup((p) => ({ ...p, visible: false }))}
        >
          <Pressable style={[st.popup, { backgroundColor: colors.card }]}>
            {/* Header */}
            <View style={st.popupHeader}>
              <Text style={[st.popupTitle, { color: colors.foreground }]}>
                {datePopup.dateStr
                  ? new Date(datePopup.dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                  : ""}
              </Text>
              <Pressable onPress={() => setDatePopup((p) => ({ ...p, visible: false }))} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Check In / Check Out */}
            <View style={[st.timeRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={st.timeCell}>
                <Ionicons name="log-in-outline" size={18} color="#16A34A" />
                <Text style={[st.timeLabel, { color: colors.mutedForeground }]}>Check In</Text>
                <Text style={[st.timeValue, { color: colors.foreground }]}>
                  {formatDisplayTime(datePopup.record?.checkIn)}
                </Text>
              </View>
              <View style={[st.timeDivider, { backgroundColor: colors.border }]} />
              <View style={st.timeCell}>
                <Ionicons name="log-out-outline" size={18} color="#DC2626" />
                <Text style={[st.timeLabel, { color: colors.mutedForeground }]}>Check Out</Text>
                <Text style={[st.timeValue, { color: colors.foreground }]}>
                  {formatDisplayTime(datePopup.record?.checkOut)}
                </Text>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },

  monthBarOuter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  monthBarLeft:  { flexDirection: "row", alignItems: "center", gap: 6 },
  monthBarLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  monthPill:     { flexDirection: "row", alignItems: "center", borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  monthPillText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  calBox:    { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, padding: CAL_PADDING, marginBottom: 8, marginTop: 4 },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calTitle:  { fontSize: 15, fontFamily: "Inter_700Bold" },
  calDayRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  calDayName:{ textAlign: "center", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  calRow:    { flexDirection: "row", justifyContent: "space-between", marginBottom: CAL_GAP },

  legendRow:  { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 10, marginTop: 8, marginBottom: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  checkCard:    { marginHorizontal: 16, marginBottom: 16, borderRadius: 16, padding: 16, borderWidth: 1 },
  checkTitle:   { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  checkBtns:    { flexDirection: "row", gap: 12 },
  checkBtn:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12 },
  checkBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  downloadBtn:  { marginHorizontal: 16, borderWidth: 1.5, borderRadius: 12, height: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 },
  downloadText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // ── Date popup ──
  popup:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  popupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  popupTitle:  { fontSize: 17, fontFamily: "Inter_700Bold" },
  timeRow:     { flexDirection: "row", borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  timeCell:    { flex: 1, alignItems: "center", paddingVertical: 16, gap: 6 },
  timeDivider: { width: 1 },
  timeLabel:   { fontSize: 11, fontFamily: "Inter_500Medium" },
  timeValue:   { fontSize: 16, fontFamily: "Inter_700Bold" },
});