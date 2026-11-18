import { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert, Linking,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

const SUPPORT_EMAIL = "allegient.info@gmail.com";
const APP_VERSION = "1.0.1";

export default function RequestFeatureScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");

  const canSend = title.trim().length >= 3 && details.trim().length >= 10;

  const handleSend = async () => {
    const subject = `Feature Request: ${title.trim()}`;
    const body =
      `${details.trim()}\n\n` +
      `---\nFrom: ${user?.name ?? "-"} (${user?.email ?? "-"})\n` +
      `Company: ${user?.companyName ?? "-"}\nApp: HireMind Mobile ${APP_VERSION}`;
    const url =
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      router.back();
    } catch {
      Alert.alert("No email app found", `Please email your idea to ${SUPPORT_EMAIL}`);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.heading, { color: colors.foreground }]}>Request a Feature</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Tell us what would make HireMind better for you.
      </Text>

      <Text style={[styles.label, { color: colors.mutedForeground }]}>FEATURE TITLE</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Export attendance to Excel"
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
        maxLength={80}
      />

      <Text style={[styles.label, { color: colors.mutedForeground }]}>DETAILS</Text>
      <TextInput
        value={details}
        onChangeText={setDetails}
        placeholder="Describe the feature and how you would use it"
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, styles.multiline, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
        multiline
        textAlignVertical="top"
        maxLength={1000}
      />

      <Pressable
        disabled={!canSend}
        onPress={handleSend}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: colors.primary, opacity: !canSend ? 0.4 : pressed ? 0.8 : 1 },
        ]}
      >
        <Ionicons name="send-outline" size={18} color="#fff" />
        <Text style={styles.btnText}>Send Request</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 4 },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 24 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 8, paddingHorizontal: 4 },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 20,
  },
  multiline: { minHeight: 140 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 14,
  },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});