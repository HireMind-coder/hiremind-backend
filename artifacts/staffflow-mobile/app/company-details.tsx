import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Image, Alert, Modal, FlatList, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { getBaseUrl } from "@/constants/api";

type Company = {
  companyName: string;
  businessType: string;
  address: string;
  gstNumber: string;
  udyamNumber: string;
  logoUrl: string | null;
  companyCode: string;
  businessTypes: string[];
};

function errText(e: any): string {
  return e?.data?.error ?? e?.message ?? "Something went wrong. Please try again.";
}

export default function CompanyDetailsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["company"],
    queryFn: () => customFetch<Company>("/api/company"),
    throwOnError: false,
  });

  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [address, setAddress] = useState("");
  const [gst, setGst] = useState("");
  const [udyam, setUdyam] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);

  // Fill the form once when the saved details arrive
  useEffect(() => {
    if (data && !loaded) {
      setName(data.companyName);
      setBusinessType(data.businessType);
      setAddress(data.address);
      setGst(data.gstNumber);
      setUdyam(data.udyamNumber);
      setLoaded(true);
    }
  }, [data, loaded]);

  const save = useMutation({
    mutationFn: () =>
      customFetch<Company>("/api/company", {
        method: "PUT",
        body: JSON.stringify({
          companyName: name,
          businessType,
          address,
          gstNumber: gst,
          udyamNumber: udyam,
        }),
      }),
    onSuccess: (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.setQueryData(["company"], res);
      Alert.alert("Saved", "Company details updated.", [{ text: "OK", onPress: () => router.back() }]);
    },
    onError: (e) => Alert.alert("Could not save", errText(e)),
    throwOnError: false,
  });

  const uploadLogo = useMutation({
    mutationFn: (imageBase64: string) =>
      customFetch<{ logoUrl: string }>("/api/company/logo", {
        method: "POST",
        body: JSON.stringify({ imageBase64 }),
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["company"] });
    },
    onError: (e) => Alert.alert("Could not upload logo", errText(e)),
    throwOnError: false,
  });

  const pickLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    uploadLogo.mutate(res.assets[0].base64);
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Company name required", "Please enter your company name.");
      return;
    }
    save.mutate();
  };

  if (isLoading || !loaded) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const inputStyle = [styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }];
  const logoUri = data?.logoUrl ? `${getBaseUrl()}${data.logoUrl}` : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoWrap}>
          <View style={[styles.logo, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {uploadLogo.isPending ? (
              <ActivityIndicator color={colors.primary} />
            ) : logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoImg} resizeMode="contain" />
            ) : (
              <Text style={[styles.logoLetter, { color: colors.primary }]}>
                {(name || "C").charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <Pressable onPress={pickLogo} style={[styles.editBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="pencil" size={16} color="#fff" />
          </Pressable>
        </View>

        <Text style={[styles.label, { color: colors.foreground }]}>Company Name</Text>
        <TextInput value={name} onChangeText={setName} maxLength={120} style={inputStyle} placeholder="Company name" placeholderTextColor={colors.mutedForeground} />

        <Text style={[styles.label, { color: colors.foreground }]}>Business Type</Text>
        <Pressable onPress={() => setTypeOpen(true)} style={[inputStyle, styles.dropdown]}>
          <Text style={{ color: businessType ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 15 }}>
            {businessType || "Select business type"}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
        </Pressable>

        <Text style={[styles.label, { color: colors.foreground }]}>Company Address</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          maxLength={300}
          multiline
          style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]}
          placeholder="Company address"
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={[styles.label, { color: colors.foreground }]}>GST Number</Text>
        <TextInput
          value={gst}
          onChangeText={(t) => setGst(t.toUpperCase())}
          maxLength={15}
          autoCapitalize="characters"
          style={inputStyle}
          placeholder="07AAMCA0717H1ZU"
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={[styles.label, { color: colors.foreground }]}>Udyam Registration Number</Text>
        <TextInput
          value={udyam}
          onChangeText={(t) => setUdyam(t.toUpperCase())}
          maxLength={25}
          autoCapitalize="characters"
          style={inputStyle}
          placeholder="UDYAM-XX-00-0000000"
          placeholderTextColor={colors.mutedForeground}
        />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          disabled={save.isPending}
          style={[styles.btn, { borderWidth: 1.5, borderColor: colors.primary }]}
        >
          <Text style={[styles.btnText, { color: colors.primary }]}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={save.isPending}
          style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
        >
          {save.isPending ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnText, { color: "#fff" }]}>Save</Text>}
        </Pressable>
      </View>

      <Modal visible={typeOpen} transparent animationType="fade" onRequestClose={() => setTypeOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setTypeOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <FlatList
              data={data?.businessTypes ?? []}
              keyExtractor={(t) => t}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setBusinessType(item); setTypeOpen(false); }}
                  style={[styles.option, { borderBottomColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground, fontFamily: item === businessType ? "Inter_700Bold" : "Inter_500Medium", fontSize: 15 }}>
                    {item}
                  </Text>
                  {item === businessType && <Ionicons name="checkmark" size={18} color={colors.primary} />}
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
  logoWrap: { alignSelf: "center", marginBottom: 22, marginTop: 4 },
  logo: { width: 120, height: 120, borderRadius: 60, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoImg: { width: 100, height: 100 },
  logoLetter: { fontSize: 44, fontFamily: "Inter_700Bold" },
  editBadge: { position: "absolute", right: 0, bottom: 4, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 8, marginTop: 14 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_500Medium" },
  dropdown: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  sheet: { borderRadius: 16, borderWidth: 1, maxHeight: "70%", overflow: "hidden" },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 15, borderBottomWidth: 1 },
});