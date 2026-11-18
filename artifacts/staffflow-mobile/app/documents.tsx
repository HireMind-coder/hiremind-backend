import { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Linking, Alert, Modal, ActivityIndicator, RefreshControl,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

type DocRow = {
  id: number;
  docType: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: "pending" | "verified" | "rejected";
  uploadedBy: "employee" | "admin";
  createdAt: string;
};

const STATUS: Record<DocRow["status"], { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "#D97706", bg: "#FEF3C7" },
  verified: { label: "Verified", color: "#16A34A", bg: "#DCFCE7" },
  rejected: { label: "Rejected", color: "#DC2626", bg: "#FEE2E2" },
};

const MAX_BYTES = 8 * 1024 * 1024;

function errText(e: any): string {
  return e?.data?.error ?? e?.message ?? "Something went wrong. Please try again.";
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function DocumentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  // Employees open this screen for themselves. An admin opens it for one employee (employeeId + name are passed).
  const { employeeId, name } = useLocalSearchParams<{ employeeId?: string; name?: string }>();
  const adminView = !!employeeId;

  const listKey = ["documents", adminView ? employeeId : "me"];

  const [typeOpen, setTypeOpen] = useState(false); // "Please select document type"
  const [typeListOpen, setTypeListOpen] = useState(false); // the dropdown list
  const [uploadOpen, setUploadOpen] = useState(false); // "Upload <type>"
  const [selectedType, setSelectedType] = useState("Aadhar");
  const [openingId, setOpeningId] = useState<number | null>(null);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: listKey,
    queryFn: () => customFetch<DocRow[]>(`/api/documents${adminView ? `?employeeId=${employeeId}` : ""}`),
    throwOnError: false,
  });

  const typesQ = useQuery({
    queryKey: ["document-types"],
    queryFn: () => customFetch<string[]>("/api/documents/types"),
    staleTime: 10 * 60 * 1000,
    throwOnError: false,
  });
  const types = typesQ.data ?? ["Aadhar"];

  const upload = useMutation({
    mutationFn: (file: { fileName: string; fileBase64: string }) =>
      customFetch("/api/documents", {
        method: "POST",
        body: JSON.stringify({
          employeeId: adminView ? Number(employeeId) : undefined,
          docType: selectedType,
          ...file,
        }),
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: listKey });
      Alert.alert("Uploaded", `${selectedType} was added.`);
    },
    onError: (e) => Alert.alert("Could not upload", errText(e)),
    throwOnError: false,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: DocRow["status"] }) =>
      customFetch(`/api/documents/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
    onError: (e) => Alert.alert("Could not update", errText(e)),
    throwOnError: false,
  });

  const remove = useMutation({
    mutationFn: (id: number) => customFetch(`/api/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
    onError: (e) => Alert.alert("Could not delete", errText(e)),
    throwOnError: false,
  });

  const confirmDelete = (d: DocRow) =>
    Alert.alert("Delete document?", `${d.docType} (${d.fileName}) will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate(d.id) },
    ]);

  // Opens the file in the browser through a short-lived signed link (documents are private)
  const openDoc = async (d: DocRow) => {
    setOpeningId(d.id);
    try {
      const res = await customFetch<{ url: string }>(`/api/documents/${d.id}/link`, { method: "POST" });
      await Linking.openURL(res.url);
    } catch (e) {
      Alert.alert("Could not open document", errText(e));
    } finally {
      setOpeningId(null);
    }
  };

  // Let the sheet close before the camera / picker opens (avoids glitches)
  const closeSheetThen = (fn: () => void) => {
    setUploadOpen(false);
    setTimeout(fn, 300);
  };

  const fromCamera = () =>
    closeSheetThen(async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Camera permission needed", "Allow camera access to take a picture of your document.");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
      const asset = res.assets?.[0];
      if (res.canceled || !asset?.base64) return;
      upload.mutate({ fileName: `${selectedType}.jpg`, fileBase64: asset.base64 });
    });

  const fromGallery = () =>
    closeSheetThen(async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, base64: true });
      const asset = res.assets?.[0];
      if (res.canceled || !asset?.base64) return;
      upload.mutate({ fileName: asset.fileName ?? `${selectedType}.jpg`, fileBase64: asset.base64 });
    });

  const fromFile = () =>
    closeSheetThen(async () => {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      const asset = res.assets?.[0];
      if (res.canceled || !asset) return;
      if (asset.size && asset.size > MAX_BYTES) {
        Alert.alert("File too large", "Please choose a file smaller than 8 MB.");
        return;
      }
      try {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: "base64" as FileSystem.EncodingType,
        });
        upload.mutate({ fileName: asset.name, fileBase64: base64 });
      } catch {
        Alert.alert("Could not read the file", "Please try a different file.");
      }
    });

  const title = adminView ? `${name ?? "Employee"}'s Documents` : "My Documents";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title }} />

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: insets.bottom + 110, gap: 10 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No documents found</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                You can add documents here like Aadhaar, PAN etc.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const s = STATUS[item.status];
            const isPdf = item.mimeType === "application/pdf";
            const canDelete = adminView || item.status !== "verified";
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Pressable onPress={() => openDoc(item)} style={styles.cardMain}>
                  <View style={[styles.fileIcon, { backgroundColor: isPdf ? "#FEE2E2" : "#DBEAFE" }]}>
                    {openingId === item.id ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Ionicons
                        name={isPdf ? "document-text-outline" : "image-outline"}
                        size={24}
                        color={isPdf ? "#DC2626" : "#2563EB"}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.docType, { color: colors.foreground }]}>{item.docType}</Text>
                    <Text style={[styles.docMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.fileName} · {formatSize(item.sizeBytes)}
                    </Text>
                    <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>
                      {formatDate(item.createdAt)}
                      {item.uploadedBy === "admin" ? " · added by admin" : ""}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
                  </View>
                </Pressable>

                {(adminView || canDelete) && (
                  <View style={[styles.actions, { borderTopColor: colors.border }]}>
                    {adminView && item.status !== "verified" && (
                      <Pressable onPress={() => setStatus.mutate({ id: item.id, status: "verified" })} hitSlop={6}>
                        <Text style={[styles.actionText, { color: "#16A34A" }]}>Verify</Text>
                      </Pressable>
                    )}
                    {adminView && item.status !== "rejected" && (
                      <Pressable onPress={() => setStatus.mutate({ id: item.id, status: "rejected" })} hitSlop={6}>
                        <Text style={[styles.actionText, { color: "#D97706" }]}>Reject</Text>
                      </Pressable>
                    )}
                    {canDelete && (
                      <Pressable onPress={() => confirmDelete(item)} hitSlop={6} style={{ marginLeft: "auto" }}>
                        <Text style={[styles.actionText, { color: "#DC2626" }]}>Delete</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      <Pressable
        onPress={() => setTypeOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.primary, bottom: insets.bottom + 20 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Add Document</Text>
      </Pressable>

      {/* Step 1: pick the document type */}
      <Modal visible={typeOpen} transparent animationType="fade" onRequestClose={() => setTypeOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.dialog, { backgroundColor: colors.card }]}>
            <Text style={[styles.dialogTitle, { color: colors.foreground }]}>Please select document type</Text>
            <Pressable onPress={() => setTypeListOpen(true)} style={[styles.select, { borderColor: colors.border }]}>
              <Text style={{ flex: 1, color: colors.foreground, fontSize: 18, fontFamily: "Inter_500Medium" }}>{selectedType}</Text>
              <Ionicons name="caret-down" size={16} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              onPress={() => { setTypeOpen(false); setTimeout(() => setUploadOpen(true), 250); }}
              style={[styles.nextBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.nextText}>Next</Text>
            </Pressable>
            <Pressable onPress={() => setTypeOpen(false)} style={styles.closeBtn}>
              <Text style={[styles.closeText, { color: colors.mutedForeground }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* The dropdown list opens on top of step 1 */}
      <Modal visible={typeListOpen} transparent animationType="fade" onRequestClose={() => setTypeListOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setTypeListOpen(false)}>
          <View style={[styles.list, { backgroundColor: colors.card }]}>
            <FlatList
              data={types}
              keyExtractor={(t) => t}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setSelectedType(item); setTypeListOpen(false); }}
                  style={styles.listItem}
                >
                  <Text
                    style={{
                      color: colors.foreground,
                      fontSize: 17,
                      fontFamily: item === selectedType ? "Inter_700Bold" : "Inter_400Regular",
                    }}
                  >
                    {item}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Step 2: how to upload */}
      <Modal visible={uploadOpen} transparent animationType="fade" onRequestClose={() => setUploadOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setUploadOpen(false)}>
          <Pressable style={[styles.dialog, { backgroundColor: colors.card }]} onPress={() => {}}>
            <Text style={[styles.dialogTitle, { color: colors.foreground }]}>Upload {selectedType}</Text>
            {[
              { label: "Take a picture", onPress: fromCamera },
              { label: "Choose from gallery", onPress: fromGallery },
              { label: "Choose Document", onPress: fromFile },
            ].map((o) => (
              <Pressable key={o.label} onPress={o.onPress} style={styles.uploadOption}>
                <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_400Regular" }}>{o.label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Uploading… */}
      <Modal visible={upload.isPending} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.busy, { backgroundColor: colors.card }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Uploading…</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 24 },
  card: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  cardMain: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  fileIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  docType: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 2 },
  docMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  actions: { flexDirection: "row", alignItems: "center", gap: 22, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  actionText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fab: {
    position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 22, paddingVertical: 15, borderRadius: 30,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  fabText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  dialog: { borderRadius: 12, padding: 22 },
  dialogTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 18 },
  select: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 16 },
  nextBtn: { marginTop: 36, borderRadius: 8, paddingVertical: 16, alignItems: "center" },
  nextText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  closeBtn: { alignItems: "center", paddingTop: 18, paddingBottom: 6 },
  closeText: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  list: { borderRadius: 8, maxHeight: "80%", paddingVertical: 6 },
  listItem: { paddingHorizontal: 18, paddingVertical: 15 },
  uploadOption: { paddingVertical: 16 },
  busy: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 18 },
});