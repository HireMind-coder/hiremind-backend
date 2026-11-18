import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Switch, TextInput, Alert, ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAttendanceSettings, errMsg } from "@/hooks/useAttendanceSettings";

const RADIUS_PRESETS = [50, 100, 200, 500];

export default function GeofenceSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, isLoading, update } = useAttendanceSettings();

  const [enabled, setEnabled] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("100");
  const [locating, setLocating] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Fill the form once, when the saved settings arrive
  useEffect(() => {
    if (settings && !loaded) {
      setEnabled(settings.geofenceEnabled);
      setLat(settings.geofenceLat != null ? String(settings.geofenceLat) : "");
      setLng(settings.geofenceLng != null ? String(settings.geofenceLng) : "");
      setRadius(String(settings.geofenceRadius));
      setLoaded(true);
    }
  }, [settings, loaded]);

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow location access to use your current position.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if ((loc as any).mocked === true) {
        Alert.alert("Fake GPS detected", "Turn off mock location and try again.");
        return;
      }
      setLat(loc.coords.latitude.toFixed(6));
      setLng(loc.coords.longitude.toFixed(6));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Could not get location", e?.message ?? "Please turn on GPS and try again.");
    } finally {
      setLocating(false);
    }
  };

  const handleSave = () => {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const radiusNum = Math.round(Number(radius));
    const hasLocation = lat.trim() !== "" && lng.trim() !== "" && Number.isFinite(latNum) && Number.isFinite(lngNum);

    if (enabled && !hasLocation) {
      Alert.alert("Office location needed", "Tap “Use my current location” while standing at your office.");
      return;
    }
    if (!Number.isFinite(radiusNum) || radiusNum < 20 || radiusNum > 5000) {
      Alert.alert("Invalid radius", "Radius must be between 20 and 5000 metres.");
      return;
    }

    update.mutate(
      {
        geofenceEnabled: enabled,
        geofenceRadius: radiusNum,
        ...(hasLocation ? { geofenceLat: latNum, geofenceLng: lngNum } : {}),
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
        onError: (e) => Alert.alert("Could not save", errMsg(e)),
      },
    );
  };

  if (isLoading || !loaded) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const inputStyle = [styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Enable Geofence</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Employees can mark attendance only inside the office radius.
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={(v) => { Haptics.selectionAsync(); setEnabled(v); }}
          trackColor={{ false: colors.border, true: colors.primary + "88" }}
          thumbColor={enabled ? colors.primary : "#f4f3f4"}
        />
      </View>

      <Text style={[styles.header, { color: colors.mutedForeground }]}>OFFICE LOCATION</Text>
      <Pressable
        onPress={useCurrentLocation}
        disabled={locating}
        style={({ pressed }) => [
          styles.locBtn,
          { borderColor: colors.primary, backgroundColor: colors.accent },
          pressed && { opacity: 0.7 },
        ]}
      >
        {locating ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Ionicons name="locate" size={18} color={colors.primary} />
            <Text style={[styles.locBtnText, { color: colors.primary }]}>Use my current location</Text>
          </>
        )}
      </Pressable>

      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Latitude</Text>
          <TextInput
            value={lat}
            onChangeText={setLat}
            keyboardType="numbers-and-punctuation"
            placeholder="28.613900"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Longitude</Text>
          <TextInput
            value={lng}
            onChangeText={setLng}
            keyboardType="numbers-and-punctuation"
            placeholder="77.209000"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </View>
      </View>

      <Text style={[styles.header, { color: colors.mutedForeground, marginTop: 20 }]}>ALLOWED RADIUS (METRES)</Text>
      <View style={styles.chips}>
        {RADIUS_PRESETS.map((r) => {
          const active = radius === String(r);
          return (
            <Pressable
              key={r}
              onPress={() => setRadius(String(r))}
              style={[
                styles.chip,
                { borderColor: colors.border },
                active && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? "#fff" : colors.foreground }]}>{r} m</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={radius}
        onChangeText={(t) => setRadius(t.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        placeholder="Custom radius"
        placeholderTextColor={colors.mutedForeground}
        style={inputStyle}
      />
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        GPS can be off by 10–30 m indoors, so 100 m or more works best.
      </Text>

      <Pressable
        onPress={handleSave}
        disabled={update.isPending}
        style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
      >
        {update.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderWidth: 1, borderRadius: 14, marginBottom: 24 },
  title: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  header: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 8, paddingHorizontal: 4 },
  locBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderRadius: 12, paddingVertical: 13, marginBottom: 14,
  },
  locBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  twoCol: { flexDirection: "row", gap: 10 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, fontFamily: "Inter_500Medium" },
  chips: { flexDirection: "row", gap: 8, marginBottom: 12 },
  chip: { flex: 1, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderRadius: 10 },
  chipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8, paddingHorizontal: 4 },
  saveBtn: { marginTop: 28, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});