import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

type Props = {
  visible: boolean;
  /** Selected date as YYYY-MM-DD */
  value: string;
  /** Dates before this (YYYY-MM-DD) cannot be picked */
  minDate?: string;
  onSelect: (ymd: string) => void;
  onClose: () => void;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

export function DatePickerModal({ visible, value, minDate, onSelect, onClose }: Props) {
  const colors = useColors();
  const base = value ? new Date(`${value}T00:00:00`) : new Date();
  const [cursor, setCursor] = useState({ y: base.getFullYear(), m: base.getMonth() });

  // Open on the month of the selected date
  useEffect(() => {
    if (visible) {
      const d = value ? new Date(`${value}T00:00:00`) : new Date();
      setCursor({ y: d.getFullYear(), m: d.getMonth() });
    }
  }, [visible, value]);

  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  const title = new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
          <View style={styles.header}>
            <Pressable hitSlop={12} onPress={() => move(-1)}>
              <Ionicons name="chevron-back" size={22} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            <Pressable hitSlop={12} onPress={() => move(1)}>
              <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={styles.row}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[styles.weekday, { color: colors.mutedForeground }]}>{w}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (d == null) return <View key={i} style={styles.cell} />;
              const ymd = toYmd(cursor.y, cursor.m, d);
              const disabled = !!minDate && ymd < minDate;
              const selected = ymd === value;
              return (
                <Pressable
                  key={i}
                  disabled={disabled}
                  onPress={() => { onSelect(ymd); onClose(); }}
                  style={styles.cell}
                >
                  <View style={[styles.dayCircle, selected && { backgroundColor: colors.primary }]}>
                    <Text
                      style={[
                        styles.dayText,
                        { color: selected ? "#fff" : colors.foreground },
                        disabled && { color: colors.mutedForeground, opacity: 0.4 },
                      ]}
                    >
                      {d}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  row: { flexDirection: "row", marginBottom: 4 },
  weekday: { width: `${100 / 7}%`, textAlign: "center", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  cancel: { alignSelf: "flex-end", paddingHorizontal: 8, paddingTop: 12 },
});