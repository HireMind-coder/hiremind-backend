import { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

type FeedType = "attendance" | "leave" | "task" | "payment";
type FeedItem = {
  id: string;
  type: FeedType;
  employeeId: number;
  employeeName: string;
  message: string;
  at: string; // "YYYY-MM-DD HH:mm" in the company's timezone
};
type FeedResponse = { items: FeedItem[]; hasMore: boolean; days: number };
type Staff = { id: number; name: string };

const TYPE_OPTIONS: { key: "all" | FeedType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "all", label: "All Notifications", icon: "notifications-outline" },
  { key: "attendance", label: "Attendance", icon: "calendar-outline" },
  { key: "leave", label: "Leave Request", icon: "briefcase-outline" },
  { key: "task", label: "Tasks", icon: "checkbox-outline" },
  { key: "payment", label: "Payments", icon: "cash-outline" },
];

const TYPE_STYLE: Record<FeedType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  attendance: { icon: "calendar", color: "#16A34A" },
  leave: { icon: "briefcase", color: "#D97706" },
  task: { icon: "checkbox", color: "#4F46E5" },
  payment: { icon: "cash", color: "#0D9488" },
};

const AVATAR_COLORS = ["#EF5A5A", "#F5A623", "#5B9EE9", "#8B5CF6", "#10B981", "#EC4899"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateLabel(at: string) {
  const [y, m, d] = at.slice(0, 10).split("-").map(Number);
  const label = `${MONTHS[m - 1]} ${d}`;
  return y === new Date().getFullYear() ? label : `${label}, ${y}`;
}

function timeLabel(at: string) {
  const [h, min] = at.slice(11, 16).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${suffix}`;
}

function errMsg(e: any, fallback = "Something went wrong") {
  return e?.data?.error ?? e?.message ?? fallback;
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<"all" | FeedType>("all");
  const [selected, setSelected] = useState<number[]>([]); // applied staff filter ([] = everyone)
  const [days, setDays] = useState(30);

  const [typeSheet, setTypeSheet] = useState(false);
  const [staffSheet, setStaffSheet] = useState(false);
  const [draft, setDraft] = useState<number[]>([]);
  const [staffSearch, setStaffSearch] = useState("");

  const staffQuery = useQuery({
    queryKey: ["team-staff"],
    queryFn: () => customFetch<Staff[]>("/api/employees"),
    throwOnError: false,
  });
  const staff = useMemo(
    () => [...(staffQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [staffQuery.data],
  );

  const allSelected = selected.length === 0 || (staff.length > 0 && selected.length === staff.length);
  const idsParam = allSelected ? "" : selected.join(",");

  const feed = useQuery({
    queryKey: ["notifications", type, idsParam, days],
    queryFn: () => {
      const params = new URLSearchParams();
      if (type !== "all") params.set("type", type);
      if (idsParam) params.set("employeeIds", idsParam);
      params.set("days", String(days));
      return customFetch<FeedResponse>(`/api/notifications?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
    throwOnError: false,
  });

  const typeLabel = TYPE_OPTIONS.find((o) => o.key === type)?.label ?? "All Notifications";
  const staffLabel = allSelected
    ? "All Employees"
    : selected.length === 1
      ? staff.find((s) => s.id === selected[0])?.name ?? "1 Employee"
      : `${selected.length} Employees`;

  const openStaffSheet = () => {
    setDraft(allSelected ? staff.map((s) => s.id) : selected);
    setStaffSearch("");
    setStaffSheet(true);
  };

  const visibleStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return q ? staff.filter((s) => s.name.toLowerCase().includes(q)) : staff;
  }, [staff, staffSearch]);

  const everyoneChecked = staff.length > 0 && draft.length === staff.length;
  const toggleAll = () => setDraft(everyoneChecked ? [] : staff.map((s) => s.id));
  const toggleOne = (id: number) =>
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  const applyStaff = () => {
    setSelected(draft.length === staff.length ? [] : draft);
    setStaffSheet(false);
  };

  const items = feed.data?.items ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Filters */}
      <View style={[styles.filters, { borderBottomColor: colors.border }]}>
        <Text style={[styles.filterTitle, { color: colors.mutedForeground }]}>Filters</Text>
        <Pressable
          onPress={() => setTypeSheet(true)}
          style={[styles.pill, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <Text style={[styles.pillText, { color: colors.foreground }]} numberOfLines={1}>{typeLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.foreground} />
        </Pressable>
        <Pressable
          onPress={openStaffSheet}
          style={[styles.pill, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <Text style={[styles.pillText, { color: colors.foreground }]} numberOfLines={1}>{staffLabel}</Text>
        </Pressable>
      </View>

      {/* Feed */}
      {feed.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : feed.error && !feed.data ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>{errMsg(feed.error)}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => feed.refetch()} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              No notifications in the last {feed.data?.days ?? days} days.
            </Text>
          }
          ListFooterComponent={
            days < 365 ? (
              <Pressable onPress={() => setDays((d) => Math.min(d + 30, 365))} style={styles.more}>
                <Text style={[styles.moreText, { color: colors.primary }]}>
                  Show older (currently last {feed.data?.days ?? days} days)
                </Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            const ts = TYPE_STYLE[item.type];
            return (
              <View style={[styles.row, { borderBottomColor: colors.border }]}>
                <View>
                  <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[item.employeeId % AVATAR_COLORS.length] + "33" }]}>
                    <Text style={[styles.avatarText, { color: AVATAR_COLORS[item.employeeId % AVATAR_COLORS.length] }]}>
                      {item.employeeName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: ts.color, borderColor: colors.background }]}>
                    <Ionicons name={ts.icon} size={10} color="#fff" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.message, { color: colors.foreground }]}>{item.message}</Text>
                  <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeLabel(item.at)}</Text>
                </View>
                <Text style={[styles.date, { color: colors.mutedForeground }]}>{dateLabel(item.at)}</Text>
              </View>
            );
          }}
        />
      )}

      {/* Select Notification Type */}
      <Modal visible={typeSheet} transparent animationType="slide" onRequestClose={() => setTypeSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setTypeSheet(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Select Notification Type</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {TYPE_OPTIONS.map((o) => {
            const on = type === o.key;
            return (
              <Pressable
                key={o.key}
                style={styles.optRow}
                onPress={() => {
                  setType(o.key);
                  setTypeSheet(false);
                }}
              >
                <Ionicons name={o.icon} size={24} color={colors.foreground} />
                <Text style={[styles.optLabel, { color: colors.foreground }]}>{o.label}</Text>
                <View style={[styles.radio, { borderColor: on ? colors.primary : colors.mutedForeground }]}>
                  {on && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Modal>

      {/* Select Staff */}
      <Modal visible={staffSheet} transparent animationType="slide" onRequestClose={() => setStaffSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setStaffSheet(false)} />
        <View style={[styles.sheet, styles.staffSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Select Staff</Text>

          <View style={[styles.search, { borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.mutedForeground} />
            <TextInput
              value={staffSearch}
              onChangeText={setStaffSearch}
              placeholder="Search employee"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.searchInput, { color: colors.foreground }]}
            />
          </View>

          <Pressable style={styles.checkRow} onPress={toggleAll}>
            <Text style={[styles.selectAll, { color: colors.foreground }]}>Select All Employees</Text>
            <Ionicons
              name={everyoneChecked ? "checkbox" : "square-outline"}
              size={26}
              color={everyoneChecked ? colors.primary : colors.mutedForeground}
            />
          </Pressable>

          <FlatList
            data={visibleStaff}
            keyExtractor={(s) => String(s.id)}
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0, maxHeight: 360 }}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.mutedForeground, marginTop: 20 }]}>No employees found.</Text>}
            renderItem={({ item }) => {
              const on = draft.includes(item.id);
              return (
                <Pressable style={styles.checkRow} onPress={() => toggleOne(item.id)}>
                  <View style={[styles.smallAvatar, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.smallAvatarText, { color: colors.foreground }]}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.staffName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
                  <Ionicons
                    name={on ? "checkbox" : "square-outline"}
                    size={26}
                    color={on ? colors.primary : colors.mutedForeground}
                  />
                </Pressable>
              );
            }}
          />

          <Pressable
            onPress={applyStaff}
            disabled={draft.length === 0}
            style={[styles.apply, { backgroundColor: colors.primary, opacity: draft.length === 0 ? 0.45 : 1 }]}
          >
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  filterTitle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 9, maxWidth: 190,
  },
  pillText: { fontSize: 14, fontFamily: "Inter_500Medium", flexShrink: 1 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14, fontFamily: "Inter_400Regular", paddingHorizontal: 24 },
  more: { alignItems: "center", paddingVertical: 18 },
  moreText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  row: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  badge: {
    position: "absolute", right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, alignItems: "center", justifyContent: "center",
  },
  message: { fontSize: 15, fontFamily: "Inter_600SemiBold", lineHeight: 21 },
  time: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 3 },
  date: { fontSize: 13, fontFamily: "Inter_400Regular" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10 },
  staffSheet: { maxHeight: "88%" },
  handle: { alignSelf: "center", width: 48, height: 5, borderRadius: 3, marginBottom: 14 },
  sheetTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 14 },
  divider: { height: 1, marginBottom: 6 },
  optRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14 },
  optLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  search: {
    flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 14, marginBottom: 8,
  },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  selectAll: { flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold" },
  smallAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  smallAvatarText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  staffName: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  apply: { borderRadius: 8, paddingVertical: 15, alignItems: "center", marginTop: 12 },
  applyText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});