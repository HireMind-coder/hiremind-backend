
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const colors = useColors();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}

    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
          <View style={styles.btnRow}>
            <Pressable
              style={[styles.btn, styles.cancelBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={onCancel}
            >
              <Text style={[styles.cancelText, { color: colors.foreground }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.confirmBtn, { backgroundColor: destructive ? "#DC2626" : colors.primary }]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  sheet: {
    width: "100%",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  message: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  btn: {
    flex: 1, height: 46, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  cancelBtn: { borderWidth: 1 },
  confirmBtn: {},
  cancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  confirmText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
