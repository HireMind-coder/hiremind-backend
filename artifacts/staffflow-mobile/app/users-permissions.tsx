import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
};

function Row({ icon, label, sublabel, onPress, colors }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.muted }]}>
        <Ionicons name={icon} size={22} color={colors.mutedForeground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>{sublabel}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function UsersPermissionsScreen() {
  const colors = useColors();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Row
        icon="shield-checkmark-outline"
        label="Admins"
        sublabel="People who can manage the whole company"
        colors={colors}
        onPress={() => router.push({ pathname: "/team-members", params: { kind: "admin" } })}
      />
      <Row
        icon="people-outline"
        label="Employee & Managers"
        sublabel="Set each employee's access level"
        colors={colors}
        onPress={() => router.push("/update-roles")}
      />
      <Row
        icon="calculator-outline"
        label="Chartered Accountant"
        sublabel="View-only access for your accountant"
        colors={colors}
        onPress={() => router.push({ pathname: "/team-members", params: { kind: "ca" } })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 16, borderWidth: 1, borderRadius: 14,
  },
  iconWrap: { width: 42, height: 42, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular" },
});