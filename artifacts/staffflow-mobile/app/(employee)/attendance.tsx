import { View, Text, StyleSheet, FlatList, ActivityIndicator, Platform, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useListAttendance, useMarkAttendance } from "@workspace/api-client-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Alert } from "react-native";
import * as Location from "expo-location";



const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${String(hours12).padStart(2, "0")}:${minutes} ${ampm}`;
}

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

export default function EmployeeAttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const empId = (user as any)?.employeeId;
  const { data: attendance, isLoading } = useListAttendance({ month, year });
  const markAttendance = useMarkAttendance();

  const myAttendance = (attendance ?? []).filter((a: any) => a.employeeId === empId);

  const todayStr = now.toISOString().split("T")[0];
  const todayRecord = myAttendance.find((a: any) => a.date === todayStr);

  const presentCount = myAttendance.filter((a: any) => a.status === "present").length;
  const absentCount = myAttendance.filter((a: any) => a.status === "absent").length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
  };

 const handleCheckIn = async () => {
   if (todayRecord?.checkIn) {
     Alert.alert("Already Checked In", `You checked in at ${formatDisplayTime(todayRecord.checkIn)}`);
     return;
   }

   // Request location permission
   const { status } = await Location.requestForegroundPermissionsAsync();
   if (status !== "granted") {
     Alert.alert("Permission Denied", "Location permission is required for attendance.");
     return;
   }

   // Get current location
   const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
   const { latitude, longitude } = location.coords;

   const checkIn = formatTime(new Date());
   markAttendance.mutate(
     { data: { records: [{
       employeeId: empId,
       date: todayStr,
       status: "present",
       checkIn,
       checkOut: null,
       latitude,   // ← add this
       longitude,  // ← add this
     }] } },
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
    if (!todayRecord?.checkIn) {
      Alert.alert("Not Checked In", "Please check in first");
      return;
    }
    if (todayRecord?.checkOut) {
      Alert.alert("Already Checked Out", `You checked out at ${formatDisplayTime(todayRecord.checkOut)}`);
      return;
    }
    const checkOut = formatTime(new Date());
    markAttendance.mutate(
      { data: { records: [{ employeeId: empId, date: todayStr, status: "present", checkIn: todayRecord.checkIn, checkOut }] } },
      {
        onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); invalidate(); },
        onError: () => Alert.alert("Error", "Failed to check out"),
      }
    );
  };

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

  const topPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Month navigator */}
      <View style={[styles.monthNav, { paddingTop: topPadding + 12, backgroundColor: colors.background }]}>
        <Pressable onPress={prevMonth} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: colors.foreground }]}>{MONTH_NAMES[month - 1]} {year}</Text>
        <Pressable onPress={nextMonth} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Summary */}
      <View style={styles.chips}>
        <View style={[styles.chip, { backgroundColor: "#DCFCE7" }]}>
          <Text style={[styles.chipCount, { color: "#16A34A" }]}>{presentCount}</Text>
          <Text style={[styles.chipLabel, { color: "#16A34A" }]}>Present</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: "#FEE2E2" }]}>
          <Text style={[styles.chipCount, { color: "#DC2626" }]}>{absentCount}</Text>
          <Text style={[styles.chipLabel, { color: "#DC2626" }]}>Absent</Text>
        </View>
      </View>

      {/* Check In/Out buttons */}
      <View style={[styles.checkInCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.checkInTitle, { color: colors.foreground }]}>Today's Attendance</Text>
        <View style={styles.checkBtns}>
          <Pressable
            style={[styles.checkBtn, { backgroundColor: todayRecord?.checkIn ? "#DCFCE7" : "#16A34A" }]}
            onPress={handleCheckIn}
            disabled={markAttendance.isPending || !!todayRecord?.checkIn}
          >
            <Ionicons name="log-in-outline" size={20} color={todayRecord?.checkIn ? "#16A34A" : "#fff"} />
            <Text style={[styles.checkBtnText, { color: todayRecord?.checkIn ? "#16A34A" : "#fff" }]}>
              {todayRecord?.checkIn ? `In: ${formatDisplayTime(todayRecord.checkIn)}` : "Check In"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.checkBtn, { backgroundColor: todayRecord?.checkOut ? "#DBEAFE" : "#2563EB" }]}
            onPress={handleCheckOut}
            disabled={markAttendance.isPending || !!todayRecord?.checkOut || !todayRecord?.checkIn}
          >
            <Ionicons name="log-out-outline" size={20} color={todayRecord?.checkOut ? "#2563EB" : "#fff"} />
            <Text style={[styles.checkBtnText, { color: todayRecord?.checkOut ? "#2563EB" : "#fff" }]}>
              {todayRecord?.checkOut ? `Out: ${formatDisplayTime(todayRecord.checkOut)}` : "Check Out"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Attendance list */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={myAttendance}
          keyExtractor={(r) => String(r.id)}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.rowInfo}>
                <Text style={[styles.rowDate, { color: colors.foreground }]}>
                  {new Date(item.date).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" })}
                </Text>
                <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>
                  {item.checkIn ? `In: ${formatDisplayTime(item.checkIn)}` : ""}
                  {item.checkOut ? `  •  Out: ${formatDisplayTime(item.checkOut)}` : ""}
                </Text>
                {item.latitude && item.longitude && (
                  <Pressable onPress={() => {
                    const url = `https://www.google.com/maps?q=${item.latitude},${item.longitude}`;
                    Linking.openURL(url);
                  }}>
                    <Text style={{ color: "#2563EB", fontSize: 11, fontFamily: "Inter_500Medium" }}>
                      📍 View on Maps
                    </Text>
                  </Pressable>
                )}
              </View>
              <View style={[styles.rowBadge, { backgroundColor: item.status === "present" ? "#DCFCE7" : "#FEE2E2" }]}>
                <Text style={{ color: item.status === "present" ? "#16A34A" : "#DC2626", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {item.status === "present" ? "Present" : item.status === "absent" ? "Absent" : "Half Day"}
                </Text>
              </View>
            </View>
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="calendar-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No attendance records</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12 },
  navBtn: { padding: 6 },
  monthLabel: { fontSize: 17, fontFamily: "Inter_700Bold" },
  chips: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 12 },
  chip: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  chipCount: { fontSize: 22, fontFamily: "Inter_700Bold" },
  chipLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  checkInCard: { marginHorizontal: 16, marginBottom: 16, borderRadius: 16, padding: 16, borderWidth: 1 },
  checkInTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  checkBtns: { flexDirection: "row", gap: 12 },
  checkBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12 },
  checkBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14, borderWidth: 1, gap: 12 },
  rowInfo: { flex: 1 },
  rowDate: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  rowTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
