import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { errText, formatRupees, SUMMARY_KEY } from "@/hooks/useBilling";

const PRESETS = [500, 1000, 2000, 5000, 10000];

export default function AddFundsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("1000");

  const topup = useMutation({
    mutationFn: (rupees: number) =>
      customFetch<{ balancePaise: number }>("/api/billing/wallet/topup", {
        method: "POST",
        body: JSON.stringify({ amount: rupees }),
      }),
    onSuccess: (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
      queryClient.invalidateQueries({ queryKey: ["billing-wallet"] });
      Alert.alert("Funds added", `New balance: ${formatRupees(res.balancePaise)}`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: (e) => Alert.alert("Could not add funds", errText(e)),
    throwOnError: false,
  });

  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= 10 && value <= 100000;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Amount to add (₹)</Text>
      <TextInput
        value={amount}
        onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        maxLength={6}
        style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
        placeholder="1000"
        placeholderTextColor={colors.mutedForeground}
      />

      <View style={styles.chips}>
        {PRESETS.map((p) => {
          const active = amount === String(p);
          return (
            <Pressable
              key={p}
              onPress={() => setAmount(String(p))}
              style={[
                styles.chip,
                { borderColor: colors.border, backgroundColor: colors.card },
                active && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? "#fff" : colors.foreground }]}>₹{p.toLocaleString("en-IN")}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Wallet balance is used to pay for plan upgrades and renewals. Allowed amount: ₹10 to ₹1,00,000.
      </Text>

      <Pressable
        disabled={!valid || topup.isPending}
        onPress={() => topup.mutate(value)}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: colors.primary },
          (!valid || topup.isPending) && { opacity: 0.5 },
          pressed && { opacity: 0.85 },
        ]}
      >
        {topup.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Add {valid ? formatRupees(value * 100) : "funds"}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 26, fontFamily: "Inter_700Bold" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderRadius: 10 },
  chipText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 18 },
  btn: { marginTop: 28, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});