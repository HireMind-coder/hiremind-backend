import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { getDeviceInfo, isMockedLocation } from "@/services/deviceInfo";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useVerifyAttendance, getTodayStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { syncLiveTrackingOnCheckIn, stopLiveTracking } from "@/services/liveTracking";

const COUNTDOWN_MS = 3000;

type VerifyStep =
  | "pick"
  | "camera"
  | "verifying"
  | "success"
  | "failed"
  | "error";

type TodayStatus = {
  hasRecord: boolean;
  checkIn: string | null;
  checkOut: string | null;
  expectedAction: string;
};

interface Employee {
  id: number;
  name: string;
  role: string;
  department?: string | null;
  facePhotoUrl?: string | null;
}

interface Props {
  visible: boolean;
  employees: Employee[];
  onSuccess: () => void;
  onClose: () => void;
}

export function FaceAttendanceModal({ visible, employees, onSuccess, onClose }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<VerifyStep>("pick");
  const selectedRef = useRef<Employee | null>(null);
  const [selectedDisplay, setSelectedDisplay] = useState<Employee | null>(null);

  const [matchScore, setMatchScore] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState(3);

  // Today's status for the selected employee (shown on camera screen)
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Result from verify (for success screen)
  const [verifyResult, setVerifyResult] = useState<{
    action: string;
    checkIn: string | null;
    checkOut: string | null;
    hoursWorked: number | null;
  } | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const timerIds = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const capturedRef = useRef(false);

  const progressAnim = useState(() => new Animated.Value(0))[0];
  const pulseAnim = useState(() => new Animated.Value(1))[0];

  const { mutateAsync: verifyAttendance } = useVerifyAttendance();

  const clearAllTimers = useCallback(() => {
    timerIds.current.forEach(clearTimeout);
    timerIds.current.clear();
  }, []);

  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timerIds.current.delete(id);
      fn();
    }, ms);
    timerIds.current.add(id);
    return id;
  }, []);

  // Reset when modal closes
  useEffect(() => {
    if (!visible) {
      clearAllTimers();
      setStep("pick");
      selectedRef.current = null;
      setSelectedDisplay(null);
      setMatchScore(0);
      setErrorMsg("");
      setSecondsLeft(3);
      setTodayStatus(null);
      setVerifyResult(null);
      capturedRef.current = false;
      progressAnim.setValue(0);
    }
  }, [visible, clearAllTimers]);

  // Pulse animation while verifying
  useEffect(() => {
    if (step === "verifying") {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
    pulseAnim.setValue(1);
  }, [step]);

  /** Fetch today's attendance status for the selected employee */
  const fetchTodayStatus = useCallback(async (emp: Employee) => {
    setStatusLoading(true);
    try {
      const data = await getTodayStatus({ employeeId: emp.id });
      setTodayStatus({
        hasRecord: data.hasRecord,
        checkIn: data.checkIn ?? null,
        checkOut: data.checkOut ?? null,
        expectedAction: data.expectedAction,
      });
    } catch {
      setTodayStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  /** Try to get GPS coordinates (non-blocking, fails gracefully) */
  const getLocation = useCallback(async (): Promise<{ latitude: number; longitude: number; mocked: boolean } | null> => {
    if (Platform.OS === "web") return null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude, mocked: isMockedLocation(loc) };
    } catch {
      return null;
    }
  }, []);

  /** Convert file URI → base64 data-URL via expo-file-system */
  const uriToBase64 = useCallback(async (uri: string): Promise<string | null> => {
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64" as FileSystem.EncodingType,
      });
      return b64 ? `data:image/jpeg;base64,${b64}` : null;
    } catch {
      return null;
    }
  }, []);

  // Employee is always passed directly — never read from stale state closure
 const submitVerification = useCallback(async (emp: Employee, imageBase64: string, coords: { latitude: number; longitude: number; mocked: boolean } | null) => {
    clearAllTimers();
    setStep("verifying");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    console.log("[FaceAttendance] Sending to backend — employeeId:", emp.id);

    try {
      const device = await getDeviceInfo();
      const result = await verifyAttendance({
        data: {
          employeeId: emp.id,
          imageBase64,
          ...(coords ?? { mocked: false }),
          ...device,
        } as any,
      });

      console.log("[FaceAttendance] Match Score:", result.matchScore, "| Action:", result.action);
      setMatchScore(result.matchScore);
      setVerifyResult({
        action: result.action ?? "check_in",
        checkIn: result.checkIn ?? null,
        checkOut: result.checkOut ?? null,
        hoursWorked: result.hoursWorked ?? null,
      });

      if (result.matched) {
        setStep("success");
        // Auto-Live Track: start after punch-in, stop after punch-out
           if (result.action === "check_in") void syncLiveTrackingOnCheckIn(emp.id);
           else if (result.action === "check_out") void stopLiveTracking();
        // Distinct haptics for check-in vs check-out
        if (result.action === "check_out" || result.action === "already_checked_out") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        // Invalidate all relevant caches
        await queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/attendance/summary"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/attendance/today-status"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/dashboard/insights"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/dashboard/attendance-trend"] });
        setTimeout(() => onSuccess(), 3000);
      } else {
        setStep("failed");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (err: any) {
      const msg =
        err?.data?.error ??
        err?.response?.data?.error ??
        err?.message ??
        "Verification error. Please try again.";
      console.log("[FaceAttendance] Error:", msg);
      setErrorMsg(msg);
      setStep("error");
    }
  }, [verifyAttendance, queryClient, onSuccess, clearAllTimers]);

  const startCountdown = useCallback((emp: Employee) => {
    capturedRef.current = false;
    setSecondsLeft(3);
    progressAnim.setValue(0);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: COUNTDOWN_MS,
      useNativeDriver: false,
      easing: Easing.linear,
    }).start();

    safeTimeout(() => setSecondsLeft(2), 1000);
    safeTimeout(() => setSecondsLeft(1), 2000);
    safeTimeout(() => setSecondsLeft(0), 3000);

    safeTimeout(async () => {
      if (capturedRef.current) return;
      if (!cameraRef.current) {
        setErrorMsg("Camera not ready. Please try again.");
        setStep("error");
        return;
      }

      capturedRef.current = true;
      console.log("[FaceAttendance] Auto-capture triggered for emp:", emp.id);

      try {
        // Capture photo and GPS in parallel
        const [pic, coords] = await Promise.all([
          cameraRef.current.takePictureAsync({ quality: 0.7, base64: true }),
          getLocation(),
        ]);

        if (!pic?.uri) throw new Error("Camera returned no picture");

        const imageBase64: string | null = pic.base64
          ? `data:image/jpeg;base64,${pic.base64}`
          : await uriToBase64(pic.uri);

        if (!imageBase64) throw new Error("Could not read image data from camera");

        await submitVerification(emp, imageBase64, coords);
      } catch (e: any) {
        console.log("[FaceAttendance] Capture error:", e?.message ?? e);
        setErrorMsg(e?.message ?? "Could not capture photo. Please try again.");
        setStep("error");
      }
    }, COUNTDOWN_MS);
  }, [progressAnim, safeTimeout, submitVerification, getLocation, uriToBase64]);

  const openCamera = useCallback(async (emp: Employee) => {
    selectedRef.current = emp;
    setSelectedDisplay(emp);

    // Fetch today's status immediately (shown on camera screen)
    fetchTodayStatus(emp);

    if (Platform.OS === "web") {
      const { default: ImagePicker } = await import("expo-image-picker");
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.75,
        base64: true,
      });
      if (!res.canceled && res.assets?.[0]) {
        const asset = res.assets[0];
        const imageBase64: string | null = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri ? await uriToBase64(asset.uri) : null;
        if (imageBase64) await submitVerification(emp, imageBase64, null);
      }
      return;
    }

    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        setErrorMsg("Camera permission is required for face attendance.");
        setStep("error");
        return;
      }
    }

    setStep("camera");
    safeTimeout(() => startCountdown(emp), 900);
  }, [permission, requestPermission, submitVerification, startCountdown, safeTimeout, uriToBase64, fetchTodayStatus]);

  const retryCamera = useCallback(() => {
    clearAllTimers();
    capturedRef.current = false;
    const emp = selectedRef.current;
    if (!emp) { setStep("pick"); return; }
    setStep("camera");
    // Re-fetch status in case it changed
    fetchTodayStatus(emp);
    safeTimeout(() => startCountdown(emp), 900);
  }, [startCountdown, safeTimeout, clearAllTimers, fetchTodayStatus]);

  // ── Helpers for status indicator ────────────────────────────────────────────

  const statusLabel = (): string => {
    if (statusLoading) return "Checking status…";
    if (!todayStatus?.hasRecord) return "Not clocked in today";
    if (todayStatus.checkOut) return `Clocked out at ${todayStatus.checkOut}`;
    return `Working since ${todayStatus.checkIn ?? "—"}`;
  };

  const statusColor = (): string => {
    if (!todayStatus?.hasRecord) return "#94A3B8";
    if (todayStatus.checkOut) return "#FBBF24";
    return "#16A34A";
  };

  const actionLabel = (): string => {
    if (!todayStatus?.hasRecord) return "Check-In";
    if (todayStatus.checkOut) return "Already Checked Out";
    return "Check-Out";
  };

  // ── Success message helpers ──────────────────────────────────────────────────

  const successTitle = (): string => {
    if (verifyResult?.action === "check_out") return "Successfully Checked Out!";
    if (verifyResult?.action === "already_checked_out") return "Already Checked Out";
    return "Successfully Checked In!";
  };

  const successMessage = (): string => {
    if (verifyResult?.action === "check_out") return "Have a great evening! 🌙";
    if (verifyResult?.action === "already_checked_out") return "You were already checked out today.";
    return "Have a productive day! 🌟";
  };

  const successIconName = (): "checkmark-circle" | "exit" | "information-circle" => {
    if (verifyResult?.action === "check_out" || verifyResult?.action === "already_checked_out") return "exit";
    return "checkmark-circle";
  };

  const successIconColor = (): string => {
    if (verifyResult?.action === "check_out") return "#FBBF24";
    if (verifyResult?.action === "already_checked_out") return "#94A3B8";
    return "#16A34A";
  };

  const RING_SIZE = 240;
  const RING_BORDER = 4;

  const ringColor = progressAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["#576DFA", "#FBBF24", "#16A34A"],
  });

  const selected = selectedDisplay;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: "#060B18" }]}>

        {/* ── Step 1: Pick employee ── */}
        {step === "pick" && (
          <View style={[styles.pickContainer, { backgroundColor: colors.background }]}>
            <View style={styles.pickHeader}>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.pickTitle, { color: colors.foreground }]}>Face Attendance</Text>
              <View style={{ width: 40 }} />
            </View>
            <View style={styles.pickIconRow}>
              <View style={[styles.scanIconBg, { backgroundColor: "#576DFA18" }]}>
                <Ionicons name="scan" size={40} color="#576DFA" />
              </View>
              <Text style={[styles.pickSubtitle, { color: colors.mutedForeground }]}>
                Select an employee to clock in or out
              </Text>
            </View>
            <FlatList
              data={employees}
              keyExtractor={(e) => String(e.id)}
              contentContainerStyle={styles.empList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.empCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => openCamera(item)}
                >
                  <View style={[styles.empAvatar, { backgroundColor: colors.primary + "22" }]}>
                    <Text style={[styles.empAvatarText, { color: colors.primary }]}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.empName, { color: colors.foreground }]}>{item.name}</Text>
                    <Text style={[styles.empRole, { color: colors.mutedForeground }]}>
                      {item.role}{item.department ? ` • ${item.department}` : ""}
                    </Text>
                  </View>
                  {item.facePhotoUrl
                    ? <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                    : <Ionicons name="alert-circle-outline" size={16} color="#FBBF24" />}
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            />
          </View>
        )}

        {/* ── Step 2: Camera with status indicator + countdown ── */}
        {step === "camera" && (
          <View style={styles.fullScreen}>
            {/* Top bar */}
            <View style={styles.topBar}>
              <Pressable style={styles.hudBtn} onPress={() => { clearAllTimers(); setStep("pick"); selectedRef.current = null; setSelectedDisplay(null); setTodayStatus(null); }}>
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </Pressable>
              {selected && (
                <View style={styles.empPill}>
                  <Ionicons name="person-circle-outline" size={16} color="#fff" />
                  <Text style={styles.empPillText}>{selected.name}</Text>
                </View>
              )}
              <Pressable style={styles.hudBtn} onPress={() => { clearAllTimers(); onClose(); }}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>

            {/* Status indicator */}
            <View style={styles.statusBar}>
              <View style={[styles.statusDot, { backgroundColor: statusColor() }]} />
              <Text style={styles.statusText}>{statusLabel()}</Text>
              {!statusLoading && (
                <View style={[styles.actionBadge, { backgroundColor: todayStatus?.checkOut ? "#78350F" : todayStatus?.hasRecord ? "#14532D" : "#1E3A5F" }]}>
                  <Text style={styles.actionBadgeText}>{actionLabel()}</Text>
                </View>
              )}
            </View>

            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />

            {/* Animated oval guide */}
            <View style={styles.ovalWrapper}>
              <View style={{ width: RING_SIZE, height: RING_SIZE + 40, position: "relative", alignItems: "center", justifyContent: "center" }}>
                <View style={[styles.ovalBg, { width: RING_SIZE, height: RING_SIZE + 40, borderRadius: RING_SIZE / 2 }]} />
                <Animated.View
                  style={[
                    styles.ovalRing,
                    {
                      width: RING_SIZE,
                      height: RING_SIZE + 40,
                      borderRadius: RING_SIZE / 2,
                      borderWidth: RING_BORDER,
                      borderColor: ringColor,
                    },
                  ]}
                />
                <View style={styles.countdownOverlay}>
                  <Text style={styles.countdownNum}>{secondsLeft}</Text>
                </View>
              </View>
            </View>

            <View style={styles.cameraHintBox}>
              <Text style={styles.cameraHint}>
                Centre your face · capturing in {secondsLeft}s
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 3: Verifying ── */}
        {step === "verifying" && (
          <View style={styles.fullScreen}>
            <View style={styles.centred}>
              <Animated.View style={[styles.matchingCircle, { borderColor: "#FBBF24", transform: [{ scale: pulseAnim }] }]}>
                <ActivityIndicator size="large" color="#FBBF24" />
              </Animated.View>
              <Text style={styles.matchingTitle}>Verifying Identity…</Text>
              <Text style={styles.matchingDesc}>
                Comparing biometric profile against enrolled face
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 4a: Success ── */}
        {step === "success" && verifyResult && (
          <View style={styles.fullScreen}>
            <View style={styles.centred}>
              <View style={[styles.resultCircle, { backgroundColor: successIconColor() + "22" }]}>
                <Ionicons name={successIconName()} size={80} color={successIconColor()} />
              </View>

              <Text style={styles.resultTitle}>{successTitle()}</Text>
              <Text style={[styles.resultName, { color: "rgba(255,255,255,0.65)" }]}>{selected?.name}</Text>
              <Text style={styles.resultSub}>{successMessage()}</Text>

              {/* Time info */}
              <View style={styles.timeRow}>
                {verifyResult.checkIn && (
                  <View style={styles.timePill}>
                    <Ionicons name="log-in-outline" size={13} color="#94A3B8" />
                    <Text style={styles.timePillText}>In {verifyResult.checkIn}</Text>
                  </View>
                )}
                {verifyResult.checkOut && (
                  <View style={styles.timePill}>
                    <Ionicons name="log-out-outline" size={13} color="#94A3B8" />
                    <Text style={styles.timePillText}>Out {verifyResult.checkOut}</Text>
                  </View>
                )}
              </View>

              {/* Hours worked (only on check-out) */}
              {verifyResult.hoursWorked != null && verifyResult.action === "check_out" && (
                <View style={[styles.scorePill, { backgroundColor: "#1E293B" }]}>
                  <Ionicons name="time-outline" size={14} color="#94A3B8" />
                  <Text style={[styles.scoreText, { color: "#94A3B8" }]}>
                    {verifyResult.hoursWorked}h worked today
                  </Text>
                </View>
              )}

              {/* Match score */}
              <View style={[styles.scorePill, { backgroundColor: successIconColor() + "22" }]}>
                <Ionicons name="analytics-outline" size={14} color={successIconColor()} />
                <Text style={[styles.scoreText, { color: successIconColor() }]}>
                  Match Score: {matchScore}%
                </Text>
              </View>

              <Text style={[styles.resultSub, { marginTop: 4, opacity: 0.4 }]}>
                Returning to Dashboard…
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 4b: Failed match ── */}
        {step === "failed" && (
          <View style={styles.fullScreen}>
            <View style={styles.centred}>
              <View style={[styles.resultCircle, { backgroundColor: "#FEF2F2" }]}>
                <Ionicons name="close-circle" size={80} color="#DC2626" />
              </View>
              <Text style={styles.resultTitle}>Verification Failed</Text>
              <View style={[styles.scorePill, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="analytics-outline" size={14} color="#DC2626" />
                <Text style={[styles.scoreText, { color: "#DC2626" }]}>
                  Match Score: {matchScore}%
                </Text>
              </View>
              <Text style={styles.resultSub}>Face does not match the enrolled profile.</Text>
              <View style={styles.failActions}>
                <Pressable style={[styles.failBtn, { backgroundColor: "#576DFA" }]} onPress={retryCamera}>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.failBtnText}>Try Again</Text>
                </Pressable>
                <Pressable style={styles.failBtnGhost} onPress={onClose}>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular", fontSize: 14 }}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* ── Step 4c: Error ── */}
        {step === "error" && (
          <View style={styles.fullScreen}>
            <View style={styles.centred}>
              <View style={[styles.resultCircle, { backgroundColor: "#FEF2F2" }]}>
                <Ionicons name="alert-circle" size={80} color="#DC2626" />
              </View>
              <Text style={styles.resultTitle}>Error</Text>
              <Text style={styles.errorMsgText}>{errorMsg}</Text>
              <View style={styles.failActions}>
                <Pressable style={[styles.failBtn, { backgroundColor: "#576DFA" }]} onPress={retryCamera}>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.failBtnText}>Retry</Text>
                </Pressable>
                <Pressable style={styles.failBtnGhost} onPress={onClose}>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular", fontSize: 14 }}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  pickContainer: { flex: 1 },
  pickHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
  },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  pickTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  pickIconRow: { alignItems: "center", paddingVertical: 16, gap: 8 },
  scanIconBg: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  pickSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  empList: { paddingHorizontal: 16, gap: 10, paddingBottom: 40 },
  empCard: {
    flexDirection: "row", alignItems: "center", borderRadius: 16,
    borderWidth: 1, padding: 16, gap: 14,
  },
  empAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  empAvatarText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  empName: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  empRole: { fontSize: 12, fontFamily: "Inter_400Regular" },

  fullScreen: { flex: 1 },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
  },
  hudBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
  },
  empPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  empPillText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Status bar (below top bar)
  statusBar: {
    position: "absolute", top: 116, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingHorizontal: 20,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_500Medium" },
  actionBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  actionBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },

  ovalWrapper: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 80,
    alignItems: "center", justifyContent: "center",
  },
  ovalBg: { position: "absolute", backgroundColor: "rgba(0,0,0,0.15)" },
  ovalRing: { position: "absolute" },
  countdownOverlay: { position: "absolute", bottom: -48, alignItems: "center" },
  countdownNum: { color: "#fff", fontSize: 48, fontFamily: "Inter_700Bold", opacity: 0.9 },

  cameraHintBox: {
    position: "absolute", bottom: 44, left: 0, right: 0,
    alignItems: "center", paddingHorizontal: 40,
  },
  cameraHint: {
    color: "rgba(255,255,255,0.6)", fontSize: 14,
    fontFamily: "Inter_400Regular", textAlign: "center",
  },

  centred: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  matchingCircle: {
    width: 120, height: 120, borderRadius: 60, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  matchingTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  matchingDesc: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },

  resultCircle: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center" },
  resultTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  resultName: { fontSize: 16, fontFamily: "Inter_500Medium" },

  timeRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "center" },
  timePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
  },
  timePillText: { color: "#94A3B8", fontSize: 13, fontFamily: "Inter_500Medium" },

  scorePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  scoreText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  resultSub: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  failActions: { gap: 12, marginTop: 8, width: "100%", alignItems: "center" },
  failBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14,
    width: "100%", justifyContent: "center",
  },
  failBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  failBtnGhost: { paddingVertical: 10 },
  errorMsgText: {
    color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Inter_400Regular",
    textAlign: "center", lineHeight: 20, maxWidth: 280,
  },
});
