import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Modal, FlatList, ActivityIndicator,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useBillingCatalog } from "@/hooks/useBilling";

type Branch = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  radius: number;
};

const RADIUS_PRESETS = [50, 100, 200, 500];

export default function AddBranchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : null;

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("100");
  const [locating, setLocating] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [loaded, setLoaded] = useState(!editId);

  // The list of Indian states (same list the server accepts)
  const { data: catalog } = useBillingCatalog();
  const states = catalog?.states ?? [];

  // When editing, load the saved branch once
  const { data: branches } = useQuery({
    queryKey: ["company-branches"],
    queryFn: () => customFetch<Branch[]>("/api/company/branches"),
    enabled: !!editId,
    throwOnError: false,
  });

  useEffect(() => {
    if (editId && branches && !loaded) {
      const b = branches.find((x) => x.id === editId);
      if (b) {
        setName(b.name);
        setAddress(b.address ?? "");
        setCity(b.city ?? "");
        setState(b.state ?? "");
        setPincode(b.pincode ?? "");
        setLat(b.latitude != null ? String(b.latitude) : "");
        setLng(b.longitude != null ? String(b.longitude) : "");
        setRadius(String(b.radius));
      }
      setLoaded(true);
    }
  }, [editId, branches, loaded]);

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        name,
        address,
        city,
        state,
        pincode,
        latitude: lat.trim() === "" ? null : Number(lat),
        longitude: lng.trim() === "" ? null : Number(lng),
        radius: Number(radius),
      });
      return editId
        ? customFetch(`/api/company/branches/${editId}`, { method: "PATCH", body })
        : customFetch("/api/company/branches", { method: "POST", body });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["company-branches"] });
      router.back();
    },
    onError: (e: any) => Alert.alert("Could not save", e?.data?.error ?? e?.message ?? "Please try again."),
    throwOnError: false,
  });

  // Fills City, State and Pincode from the GPS position. Only empty fields are filled,
  // so nothing you typed is overwritten. If the phone cannot find the address, nothing happens.
  const fillAddressFromLocation = async (latitude: number, longitude: number) => {
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (!place) return;

      if (!city.trim()) setCity(place.city ?? place.subregion ?? "");

      if (!state) {
        const region = (place.region ?? "").trim().toLowerCase();
        const match = states.find((s) => s.toLowerCase() === region);
        if (match) setState(match);
      }

      if (!pincode && place.postalCode && /^\d{6}$/.test(place.postalCode)) setPincode(place.postalCode);
    } catch {
      // address lookup is only a convenience
    }
  };

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
      await fillAddressFromLocation(loc.coords.latitude, loc.coords.longitude);
    } catch (e: any) {
      Alert.alert("Could not get location", e?.message ?? "Please turn on GPS and try again.");
    } finally {
      setLocating(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Branch name required", "Please enter the branch name.");
      return;
    }
    if (!city.trim()) {
      Alert.alert("City required", "Please enter the city.");
      return;
    }
    if (!state) {
      Alert.alert("State required", "Please select the state.");
      return;
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      Alert.alert("Invalid pincode", "Pincode must be 6 digits.");
      return;
    }
    const hasLat = lat.trim() !== "";
    const hasLng = lng.trim() !== "";
    if (hasLat !== hasLng || (hasLat && (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))))) {
      Alert.alert("Invalid location", "Use “Use my current location”, or fill both latitude and longitude.");
      return;
    }
    const r = Number(radius);
    if (!Number.isFinite(r) || r < 20 || r > 5000) {
      Alert.alert("Invalid radius", "Radius must be between 20 and 5000 metres.");
      return;
    }
    save.mutate();
  };

  if (!loaded) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const inputStyle = [styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: editId ? "Edit Branch" : "Add Branch" }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>{editId ? "Edit Branch" : "Add New Branch"}</Text>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Branch Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={60}
          style={inputStyle}
          placeholder="e.g. Noida Office"
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Address</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          maxLength={200}
          multiline
          style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]}
          placeholder="Branch address"
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>City</Text>
        <TextInput
          value={city}
          onChangeText={setCity}
          maxLength={80}
          style={inputStyle}
          placeholder="e.g. Noida"
          placeholderTextColor={colors.mutedForeground}
        />

        <View style={styles.twoCol}>
          <View style={{ flex: 1.4 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>State</Text>
            <Pressable onPress={() => setStateOpen(true)} style={[inputStyle, styles.dropdown]}>
              <Text
                numberOfLines={1}
                style={{ flex: 1, color: state ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 15 }}
              >
                {state || "Select state"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Pincode</Text>
            <TextInput
              value={pincode}
              onChangeText={(t) => setPincode(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              maxLength={6}
              style={inputStyle}
              placeholder="110008"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>ATTENDANCE LOCATION</Text>
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
        <Text style={[styles.hintSmall, { color: colors.mutedForeground }]}>
          This also fills City, State and Pincode when they are empty.
        </Text>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Latitude</Text>
            <TextInput
              value={lat}
              onChangeText={setLat}
              keyboardType="numbers-and-punctuation"
              style={inputStyle}
              placeholder="28.613900"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Longitude</Text>
            <TextInput
              value={lng}
              onChangeText={setLng}
              keyboardType="numbers-and-punctuation"
              style={inputStyle}
              placeholder="77.209000"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 16 }]}>Allowed radius (metres)</Text>
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
          style={inputStyle}
          placeholder="Custom radius"
          placeholderTextColor={colors.mutedForeground}
        />
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          When Geofence is on in Attendance Settings, employees can punch in within this radius of the branch.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={handleSave}
          disabled={save.isPending}
          style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
        >
          {save.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{editId ? "Save" : "Add Branch"}</Text>}
        </Pressable>
      </View>

      <Modal visible={stateOpen} transparent animationType="fade" onRequestClose={() => setStateOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setStateOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {states.length === 0 ? (
              <Text style={{ padding: 20, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                Could not load the list of states. Go back and try again.
              </Text>
            ) : (
              <FlatList
                data={states}
                keyExtractor={(s) => s}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => { setState(item); setStateOpen(false); }}
                    style={[styles.option, { borderBottomColor: colors.border }]}
                  >
                    <Text
                      style={{
                        flex: 1,
                        color: colors.foreground,
                        fontFamily: item === state ? "Inter_700Bold" : "Inter_500Medium",
                        fontSize: 15,
                      }}
                    >
                      {item}
                    </Text>
                    {item === state && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </Pressable>
                )}
              />
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 12 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6, marginTop: 10 },
  section: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginTop: 24, marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_500Medium" },
  dropdown: { flexDirection: "row", alignItems: "center", gap: 8 },
  locBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderRadius: 12, paddingVertical: 13,
  },
  locBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  hintSmall: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6, marginBottom: 2 },
  twoCol: { flexDirection: "row", gap: 10 },
  chips: { flexDirection: "row", gap: 8, marginBottom: 12 },
  chip: { flex: 1, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderRadius: 10 },
  chipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 10, lineHeight: 18 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  saveBtn: { borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  sheet: { borderRadius: 16, borderWidth: 1, maxHeight: "75%", overflow: "hidden" },
  option: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 15, borderBottomWidth: 1 },
});