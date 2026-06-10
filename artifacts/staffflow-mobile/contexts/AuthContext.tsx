import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, AppState } from "react-native";
import { setAuthTokenGetter, getMe } from "@workspace/api-client-react";

const TOKEN_KEY     = "staffflow_token";
const USER_KEY      = "staffflow_user";
const EMP_TOKEN_KEY = "staffflow_emp_token";
const EMP_USER_KEY  = "staffflow_emp_user";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  companyName: string;
  createdAt: string;
  employeeId?: number;
  adminId?: number;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Token: SecureStore ────────────────────────────────────────────────────
async function saveToken(token: string, key = TOKEN_KEY) {
  try {
    if (Platform.OS === "web") localStorage.setItem(key, token);
    else await SecureStore.setItemAsync(key, token);
  } catch (e) { console.warn("saveToken error:", e); }
}

async function loadToken(key = TOKEN_KEY): Promise<string | null> {
  try {
    if (Platform.OS === "web") return localStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch (e) { console.warn("loadToken error:", e); return null; }
}

async function deleteToken(key = TOKEN_KEY) {
  try {
    if (Platform.OS === "web") localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch (e) { console.warn("deleteToken error:", e); }
}

// ─── User: AsyncStorage ────────────────────────────────────────────────────
async function saveUser(user: AuthUser, key = USER_KEY) {
  try {
    const str = JSON.stringify(user);
    if (Platform.OS === "web") localStorage.setItem(key, str);
    else await AsyncStorage.setItem(key, str);
  } catch (e) { console.warn("saveUser error:", e); }
}

async function loadUser(key = USER_KEY): Promise<AuthUser | null> {
  try {
    let str: string | null = null;
    if (Platform.OS === "web") str = localStorage.getItem(key);
    else str = await AsyncStorage.getItem(key);
    if (str) {
      const u = JSON.parse(str);
      return u;
    }
    return null;
  } catch (e) { console.warn("loadUser error:", e); return null; }
}

async function deleteUser(key = USER_KEY) {
  try {
    if (Platform.OS === "web") localStorage.removeItem(key);
    else await AsyncStorage.removeItem(key);
  } catch (e) { console.warn("deleteUser error:", e); }
}

// ─── Token decode ──────────────────────────────────────────────────────────
function decodeToken(token: string): any {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded  = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json    = Platform.OS === "web"
      ? decodeURIComponent(globalThis.atob(padded).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""))
      : globalThis.atob(padded);
    return JSON.parse(json);
  } catch (e) { console.warn("decodeToken error:", e); return null; }
}

function isTokenExpired(payload: any): boolean {
  if (!payload?.exp) return false;
  return payload.exp * 1000 < Date.now();
}

// ─── Context ───────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const bootstrapDone = useRef(false);

  useEffect(() => {
    // Token getter checks both admin and employee keys
    setAuthTokenGetter(async () => {
      const empToken = await loadToken(EMP_TOKEN_KEY);
      if (empToken) return empToken;
      return loadToken(TOKEN_KEY);
    });
    bootstrap();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && bootstrapDone.current && !user) {
        silentRestore();
      }
    });
    return () => sub.remove();
  }, [user]);

  async function silentRestore() {
    // Try employee first, then admin
    const empToken = await loadToken(EMP_TOKEN_KEY);
    if (empToken) {
      const payload = decodeToken(empToken);
      if (payload && !isTokenExpired(payload)) {
        const savedUser = await loadUser(EMP_USER_KEY);
        if (savedUser) { setUser(savedUser); return; }
      }
    }
    const token = await loadToken(TOKEN_KEY);
    if (!token) return;
    const payload = decodeToken(token);
    if (!payload || isTokenExpired(payload)) return;
    const savedUser = await loadUser(USER_KEY);
    if (savedUser) setUser(savedUser);
  }

  async function bootstrap() {
    try {
      // ── Check employee token FIRST ──────────────────────────────────────
      const empToken = await loadToken(EMP_TOKEN_KEY);

      if (empToken) {
        const payload = decodeToken(empToken);

        if (payload && !isTokenExpired(payload) && payload.role === "employee") {
          const savedEmpUser = await loadUser(EMP_USER_KEY);

          if (savedEmpUser && savedEmpUser.role === "employee") {
            setUser(savedEmpUser);
            setAuthTokenGetter(async () => empToken);
            setIsLoading(false);
            bootstrapDone.current = true;
            return;
          }

          // Rebuild from token
          const empUser: AuthUser = {
            id:          Number(payload.employeeId || payload.id || 0),
            name:        payload.name  || "Employee",
            email:       payload.email || "",
            role:        "employee",
            companyName: "",
            createdAt:   new Date().toISOString(),
            employeeId:  Number(payload.employeeId || payload.id || 0),
            adminId:     payload.adminId ? Number(payload.adminId) : undefined,
          };
          setUser(empUser);
          await saveUser(empUser, EMP_USER_KEY);
          setAuthTokenGetter(async () => empToken);
          setIsLoading(false);
          bootstrapDone.current = true;
          return;
        }

        // Employee token expired/invalid — clear it
        await deleteToken(EMP_TOKEN_KEY);
        await deleteUser(EMP_USER_KEY);
      }

      // ── Check admin token ───────────────────────────────────────────────
      const token = await loadToken(TOKEN_KEY);
      if (!token) {
        setIsLoading(false);
        bootstrapDone.current = true;
        return;
      }

      const payload = decodeToken(token);
      if (!payload || isTokenExpired(payload)) {
        await deleteToken(TOKEN_KEY);
        await deleteUser(USER_KEY);
        setIsLoading(false);
        bootstrapDone.current = true;
        return;
      }

      const savedUser = await loadUser(USER_KEY);
      if (savedUser && savedUser.role !== "employee") {
        setUser(savedUser);
        setIsLoading(false);
        bootstrapDone.current = true;
        // Background verify
        getMe().then(async (freshData) => {
          setUser(freshData as AuthUser);
          await saveUser(freshData as AuthUser, USER_KEY);
        }).catch((e) => console.log("Admin refresh failed:", e));
        return;
      }

      // No saved admin user — fetch via getMe()
      try {
        const userData = await getMe();
        setUser(userData as AuthUser);
        await saveUser(userData as AuthUser, USER_KEY);
      } catch (e) {
        console.warn("❌ getMe() failed:", e);
        await deleteToken(TOKEN_KEY);
        await deleteUser(USER_KEY);
      }

    } catch (e) {
      console.warn("bootstrap error:", e);
    } finally {
      setIsLoading(false);
      bootstrapDone.current = true;
    }
  }

  const login = async (token: string, userData: AuthUser) => {
    const tokenStr = typeof token === "string" ? token : String(token);
    const normalizedUser: AuthUser = {
      ...userData,
      id:          Number(userData.id || (userData as any).employeeId || 0),
      role:        userData.role        || "employee",
      companyName: userData.companyName || "",
      createdAt:   userData.createdAt   || new Date().toISOString(),
    };

    if (normalizedUser.role === "employee") {
      // Save to employee-specific keys — never mixes with admin
      await saveToken(tokenStr, EMP_TOKEN_KEY);
      await saveUser(normalizedUser, EMP_USER_KEY);
      setAuthTokenGetter(async () => tokenStr);
      const check = await loadUser(EMP_USER_KEY);
    } else {
      // Save to admin keys
      await saveToken(tokenStr, TOKEN_KEY);
      await saveUser(normalizedUser, USER_KEY);
      setAuthTokenGetter(async () => tokenStr);
      const check = await loadUser(USER_KEY);
    }

    setUser(normalizedUser);
  };

  const logout = async () => {
    // Clear both admin and employee storage
    await deleteToken(TOKEN_KEY);
    await deleteToken(EMP_TOKEN_KEY);
    await deleteUser(USER_KEY);
    await deleteUser(EMP_USER_KEY);
    setAuthTokenGetter(async () => null);
    setUser(null);
    bootstrapDone.current = false;
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}