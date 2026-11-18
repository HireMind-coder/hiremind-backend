import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  useBillingCatalog,
  useBillingSummary,
  errText,
  formatDate,
  formatRupees,
  type OrderParams,
  type Quote,
} from "@/hooks/useBilling";

type Picker = null | "duration" | "staff" | "features" | "addons";

export function PlanEditor({ mode }: { mode: "upgrade" | "renew" }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: summary, isLoading: summaryLoading } = useBillingSummary();
  const { data: catalog, isLoading: catalogLoading } = useBillingCatalog();

  const [staffLimit, setStaffLimit] = useState<number | null>(null);
  const [features, setFeatures] = useState<string[]>([]);
  const [addons, setAddons] = useState<string[]>([]);
  const [months, setMonths] = useState(12);
  const [picker, setPicker] = useState<Picker>(null);
  const [ready, setReady] = useState(false);

  // Start from what the company has today
  useEffect(() => {
    if (summary && !ready) {
      setStaffLimit(summary.staffLimit);
      setFeatures(summary.featureIds);
      setAddons(summary.addonIds);
      setReady(true);
    }
  }, [summary, ready]);

  const order: OrderParams | null =
    ready && staffLimit ? { type: mode, staffLimit, features, addons, durationMonths: mode === "renew" ? months : 12 } : null;

  const quoteQ = useQuery({
    queryKey: ["billing-quote", order],
    queryFn: () => customFetch<Quote>("/api/billing/quote", { method: "POST", body: JSON.stringify(order) }),
    enabled: !!order,
    retry: false,
    throwOnError: false,
  });

  const staffOptions = useMemo(() => {
    if (!catalog || !summary) return [];
    const min = mode === "upgrade" ? summary.staffLimit : Math.max(1, summary.activeStaff);
    const list = catalog.staffLimits.filter((n) => n >= min);
    if (mode === "upgrade" && !list.includes(summary.staffLimit)) list.unshift(summary.staffLimit);
    if (mode === "renew" && !list.includes(summary.staffLimit) && summary.staffLimit >= min) list.unshift(summary.staffLimit);
    return Array.from(new Set(list)).sort((a, b) => a - b);
  }, [catalog, summary, mode]);

  if (summaryLoading || catalogLoading || !summary || !catalog || !ready || !order) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const lockedFeatures = mode === "upgrade" ? summary.featureIds : [];
  const lockedAddons = mode === "upgrade" ? summary.addonIds : [];
  const duration = catalog.durations.find((d) => d.months === months);
  const quote = quoteQ.data;

  const toggle = (list: string[], setList: (v: string[]) => void, id: string, locked: string[]) => {
    if (locked.includes(id)) return;
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const goPay = () => {
    router.push({ pathname: "/billing-details", params: { order: JSON.stringify(order) } });
  };

  const trigger = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={[styles.trigger, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.triggerText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        {mode === "upgrade" && (
          <View style={styles.info}>
            <Text style={styles.infoText}>
              You are upgrading your current subscription (valid till {formatDate(summary.validTill)})
            </Text>
          </View>
        )}

        {mode === "renew" && (
          <View style={[styles.block, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.blockTitle, { color: colors.foreground }]}>Select Duration</Text>
              {quote && <Text style={[styles.blockSub, { color: colors.mutedForeground }]}>Valid till {formatDate(quote.newValidTill)}</Text>}
            </View>
            {trigger(`${duration?.label ?? "1 YEAR"}  ▾`, () => setPicker("duration"))}
          </View>
        )}

        <View style={[styles.block, { borderBottomColor: colors.border }]}>
          <Text style={[styles.blockTitle, { color: colors.foreground, flex: 1 }]}>Staff Limit</Text>
          {trigger(`${staffLimit} Staff  ▾`, () => setPicker("staff"))}
        </View>

        <View style={[styles.block, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.blockTitle, { color: colors.foreground }]}>Features</Text>
            <Text style={[styles.blockSub, { color: colors.mutedForeground }]}>
              {features.length} feature{features.length === 1 ? "" : "s"} added
            </Text>
          </View>
          {trigger("+Add More", () => setPicker("features"))}
        </View>

        <View style={[styles.block, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.blockTitle, { color: colors.foreground }]}>Add-Ons</Text>
            <Text style={[styles.blockSub, { color: colors.mutedForeground }]}>
              {addons.length === 0 ? "No Add-Ons added" : `${addons.length} add-on${addons.length === 1 ? "" : "s"} added`}
            </Text>
          </View>
          {trigger("+Add More", () => setPicker("addons"))}
        </View>

        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Price summary</Text>
          {quoteQ.isLoading ? (
            <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
          ) : quoteQ.isError ? (
            <Text style={styles.error}>{errText(quoteQ.error)}</Text>
          ) : quote ? (
            <>
              {quote.lines.map((l, i) => (
                <View key={i} style={styles.sumRow}>
                  <Text style={[styles.sumLabel, { color: colors.mutedForeground }]}>{l.label}</Text>
                  <Text style={[styles.sumValue, { color: l.amountPaise < 0 ? "#16A34A" : colors.foreground }]}>
                    {formatRupees(l.amountPaise)}
                  </Text>
                </View>
              ))}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.sumRow}>
                <Text style={[styles.sumLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
                <Text style={[styles.sumValue, { color: colors.foreground }]}>{formatRupees(quote.subtotalPaise)}</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={[styles.sumLabel, { color: colors.mutedForeground }]}>GST ({Math.round(catalog.gstRate * 100)}%)</Text>
                <Text style={[styles.sumValue, { color: colors.foreground }]}>{formatRupees(quote.gstPaise)}</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={[styles.totalLabel, { color: colors.foreground }]}>Total</Text>
                <Text style={[styles.totalValue, { color: colors.foreground }]}>{formatRupees(quote.totalPaise)}</Text>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          disabled={!quote}
          onPress={goPay}
          style={({ pressed }) => [styles.payBtn, { backgroundColor: colors.primary }, !quote && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.payText}>Continue to Pay</Text>
        </Pressable>
      </View>

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <ScrollView>
              {picker === "duration" &&
                catalog.durations.map((d) => (
                  <Pressable
                    key={d.months}
                    onPress={() => { setMonths(d.months); setPicker(null); }}
                    style={[styles.option, { borderBottomColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionText, { color: colors.foreground }]}>{d.label}</Text>
                      {d.discountPercent > 0 && <Text style={styles.save}>Save {d.discountPercent}%</Text>}
                    </View>
                    {d.months === months && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                  </Pressable>
                ))}

              {picker === "staff" &&
                staffOptions.map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => { setStaffLimit(n); setPicker(null); }}
                    style={[styles.option, { borderBottomColor: colors.border }]}
                  >
                    <Text style={[styles.optionText, { color: colors.foreground, flex: 1 }]}>{n} Staff</Text>
                    {n === staffLimit && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                  </Pressable>
                ))}

              {picker === "features" &&
                catalog.features.map((f) => {
                  const on = features.includes(f.id);
                  const locked = lockedFeatures.includes(f.id);
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => toggle(features, setFeatures, f.id, lockedFeatures)}
                      style={[styles.option, { borderBottomColor: colors.border }]}
                    >
                      <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.primary : colors.mutedForeground} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionText, { color: colors.foreground }]}>{f.name}</Text>
                        <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>
                          {f.description} · {formatRupees(f.pricePerStaffYear * 100)}/staff/year{locked ? " · in your plan" : ""}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}

              {picker === "addons" &&
                catalog.addons.map((a) => {
                  const on = addons.includes(a.id);
                  const locked = lockedAddons.includes(a.id);
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => toggle(addons, setAddons, a.id, lockedAddons)}
                      style={[styles.option, { borderBottomColor: colors.border }]}
                    >
                      <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.primary : colors.mutedForeground} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionText, { color: colors.foreground }]}>{a.name}</Text>
                        <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>
                          {a.description} · {formatRupees(a.priceYear * 100)}/year{locked ? " · in your plan" : ""}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
            </ScrollView>

            {(picker === "features" || picker === "addons") && (
              <Pressable onPress={() => setPicker(null)} style={[styles.doneBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  info: { margin: 16, padding: 14, borderWidth: 1.5, borderColor: "#3B9BE0", backgroundColor: "#EFF6FF", borderRadius: 10 },
  infoText: { color: "#1D7FC4", fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20 },
  block: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1 },
  blockTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  blockSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  trigger: { paddingHorizontal: 18, paddingVertical: 12, borderWidth: 1, borderRadius: 8 },
  triggerText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  summary: { margin: 16, padding: 16, borderWidth: 1, borderRadius: 14 },
  summaryTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 10 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 },
  sumLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  sumValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1, marginVertical: 8 },
  totalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  totalValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  error: { color: "#DC2626", fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 19 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  payBtn: { borderRadius: 10, paddingVertical: 16, alignItems: "center" },
  payText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  sheet: { borderRadius: 16, borderWidth: 1, maxHeight: "75%", overflow: "hidden" },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 15, borderBottomWidth: 1 },
  optionText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  optionSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  save: { color: "#16A34A", fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  doneBtn: { margin: 14, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  doneText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});