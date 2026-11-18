import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Image, Alert, Modal, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { DatePickerModal } from "@/components/DatePickerModal";

type LeaveOption = {
  key: string;
  name: string;
  color: string;
  quota: number | null;
  balance: number | null;
};

type Summary = { year: number; options: LeaveOption[] };

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prettyDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function dayCount(from: string, to: string, half: boolean): number {
  if (half) return 0.5;
  const ms = new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime();
  return Math.round(ms / 86400000) + 1;
}

function balanceText(o: LeaveOption): string {
  return o.balance == null ? o.name : `${o.name} (balance: ${o.balance} days)`;
}

export default function RequestLeaveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const employeeId = (user as any)?.employeeId as number | undefined;

  const [startDate, setStartDate] = useState(todayYmd());
  const [endDate, setEndDate] = useState(todayYmd());
  const [halfDay, setHalfDay] = useState(false);
  const [typeKey, setTypeKey] = useState("");
  const [reason, setReason] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageB64, setImageB64] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | "from" | "to">(null);
  const [typeOpen, setTypeOpen] = useState(false);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["my-leave-summary"],
    queryFn: () => customFetch<Summary>("/api/leaves/my-summary"),
    throwOnError: false,
  });

  // Start with the first leave type
  useEffect(() => {
    if (summary && !typeKey && summary.options.length > 0) setTypeKey(summary.options[0].key);
  }, [summary, typeKey]);

  const selected = summary?.options.find((o) => o.key === typeKey);
  const days = dayCount(startDate, endDate, halfDay);

  const submit = useMutation({
    mutationFn: () =>
      customFetch("/api/leaves", {
        method: "POST",
        body: JSON.stringify({
          employeeId,
          type: typeKey,
          startDate,
          endDate,
          halfDay,
          reason: reason.trim() || undefined,
          attachmentBase64: imageB64 ?? undefined,
        }),
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["my-leave-summary"] });
      queryClient.invalidateQueries({ queryKey: ["my-leaves"] });
      Alert.alert("Request sent", "Your leave request was sent to your admin for approval.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: (e: any) => Alert.alert("Could not send request", e?.data?.error ?? e?.message ?? "Please try again."),
    throwOnError: false,
  });

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.5,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setImageUri(res.assets[0].uri);
    setImageB64(res.assets[0].base64 ?? null);
  };

  const onPickFrom = (ymd: string) => {
    setStartDate(ymd);
    if (halfDay || endDate < ymd) setEndDate(ymd); // keep "to" in step
  };

  const toggleHalfDay = () => {
    const next = !halfDay;
    setHalfDay(next);
    if (next) setEndDate(startDate);
  };

  const handleSubmit = () => {
    if (!employeeId) {
      Alert.alert("Not available", "Please log in as an employee to request leave.");
      return;
    }
    if (!selected) {
      Alert.alert("Select leave type", "Please choose a leave type.");
      return;
    }
    if (selected.balance != null && days > selected.balance) {
      Alert.alert("Not enough balance", `You have ${selected.balance} day(s) of ${selected.name} left. Choose another type or fewer days.`);
      return;
    }
    submit.mutate();
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const field = [styles.field, { borderColor: colors.border, backgroundColor: colors.card }];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dates}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>From date *</Text>
            <Pressable onPress={() => setPicker("from")} style={field}>
              <Text style={[styles.fieldText, { color: colors.foreground }]}>{prettyDate(startDate)}</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>To date *</Text>
            <Pressable
              onPress={() => !halfDay && setPicker("to")}
              style={[field, halfDay && { opacity: 0.5 }]}
            >
              <Text style={[styles.fieldText, { color: colors.foreground }]}>{prettyDate(endDate)}</Text>
            </Pressable>
          </View>
        </View>

        <Pressable onPress={toggleHalfDay} style={styles.checkRow}>
          <Ionicons
            name={halfDay ? "checkbox" : "square-outline"}
            size={26}
            color={halfDay ? colors.primary : colors.mutedForeground}
          />
          <Text style={[styles.checkText, { color: colors.foreground }]}>Request leave for half day</Text>
        </Pressable>

        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 18 }]}>Leave Type *</Text>
        <Pressable onPress={() => setTypeOpen(true)} style={[field, styles.dropdown]}>
          <Text style={[styles.fieldText, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
            {selected ? balanceText(selected) : "Select leave type"}
          </Text>
          <Ionicons name="caret-down" size={16} color={colors.mutedForeground} />
        </Pressable>

        <Text style={[styles.summary, { color: colors.mutedForeground }]}>
          Total: {halfDay ? "Half day" : `${days} day${days === 1 ? "" : "s"}`}
        </Text>

        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Reason of leave</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={300}
          style={[field, { minHeight: 110, textAlignVertical: "top", color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 15 }]}
          placeholder="Write the reason (optional)"
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 18 }]}>Add Image</Text>
        {imageUri ? (
          <View style={styles.imageWrap}>
            <Image source={{ uri: imageUri }} style={styles.image} />
            <Pressable
              onPress={() => { setImageUri(null); setImageB64(null); }}
              style={styles.removeImg}
              hitSlop={8}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={pickImage} style={[styles.addFile, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={styles.addFileText}>ADD{"\n"}FILE</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={handleSubmit}
          disabled={submit.isPending}
          style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
        >
          {submit.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Request Leave</Text>}
        </Pressable>
      </View>

      <DatePickerModal
        visible={picker === "from"}
        value={startDate}
        minDate={todayYmd()}
        onSelect={onPickFrom}
        onClose={() => setPicker(null)}
      />
      <DatePickerModal
        visible={picker === "to"}
        value={endDate}
        minDate={startDate}
        onSelect={setEndDate}
        onClose={() => setPicker(null)}
      />

      <Modal visible={typeOpen} transparent animationType="fade" onRequestClose={() => setTypeOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setTypeOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(summary?.options ?? []).map((o) => (
              <Pressable
                key={o.key}
                onPress={() => { setTypeKey(o.key); setTypeOpen(false); }}
                style={[styles.option, { borderBottomColor: colors.border }]}
              >
                <View style={[styles.dot, { backgroundColor: o.color }]} />
                <Text style={{ flex: 1, color: colors.foreground, fontSize: 16, fontFamily: o.key === typeKey ? "Inter_700Bold" : "Inter_500Medium" }}>
                  {balanceText(o)}
                </Text>
                {o.key === typeKey && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dates: { flexDirection: "row", gap: 12 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  field: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 14 },
  fieldText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  dropdown: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
  checkText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  summary: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 10 },
  addFile: { width: 84, height: 84, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  addFileText: { color: "#1D9BF0", fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 22 },
  imageWrap: { width: 110, height: 110 },
  image: { width: 110, height: 110, borderRadius: 10 },
  removeImg: { position: "absolute", top: -8, right: -8, width: 26, height: 26, borderRadius: 13, backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  btn: { borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  sheet: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});