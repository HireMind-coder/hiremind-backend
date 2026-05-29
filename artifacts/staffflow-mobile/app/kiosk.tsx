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
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useVerifyAttendance, useListEmployees } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Speech from "expo-speech";

const SCAN_INTERVAL_MS = 5000;
const RESULT_DISPLAY_MS = 4000;

type KioskStep = "scanning" | "verifying" | "success" | "failed" | "error" | "paused";

export default function KioskScreen() {
  const queryClient = useQueryClient();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<KioskStep>("paused");
  const [resultName, setResultName] = useState("");
  const [resultAction, setResultAction] = useState("");
  const [resultTime, setResultTime] = useState("");
  const [resultScore, setResultScore] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutateAsync: verifyAttendance } = useVerifyAttendance();
  const { data: employees } = useListEmployees({});

  useEffect(() => {
    if (step === "scanning") {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      anim.start();
      const lineAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: true, easing: Easing.linear }),
          Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: true, easing: Easing.linear }),
        ])
      );
      lineAnim.start();
      return () => { anim.stop(); lineAnim.stop(); };
    }
  }, [step]);

  const getLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch { return null; }
  }, []);

  const uriToBase64 = useCallback(async (uri: string): Promise<string | null> => {
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" as any });
      return b64 ? `data:image/jpeg;base64,${b64}` : null;
    } catch { return null; }
  }, []);

  const captureAndVerify = useCallback(async () => {
    if (isCapturing || !cameraRef.current || step !== "scanning") return;
    setIsCapturing(true);
    setScanCount(c => c + 1);

    try {
      const [pic, coords] = await Promise.all([
        cameraRef.current.takePictureAsync({ quality: 0.6, base64: true }),
        getLocation(),
      ]);

      if (!pic?.uri) { setIsCapturing(false); return; }

      const imageBase64 = pic.base64
        ? `data:image/jpeg;base64,${pic.base64}`
        : await uriToBase64(pic.uri);

      if (!imageBase64) { setIsCapturing(false); return; }

      const enrolledEmployees = (employees ?? []).filter((e: any) => e.facePhotoUrl);
      if (enrolledEmployees.length === 0) { setIsCapturing(false); return; }

      setStep("verifying");

      for (const emp of enrolledEmployees) {
        try {
          const result = await verifyAttendance({
            data: { employeeId: emp.id, imageBase64, ...(coords ?? {}) },
          });

          if (result.matched) {
            setResultName(emp.name);
            setResultAction(
              result.action === "check_out" ? "Checked Out 👋" :
              result.action === "already_checked_out" ? "Already Checked Out" :
              "Checked In ✅"
            );
            setResultTime(
              result.action === "check_out" ? `Out: ${result.checkOut}` : `In: ${result.checkIn}`
            );
            setResultScore(result.matchScore);
            setStep("success");
            // Speak thank you message
            const action = result.action === "check_out" ? "checked out" : "checked in";
            Speech.speak(`Thank you ${emp.name}, you have ${action} successfully`, {
              language: "en-IN",
              pitch: 1.0,
              rate: 0.9,
            });
            Haptics.notificationAsync(
              result.action === "check_out"
                ? Haptics.NotificationFeedbackType.Warning
                : Haptics.NotificationFeedbackType.Success
            );

            await queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/attendance/summary"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });

            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
              setStep("scanning");
              setIsCapturing(false);
            }, RESULT_DISPLAY_MS);
            return;
          }
        } catch { /* continue */ }
      }

      setStep("scanning");
      setIsCapturing(false);
    } catch {
      setStep("scanning");
      setIsCapturing(false);
    }
  }, [isCapturing, step, employees, verifyAttendance, queryClient, getLocation, uriToBase64]);

  useEffect(() => {
    if (step === "scanning") {
      intervalRef.current = setInterval(captureAndVerify, SCAN_INTERVAL_MS);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [step, captureAndVerify]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const startKiosk = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) { setErrorMsg("Camera permission required."); setStep("error"); return; }
    }
    setStep("scanning");
  };

  const stopKiosk = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStep("paused");
    setIsCapturing(false);
  };

  const enrolledCount = (employees ?? []).filter((e: any) => e.facePhotoUrl).length;

  const scanLineY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 300],
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {(step !== "paused" && step !== "error") && (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
      )}

      <View style={styles.overlay} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => { stopKiosk(); router.back(); }}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.topCenter}>
          <View style={[styles.dot, { backgroundColor: step === "scanning" ? "#16A34A" : step === "verifying" ? "#FBBF24" : "#94A3B8" }]} />
          <Text style={styles.topTitle}>
            {step === "scanning" ? "Kiosk — Active" :
             step === "verifying" ? "Identifying..." :
             step === "success" ? "Attendance Marked!" :
             step === "paused" ? "Kiosk — Paused" : "Kiosk Mode"}
          </Text>
        </View>
        <View style={styles.scanCountBadge}>
          <Text style={styles.scanCountText}>{scanCount} scans</Text>
        </View>
      </View>

      {/* Paused */}
      {step === "paused" && (
        <View style={styles.centred}>
          <View style={styles.pausedIcon}>
            <Ionicons name="scan" size={64} color="#576DFA" />
          </View>
          <Text style={styles.pausedTitle}>Kiosk Mode</Text>
          <Text style={styles.pausedDesc}>
            Place this device at your office entrance.{"\n"}
            Employees will be automatically detected and their attendance will be marked.
          </Text>
          <View style={styles.infoRow}>
            <Ionicons name="people-outline" size={16} color="#94A3B8" />
            <Text style={styles.infoText}>{enrolledCount} employees enrolled</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color="#94A3B8" />
            <Text style={styles.infoText}>Scans every 5 seconds</Text>
          </View>
          {enrolledCount === 0 && (
            <View style={styles.warningBox}>
              <Ionicons name="warning-outline" size={16} color="#F59E0B" />
              <Text style={styles.warningText}>No employees enrolled! Go to Team → tap Scan icon to enroll faces first.</Text>
            </View>
          )}
          <Pressable
            style={[styles.startBtn, enrolledCount === 0 && styles.startBtnDisabled]}
            onPress={startKiosk}
            disabled={enrolledCount === 0}
          >
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.startBtnText}>Start Kiosk Mode</Text>
          </Pressable>
        </View>
      )}

      {/* Scanning */}
      {step === "scanning" && (
        <View style={styles.centred}>
          <Animated.View style={[styles.faceFrame, { transform: [{ scale: pulseAnim }] }]}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineY }] }]} />
          </Animated.View>
          <Text style={styles.scanningText}>Stand in front of camera</Text>
          <Text style={styles.scanningSubText}>Scanning automatically every 5 seconds</Text>
          <Pressable style={styles.stopBtn} onPress={stopKiosk}>
            <Ionicons name="pause" size={18} color="#fff" />
            <Text style={styles.stopBtnText}>Pause Kiosk</Text>
          </Pressable>
        </View>
      )}

      {/* Verifying */}
      {step === "verifying" && (
        <View style={styles.centred}>
          <View style={styles.verifyCircle}>
            <ActivityIndicator size="large" color="#FBBF24" />
          </View>
          <Text style={styles.verifyText}>Identifying face...</Text>
          <Text style={styles.verifySubText}>Please hold still</Text>
        </View>
      )}

      {/* Success */}
      {step === "success" && (
        <View style={styles.centred}>
          <View style={[styles.resultCircle, {
            backgroundColor: resultAction.includes("Out") ? "rgba(120,53,15,0.4)" : "rgba(20,83,45,0.4)"
          }]}>
            <Ionicons
              name={resultAction.includes("Out") ? "log-out" : "log-in"}
              size={70}
              color={resultAction.includes("Out") ? "#FBBF24" : "#16A34A"}
            />
          </View>
          <Text style={styles.resultName}>{resultName}</Text>
          <Text style={[styles.resultAction, {
            color: resultAction.includes("Out") ? "#FBBF24" : "#16A34A"
          }]}>{resultAction}</Text>
          <Text style={styles.resultTime}>{resultTime}</Text>
          <View style={styles.scoreBadge}>
            <Ionicons name="analytics-outline" size={12} color="#94A3B8" />
            <Text style={styles.scoreText}>Match: {resultScore}%</Text>
          </View>
          <Text style={styles.nextText}>Next person please... 👋</Text>
        </View>
      )}

      {/* Error */}
      {step === "error" && (
        <View style={styles.centred}>
          <Ionicons name="alert-circle" size={64} color="#DC2626" />
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Pressable style={styles.startBtn} onPress={() => setStep("paused")}>
            <Text style={styles.startBtnText}>Go Back</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "android" ? 44 : 56,
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  topTitle: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  scanCountBadge: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  scanCountText: { color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium" },
  centred: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32, paddingTop: 80 },
  pausedIcon: { width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(87,109,250,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  pausedTitle: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  pausedDesc: { color: "rgba(255,255,255,0.55)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoText: { color: "#94A3B8", fontSize: 13, fontFamily: "Inter_400Regular" },
  warningBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(245,158,11,0.15)", borderRadius: 12, padding: 14, width: "100%" },
  warningText: { color: "#F59E0B", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  startBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#576DFA", borderRadius: 14, paddingHorizontal: 36, paddingVertical: 16, marginTop: 8 },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  faceFrame: { width: 260, height: 320, position: "relative", overflow: "hidden" },
  corner: { position: "absolute", width: 28, height: 28, borderColor: "#576DFA", borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 4 },
  scanLine: { position: "absolute", left: 0, right: 0, height: 2, backgroundColor: "rgba(87,109,250,0.9)" },
  scanningText: { color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  scanningSubText: { color: "rgba(255,255,255,0.45)", fontSize: 13, fontFamily: "Inter_400Regular" },
  stopBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, marginTop: 20 },
  stopBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  verifyCircle: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: "#FBBF24", alignItems: "center", justifyContent: "center" },
  verifyText: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  verifySubText: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "Inter_400Regular" },
  resultCircle: { width: 130, height: 130, borderRadius: 65, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  resultName: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold", textAlign: "center" },
  resultAction: { fontSize: 20, fontFamily: "Inter_700Bold" },
  resultTime: { color: "rgba(255,255,255,0.55)", fontSize: 16, fontFamily: "Inter_500Medium" },
  scoreBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  scoreText: { color: "#94A3B8", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  nextText: { color: "rgba(255,255,255,0.35)", fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 8 },
  errorText: { color: "#EF4444", fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
});