import { useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Linking, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { errText, formatDate, formatRupees } from "@/hooks/useBilling";

type InvoiceRow = {
  id: number;
  invoiceNumber: string;
  purchaseType: "upgrade" | "renewal";
  totalPaise: number;
  createdAt: string;
};

export default function InvoiceHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [openingId, setOpeningId] = useState<number | null>(null);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["billing-invoices"],
    queryFn: () => customFetch<InvoiceRow[]>("/api/billing/invoices"),
    throwOnError: false,
  });

  // Gets a short-lived signed link from the server and opens the invoice in the browser,
  // where it can be printed or saved as PDF.
  const download = async (id: number) => {
    setOpeningId(id);
    try {
      const res = await customFetch<{ url: string }>(`/api/billing/invoices/${id}/link`, { method: "POST" });
      await Linking.openURL(res.url);
    } catch (e) {
      Alert.alert("Could not open invoice", errText(e));
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No invoices yet. They appear here after you pay for an upgrade or renewal.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.line}>
                <Text style={[styles.key, { color: colors.mutedForeground }]}>Purchase Date</Text>
                <Text style={[styles.val, { color: colors.foreground }]}>{formatDate(item.createdAt)}</Text>
              </View>
              <View style={styles.line}>
                <Text style={[styles.key, { color: colors.mutedForeground }]}>Purchase Type</Text>
                <Text style={[styles.val, { color: colors.foreground }]}>
                  {item.purchaseType === "renewal" ? "Renewal Plan" : "Upgrade Plan"}
                </Text>
              </View>
              <View style={styles.line}>
                <Text style={[styles.key, { color: colors.mutedForeground }]}>Invoice No</Text>
                <Text style={[styles.val, { color: colors.foreground }]}>{item.invoiceNumber}</Text>
              </View>
              <View style={styles.line}>
                <Text style={[styles.key, { color: colors.mutedForeground }]}>Amount</Text>
                <Text style={[styles.val, { color: colors.foreground }]}>{formatRupees(item.totalPaise)}</Text>
              </View>
              <Pressable
                onPress={() => download(item.id)}
                disabled={openingId === item.id}
                style={({ pressed }) => [styles.dlBtn, { borderColor: "#1D9BF0" }, pressed && { opacity: 0.7 }]}
              >
                {openingId === item.id ? (
                  <ActivityIndicator color="#1D9BF0" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={20} color="#1D9BF0" />
                    <Text style={styles.dlText}>Download Invoice</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", marginTop: 70, gap: 12, paddingHorizontal: 28 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  line: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  key: { fontSize: 14, fontFamily: "Inter_500Medium" },
  val: { fontSize: 14, fontFamily: "Inter_600SemiBold", flexShrink: 1, textAlign: "right" },
  dlBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, marginTop: 4 },
  dlText: { color: "#1D9BF0", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});