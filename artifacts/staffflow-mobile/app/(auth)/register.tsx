import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

interface FormErrors {
  name?: string;
  companyName?: string;
  email?: string;
  password?: string;
}

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const registerMutation = useRegister();

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!name || name.length < 2) e.name = "Name required";
    if (!companyName || companyName.length < 2) e.companyName = "Company name required";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email";
    if (!password || password.length < 6) e.password = "Min 6 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    registerMutation.mutate(
      { data: { name, email, password, companyName } },
      {
        onSuccess: async (response) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await login(response.token, response.user as any);
          router.replace("/(tabs)/");
        },
        onError: (err: any) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert("Registration failed", err?.data?.error || "Something went wrong");
        },
      }
    );
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scroll,
        {
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          paddingBottom: insets.bottom + 24,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Back button */}
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color="#0F1729" />
      </Pressable>

      {/* Logo */}
      <View style={styles.logo}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>HM</Text>
        </View>
        <Text style={styles.appName}>HireMind</Text>
      </View>

      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>Set up HireMind for your organization</Text>

      <View style={styles.form}>
        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Your name</Text>
          <View style={[styles.inputRow, errors.name ? styles.inputError : null]}>
            <Ionicons name="person-outline" size={18} color="#6B7280" style={styles.icon} />
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: undefined })); }}
              placeholder="Amit Kumar"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
              returnKeyType="next"
              testID="input-name"
            />
          </View>
          {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
        </View>

        {/* Company */}
        <View style={styles.field}>
          <Text style={styles.label}>Company name</Text>
          <View style={[styles.inputRow, errors.companyName ? styles.inputError : null]}>
            <Ionicons name="business-outline" size={18} color="#6B7280" style={styles.icon} />
            <TextInput
              style={styles.input}
              value={companyName}
              onChangeText={(v) => { setCompanyName(v); setErrors((e) => ({ ...e, companyName: undefined })); }}
              placeholder="TechCo Pvt Ltd"
              placeholderTextColor="#9CA3AF"
              returnKeyType="next"
              testID="input-company"
            />
          </View>
          {errors.companyName ? <Text style={styles.errorText}>{errors.companyName}</Text> : null}
        </View>

        {/* Email */}
        <View style={styles.field}>
          <Text style={styles.label}>Work email</Text>
          <View style={[styles.inputRow, errors.email ? styles.inputError : null]}>
            <Ionicons name="mail-outline" size={18} color="#6B7280" style={styles.icon} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: undefined })); }}
              placeholder="you@company.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
              testID="input-email"
            />
          </View>
          {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
        </View>

        {/* Password */}
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={[styles.inputRow, errors.password ? styles.inputError : null]}>
            <Ionicons name="lock-closed-outline" size={18} color="#6B7280" style={styles.icon} />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={(v) => { setPassword(v); setErrors((e) => ({ ...e, password: undefined })); }}
              placeholder="Min 6 characters"
              placeholderTextColor="#9CA3AF"
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              testID="input-password"
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={18} color="#6B7280" />
            </Pressable>
          </View>
          {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
        </View>

        <Pressable
          style={({ pressed }) => [styles.submitBtn, pressed && styles.submitPressed, registerMutation.isPending && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={registerMutation.isPending}
          testID="button-submit"
        >
          {registerMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.submitText}>Create account</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.footerLink}>Sign in</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F6F7F9",
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 28,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#576DFA",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  appName: {
    color: "#0F1729",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  title: {
    color: "#0F1729",
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  subtitle: {
    color: "#6B7280",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 28,
  },
  form: {
    gap: 14,
    marginBottom: 24,
  },
  field: {
    gap: 6,
  },
  label: {
    color: "#0F1729",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DFE2E7",
    paddingHorizontal: 12,
    height: 48,
  },
  inputError: {
    borderColor: "#EF4444",
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: "#0F1729",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  eyeBtn: {
    padding: 4,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  submitBtn: {
    backgroundColor: "#576DFA",
    borderRadius: 12,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  submitPressed: { opacity: 0.85 },
  submitDisabled: { opacity: 0.6 },
  submitText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
  },
  footerText: {
    color: "#6B7280",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  footerLink: {
    color: "#576DFA",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
