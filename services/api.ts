import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

const TOKEN_KEY = "@saferoom/token";
const DEFAULT_PORT = "4000";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function inferApiBaseUrl(): string {
  const explicitBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (explicitBaseUrl) {
    return stripTrailingSlash(explicitBaseUrl);
  }

  if (Platform.OS === "web") {
    const webLocation = (globalThis as {
      location?: { protocol: string; hostname: string };
    }).location;
    if (webLocation?.hostname) {
      return `${webLocation.protocol}//${webLocation.hostname}:${DEFAULT_PORT}/api/v1`;
    }
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:${DEFAULT_PORT}/api/v1`;
  }

  if (Platform.OS === "android") {
    return `http://10.0.2.2:${DEFAULT_PORT}/api/v1`;
  }

  return `http://localhost:${DEFAULT_PORT}/api/v1`;
}

export const API_BASE_URL = inferApiBaseUrl();

export async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export async function clearToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T; error?: string | null }> {
  try {
    const token = await getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    const text = await response.text();
    let data: any = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      error: data?.message || null,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      data: null as T,
      error: error?.message || "Unable to reach the backend",
    };
  }
}
