import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Modal, FlatList, ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { DETAILS_KEY, errText, useBillingCatalog } from "@/hooks/useBilling";

type Details = {
  invoiceType: "gst" | "non_gst";
  gstin: string;
  billName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

type CompanyLite = { companyName: string; address: string };

type GstLookup = { gstin: string; state: string; name: string; address: string; pincode: string };

export default function BillingDetailsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { order } = useLocalSearchParams<{ order?: string }>();

  const [invoiceType, setInvoiceType] = useState<"gst" | "non_gst">("gst");
  const [gstin, setGstin] = useState("");
  const [billName, setBillName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [stateOpen, setStateOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { data: catalog } = useBillingCatalog();

  const detailsQ = useQuery({
    queryKey: DETAILS_KEY,
    queryFn: () => customFetch<Details | null>("/api/billing/billing-details"),
    throwOnError: false,
  });

  const companyQ = useQuery({
    queryKey: ["company"],
    queryFn: () => customFetch<CompanyLite>("/api/company"),
    throwOnError: false,
  });

  // Fill the form once: saved billing details first, otherwise the company's own details
  useEffect(() => {
    if (loaded || detailsQ.isLoading || companyQ.isLoading) return;
    const d = detailsQ.data;
    if (d) {
      setInvoiceType(d.invoiceType);
      setGstin(d.gstin);
      setBillName(d.billName);
      setAddress(d.address);
      setCity(d.city);
      setState(d.state);
      setPincode(d.pincode);
    } else if (companyQ.data) {
      setBillName(companyQ.data.companyName ?? "");
      setAddress(companyQ.data.address ?? "");
      const pin = (companyQ.data.address ?? "").match(/\b\d{6}\b/)?.[0];
      if (pin) setPincode(pin);
    }
    setLoaded(true);
  }, [loaded, detailsQ.isLoading, detailsQ.data, companyQ.isLoading, companyQ.data]);

  const lookup = useMutation({
    mutationFn: () => customFetch<GstLookup>(`/api/billing/gst-lookup?gstin=${encodeURIComponent(gstin.trim())}`),
    onSuccess: (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setGstin(res.gstin);
      setState(res.state);
      if (res.name) setBillName(res.name);
      if (res.address) setAddress(res.address);
      if (res.pincode) setPincode(res.pincode);
      Alert.alert("Address filled", "State is taken from your GSTIN. Name and address come from your Company Details. Please check the city and pincode.");
    },
    onError: (e) => Alert.alert("Could not fill address", errText(e)),
    throwOnError: false,
  });

  const save = useMutation({
    mutationFn: () =>
      customFetch("/api/billing/billing-details", {
        method: "PUT",
        body: JSON.stringify({ invoiceType, gstin, billName, address, city, state, pincode, country: "India" }),
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: DETAILS_KEY });
      if (order) {
        router.push({ pathname: "/checkout", params: { order } });
      } else {
        Alert.alert("Saved", "Billing details updated.", [{ text: "OK", onPress: () => router.back() }]);
      }
    },
    onError: (e) => Alert.alert("Could not save", errText(e)),
    throwOnError: false,
  });

  const handleContinue = () => {
    if (invoiceType === "gst" && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.trim().toUpperCase())) {
      Alert.alert("GSTIN needed", "Enter a valid 15-character GSTIN, or choose Non-GST Invoice.");
      return;
    }
    if (!billName.trim()) return Alert.alert("Required", "Enter the name to bill.");
    if (!address.trim()) return Alert.alert("Required", "Enter the company address.");
    if (!city.trim()) return Alert.alert("Required", "Enter the city.");
    if (!state) return Alert.alert("Required", "Select the state.");
    if (!/^\d{6}$/.test(pincode.trim())) return Alert.alert("Invalid pincode", "Pincode must be 6 digits.");
    save.mutate();
  };

  if (!loaded) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const input = [styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }];

  const typeCard = (type: "gst" | "non_gst", title: string, sub: string) => {
    const active = invoiceType === type;
    return (
      <Pressable
        onPress={() => setInvoiceType(type)}
        style={[
          styles.typeCard,
          { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.accent : colors.card },
        ]}
      >
        <View style={[styles.typeIcon, { backgroundColor: active ? colors.primary : colors.muted }]}>
          <Ionicons name="receipt-outline" size={22} color={active ? "#fff" : colors.mutedForeground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.typeTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.typeSub, { color: colors.mutedForeground }]}>{sub}</Text>
        </View>
        <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={24} color={active ? colors.primary : colors.mutedForeground} />
      </Pressable>
    );
  };

  const label = (text: string) => (
    <Text style={[styles.label, { color: colors.foreground }]}>
      <Text style={{ color: "#EF4444" }}>* </Text>
      {text}
    </Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>Confirm your billing details</Text>

        {typeCard("gst", "GST Invoice", "For registered businesses with GST number")}
        {typeCard("non_gst", "Non-GST Invoice", "Standard invoice without GST details")}

        {invoiceType === "gst" && (
          <>
            {label("GSTIN")}
            <TextInput
              value={gstin}
              onChangeText={(t) => setGstin(t.toUpperCase())}
              maxLength={15}
              autoCapitalize="characters"
              style={input}
              placeholder="07AAMCA0717H1ZU"
              placeholderTextColor={colors.mutedForeground}
            />
            <Pressable
              onPress={() => lookup.mutate()}
              disabled={lookup.isPending}
              style={({ pressed }) => [styles.getBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
            >
              {lookup.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.getBtnText}>Get Address</Text>}
            </Pressable>
          </>
        )}

        {label("Bill to (Name)")}
        <TextInput value={billName} onChangeText={setBillName} maxLength={120} style={input} placeholder="Company name" placeholderTextColor={colors.mutedForeground} />

        {label("Company Address")}
        <TextInput
          value={address}
          onChangeText={setAddress}
          maxLength={300}
          multiline
          style={[input, { minHeight: 80, textAlignVertical: "top" }]}
          placeholder="Address"
          placeholderTextColor={colors.mutedForeground}
        />

        {label("City")}
        <TextInput value={city} onChangeText={setCity} maxLength={80} style={input} placeholder="City" placeholderTextColor={colors.mutedForeground} />

        {label("State")}
        <Pressable onPress={() => setStateOpen(true)} style={[input, styles.dropdown]}>
          <Text style={{ color: state ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 15 }}>
            {state || "Select state"}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
        </Pressable>

        {label("Pincode")}
        <TextInput
          value={pincode}
          onChangeText={(t) => setPincode(t.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          maxLength={6}
          style={input}
          placeholder="110008"
          placeholderTextColor={colors.mutedForeground}
        />

        {label("Country")}
        <View style={[input, styles.dropdown, { opacity: 0.7 }]}>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 15 }}>India</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={handleContinue}
          disabled={save.isPending}
          style={({ pressed }) => [styles.contBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
        >
          {save.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.contText}>{order ? "Continue  →" : "Save"}</Text>
          )}
        </Pressable>
      </View>

      <Modal visible={stateOpen} transparent animationType="fade" onRequestClose={() => setStateOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setStateOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <FlatList
              data={catalog?.states ?? []}
              keyExtractor={(s) => s}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setState(item); setStateOpen(false); }}
                  style={[styles.option, { borderBottomColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground, fontFamily: item === state ? "Inter_700Bold" : "Inter_500Medium", fontSize: 15, flex: 1 }}>
                    {item}
                  </Text>
                  {item === state && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  intro: { fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 14 },
  typeCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderWidth: 2, borderRadius: 14, marginBottom: 10 },
  typeIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  typeTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 2 },
  typeSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  label: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 8, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_500Medium" },
  dropdown: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  getBtn: { marginTop: 14, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  getBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  contBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  contText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  sheet: { borderRadius: 16, borderWidth: 1, maxHeight: "75%", overflow: "hidden" },
  option: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 15, borderBottomWidth: 1 },
});