import { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  DETAILS_KEY,
  SUMMARY_KEY,
  errText,
  formatDate,
  formatRupees,
  useBillingSummary,
  type OrderParams,
  type Quote,
} from "@/hooks/useBilling";

type Details = {
  invoiceType: "gst" | "non_gst";
  gstin: string;
  billName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};

type CheckoutResult = { invoiceId: number; invoiceNumber: string; validTill: string; totalPaise: number };

export default function CheckoutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { order: orderParam } = useLocalSearchParams<{ order?: string }>();

  const order = useMemo<OrderParams | null>(() => {
    try {
      return orderParam ? (JSON.parse(orderParam) as OrderParams) : null;
    } catch {
      return null;
    }
  }, [orderParam]);

  const { data: summary, refetch: refetchSummary } = useBillingSummary();

  const detailsQ = useQuery({
    queryKey: DETAILS_KEY,
    queryFn: () => customFetch<Details | null>("/api/billing/billing-details"),
    throwOnError: false,
  });

  const quoteQ = useQuery({
    queryKey: ["billing-quote", order],
    queryFn: () => customFetch<Quote>("/api/billing/quote", { method: "POST", body: JSON.stringify(order) }),
    enabled: !!order,
    retry: false,
    throwOnError: false,
  });

  const pay = useMutation({
    mutationFn: () => customFetch<CheckoutResult>("/api/billing/checkout", { method: "POST", body: JSON.stringify(order) }),
    onSuccess: (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
      queryClient.invalidateQueries({ queryKey: ["billing-wallet"] });
      queryClient.invalidateQueries({ queryKey: ["billing-invoices"] });
      Alert.alert(
        "Payment successful",
        `${formatRupees(res.totalPaise)} paid from your wallet.\nInvoice ${res.invoiceNumber}\nPlan valid till ${formatDate(res.validTill)}`,
        [
          {
            text: "OK",
            onPress: () => {
              // Go back to the Subscriptions & Billing screen
              const r = router as any;
              if (typeof r.dismissTo === "function") r.dismissTo("/billing");
              else router.replace("/billing");
            },
          },
        ],
      );
    },
    onError: (e: any) => {
      refetchSummary();
      if (e?.data?.code === "INSUFFICIENT_BALANCE") {
        Alert.alert(
          "Not enough balance",
          `You need ${formatRupees(e.data.shortfallPaise)} more in your wallet.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Add Funds", onPress: () => router.push("/add-funds") },
          ],
        );
        return;
      }
      Alert.alert("Payment failed", errText(e));
    },
    throwOnError: false,
  });

  if (!order) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Nothing to pay. Go back and choose a plan.</Text>
      </View>
    );
  }

  const quote = quoteQ.data;
  const details = detailsQ.data;
  const balance = summary?.walletBalancePaise ?? 0;
  const enough = !!quote && balance >= quote.totalPaise;
  const shortfall = quote ? Math.max(0, quote.totalPaise - balance) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {order.type === "renew" ? "Plan renewal" : "Plan upgrade"}
          </Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            {order.staffLimit} staff · {order.features.length} feature{order.features.length === 1 ? "" : "s"}
            {order.addons.length > 0 ? ` · ${order.addons.length} add-on${order.addons.length === 1 ? "" : "s"}` : ""}
          </Text>

          {quoteQ.isLoading ? (
            <ActivityIndicator style={{ marginVertical: 14 }} color={colors.primary} />
          ) : quoteQ.isError || !quote ? (
            <Text style={styles.error}>{errText(quoteQ.error, "Could not calculate the price")}</Text>
          ) : (
            <>
              {quote.lines.map((l, i) => (
                <View key={i} style={styles.row}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>{l.label}</Text>
                  <Text style={[styles.value, { color: l.amountPaise < 0 ? "#16A34A" : colors.foreground }]}>{formatRupees(l.amountPaise)}</Text>
                </View>
              ))}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Subtotal</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>{formatRupees(quote.subtotalPaise)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>GST (18%)</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>{formatRupees(quote.gstPaise)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.totalLabel, { color: colors.foreground }]}>Total</Text>
                <Text style={[styles.totalValue, { color: colors.foreground }]}>{formatRupees(quote.totalPaise)}</Text>
              </View>
              {order.type === "renew" && (
                <Text style={[styles.note, { color: colors.mutedForeground }]}>New validity: {formatDate(quote.newValidTill)}</Text>
              )}
            </>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.rowTop}>
            <Text style={[styles.title, { color: colors.foreground }]}>Billing details</Text>
            <Pressable hitSlop={10} onPress={() => router.back()}>
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Change</Text>
            </Pressable>
          </View>
          {details ? (
            <Text style={[styles.sub, { color: colors.mutedForeground, lineHeight: 20 }]}>
              {details.billName}
              {"\n"}
              {details.address}, {details.city}, {details.state} {details.pincode}
              {details.invoiceType === "gst" ? `\nGSTIN: ${details.gstin}` : "\nNon-GST invoice"}
            </Text>
          ) : (
            <Text style={styles.error}>Billing details are missing. Tap Change to add them.</Text>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.rowTop}>
            <View>
              <Text style={[styles.title, { color: colors.foreground }]}>Wallet balance</Text>
              <Text style={[styles.balance, { color: enough ? colors.foreground : "#DC2626" }]}>{formatRupees(balance)}</Text>
            </View>
            {!enough && quote && (
              <Pressable onPress={() => router.push("/add-funds")} style={[styles.addBtn, { borderColor: colors.primary }]}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Add Funds</Text>
              </Pressable>
            )}
          </View>
          {!enough && quote && (
            <Text style={styles.error}>You need {formatRupees(shortfall)} more to pay for this order.</Text>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          disabled={!enough || !details || pay.isPending}
          onPress={() => pay.mutate()}
          style={({ pressed }) => [
            styles.payBtn,
            { backgroundColor: colors.primary },
            (!enough || !details || pay.isPending) && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {pay.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payText}>{quote ? `Pay ${formatRupees(quote.totalPaise)} from Wallet` : "Pay"}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4, marginTop: 4 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  label: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  value: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1, marginVertical: 10 },
  totalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  totalValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  note: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8 },
  error: { color: "#DC2626", fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 8, lineHeight: 19 },
  balance: { fontSize: 24, fontFamily: "Inter_700Bold", marginTop: 4 },
  addBtn: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  payBtn: { borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  payText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});