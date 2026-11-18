import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, Share, Modal, ScrollView, Alert, ActivityIndicator, RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate, formatRupees } from "@/hooks/useBilling";
import { inviteMessage } from "@/constants/referral";

type ReferralRow = {
  id: number;
  companyName: string;
  status: "joined" | "rewarded" | "capped";
  rewardPaise: number;
  createdAt: string;
  referredBy: string | null;
};

type ReferralData = {
  code: string;
  rules: { rewardPaise: number; minPurchasePaise: number };
  stats: { joined: number; rewarded: number; earnedPaise: number };
  referrals: ReferralRow[];
};

const STATUS: Record<ReferralRow["status"], { label: string; color: string; bg: string }> = {
  joined: { label: "Joined", color: "#D97706", bg: "#FEF3C7" },
  rewarded: { label: "Rewarded", color: "#16A34A", bg: "#DCFCE7" },
  capped: { label: "Limit reached", color: "#6B7280", bg: "#E5E7EB" },
};

export default function ReferAFriendScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [termsOpen, setTermsOpen] = useState(false);

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ["referrals-me"],
    queryFn: () => customFetch<ReferralData>("/api/referrals/me"),
    throwOnError: false,
  });

  const reward = data ? formatRupees(data.rules.rewardPaise) : "";
  const minPurchase = data ? formatRupees(data.rules.minPurchasePaise) : "";
  const isEmployee = (user as any)?.role === "employee";

  const shareInvite = async () => {
    if (!data) return;
    Haptics.selectionAsync();
    try {
      await Share.share({ message: inviteMessage((user as any)?.name, data.code) });
    } catch (e: any) {
      Alert.alert("Could not open sharing", e?.message ?? "Please try again.");
    }
  };

  // "Copy" opens the share menu, which has a Copy option (no extra package needed)
  const shareCodeOnly = () => {
    if (!data) return;
    Haptics.selectionAsync();
    Share.share({ message: data.code });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="megaphone" size={44} color={colors.primary} />
          </View>
          <View style={styles.coin}>
            <Text style={styles.coinText}>₹</Text>
          </View>
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>Invite a friend to HireMind</Text>
        <Text style={[styles.sub, { color: colors.foreground }]}>
          Help a friend modernise their staff management by referring them to the HireMind app.
        </Text>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
        ) : isError || !data ? (
          <View style={{ alignItems: "center", marginTop: 24 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 12 }}>
              Could not load your referral details
            </Text>
            <Pressable onPress={() => refetch()} style={[styles.retry, { backgroundColor: colors.primary }]}>
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.offer}>
              <Ionicons name="gift-outline" size={20} color="#92400E" />
              <Text style={styles.offerText}>
                When your friend's company buys a plan of {minPurchase} or more, {reward} is added to your{" "}
                company wallet.
              </Text>
            </View>

            <View style={[styles.codeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>Your referral code</Text>
              <View style={styles.codeRow}>
                <Text style={[styles.code, { color: colors.foreground }]}>{data.code}</Text>
                <Pressable onPress={shareCodeOnly} hitSlop={12} style={styles.copyBtn}>
                  <Ionicons name="copy-outline" size={20} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Copy</Text>
                </Pressable>
              </View>
              <Text style={[styles.codeHint, { color: colors.mutedForeground }]}>
                Your friend enters this code when creating their company account.
              </Text>
            </View>

            <View style={styles.statsRow}>
              {[
                { label: "Joined", value: String(data.stats.joined) },
                { label: "Rewarded", value: String(data.stats.rewarded) },
                { label: "Earned", value: formatRupees(data.stats.earnedPaise) },
              ].map((s) => (
                <View key={s.label} style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.listTitle, { color: colors.foreground }]}>
              {isEmployee ? "My referrals" : "Company referrals"}
            </Text>
            {data.referrals.length === 0 ? (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>
                No one has joined with your code yet. Share your invite to get started.
              </Text>
            ) : (
              data.referrals.map((r) => {
                const s = STATUS[r.status];
                return (
                  <View key={r.id} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, { color: colors.foreground }]}>{r.companyName}</Text>
                      <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                        Joined {formatDate(r.createdAt)}
                        {r.referredBy ? ` · by ${r.referredBy}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <View style={[styles.badge, { backgroundColor: s.bg }]}>
                        <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
                      </View>
                      {r.status === "rewarded" && (
                        <Text style={styles.rewardText}>+{formatRupees(r.rewardPaise)}</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}

            <Text style={[styles.consent, { color: colors.mutedForeground }]}>
              By joining referral program, I consent to HireMind's{" "}
              <Text style={{ color: colors.primary }} onPress={() => setTermsOpen(true)}>
                Terms & Conditions
              </Text>
            </Text>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={shareInvite}
          disabled={!data}
          style={({ pressed }) => [styles.shareBtn, { backgroundColor: colors.primary }, !data && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.shareText}>Share Invite</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      </View>

      <Modal visible={termsOpen} transparent animationType="fade" onRequestClose={() => setTermsOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.dialog, { backgroundColor: colors.card }]}>
            <Text style={[styles.dialogTitle, { color: colors.foreground }]}>Referral Terms</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              <Text style={[styles.terms, { color: colors.foreground }]}>
                {"• Share Invite only opens your phone's share menu. You choose who receives the message. HireMind does not read your contacts.\n\n"}
                {`• A referral counts when a NEW company signs up using your code. You cannot use your own code.\n\n`}
                {`• The reward (${reward || "the reward amount"}) is paid once per referred company, after that company buys its first plan of ${minPurchase || "the minimum amount"} or more (before GST).\n\n`}
                {"• The reward is added to your COMPANY's wallet and can be used to pay for HireMind plans. It is not paid out as cash.\n\n"}
                {"• Each company can earn rewards for a limited number of referrals. Fake or duplicate sign-ups are not rewarded.\n\n"}
                {"• HireMind may change or end the referral program at any time."}
              </Text>
            </ScrollView>
            <Pressable onPress={() => setTermsOpen(false)} style={[styles.closeBtn, { backgroundColor: colors.primary }]}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24 },
  hero: { alignSelf: "center", width: 150, height: 120, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  heroIcon: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center" },
  coin: {
    position: "absolute", right: 6, bottom: 6, width: 46, height: 46, borderRadius: 23, backgroundColor: "#FACC15",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  coinText: { color: "#B91C1C", fontSize: 24, fontFamily: "Inter_700Bold" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 10 },
  sub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 18 },
  retry: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10 },
  offer: {
    flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 14, borderRadius: 12, marginBottom: 14,
    backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FCD34D",
  },
  offerText: { flex: 1, color: "#92400E", fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 19 },
  codeCard: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 14 },
  codeLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6 },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  code: { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: 3 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  codeHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8, lineHeight: 17 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  listTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 },
  empty: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  rowName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  rewardText: { color: "#16A34A", fontSize: 13, fontFamily: "Inter_700Bold" },
  consent: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 24, marginTop: 20 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 8, paddingVertical: 16 },
  shareText: { color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  dialog: { borderRadius: 14, padding: 22 },
  dialogTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 14 },
  terms: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  closeBtn: { marginTop: 18, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  closeText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});