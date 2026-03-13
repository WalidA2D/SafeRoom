import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch, clearToken, getToken, setToken } from "../services/api";

const GUEST_CHOICE_KEY = "@saferoom/guest";
const GUEST_QUOTA_KEY = "@saferoom/guest_quota";
const PLAN_KEY = "@saferoom/plan";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export type PlanType = "visitor" | "free" | "premium";

type BackendProfile = {
  uid: string;
  email: string | null;
  accountType?: PlanType;
  plan?: PlanType;
  isPremium?: boolean;
  scansUsedToday?: number;
  scanQuotaPerDay?: number;
  lastQuotaResetDate?: string | null;
};

type SessionUser = {
  uid: string;
  email: string | null;
};

interface AuthState {
  plan: PlanType;
  userId: string | null;
  userEmail: string | null;
  scansToday: number;
  lastResetDate: string | null;
  scanLimit: number;
  isHydrated: boolean;
  hasRestoredGuest: boolean;
  setPlan: (plan: PlanType) => Promise<void>;
  setGuestQuota: (scansToday: number, lastResetDate: string) => void;
  incrementScans: () => void;
  canScan: () => boolean;
  dailyLimit: () => number;
  hydrateFromStorage: () => Promise<boolean>;
  startGuestSession: () => Promise<void>;
  persistGuestQuota: () => Promise<void>;
  updateProfileFromServer: () => Promise<BackendProfile | null>;
  signUp: (email: string, password: string, displayName: string) => Promise<SessionUser>;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  clearGuestAndReset: () => Promise<void>;
}

function planFromProfile(profile: BackendProfile | null | undefined): PlanType {
  if (!profile) return "visitor";
  if (profile.plan === "premium" || profile.accountType === "premium" || profile.isPremium) {
    return "premium";
  }
  if (profile.plan === "free" || profile.accountType === "free") {
    return "free";
  }
  return "visitor";
}

function fallbackLimit(plan: PlanType): number {
  if (plan === "visitor") return 1;
  if (plan === "free") return 5;
  return 999;
}

function syncProfile(profile: BackendProfile, set: (partial: Partial<AuthState>) => void) {
  const plan = planFromProfile(profile);
  set({
    plan,
    userId: profile.uid ?? null,
    userEmail: profile.email ?? null,
    scansToday: typeof profile.scansUsedToday === "number" ? profile.scansUsedToday : 0,
    lastResetDate: profile.lastQuotaResetDate ?? todayISO(),
    scanLimit:
      typeof profile.scanQuotaPerDay === "number" ? profile.scanQuotaPerDay : fallbackLimit(plan),
    hasRestoredGuest: false,
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  plan: "visitor",
  userId: null,
  userEmail: null,
  scansToday: 0,
  lastResetDate: null,
  scanLimit: 1,
  isHydrated: false,
  hasRestoredGuest: false,

  setPlan: async (plan) => {
    if (plan === "visitor") {
      set({ plan: "visitor", scanLimit: 1 });
      await AsyncStorage.setItem(PLAN_KEY, "visitor");
      return;
    }

    const response = await apiFetch<{ profile?: BackendProfile }>(
      plan === "premium" ? "/premium/activate" : "/premium/cancel",
      { method: "POST" }
    );

    if (response.ok && response.data?.profile) {
      syncProfile(response.data.profile, set);
      await AsyncStorage.setItem(PLAN_KEY, planFromProfile(response.data.profile));
      return;
    }

    set({ plan, scanLimit: fallbackLimit(plan) });
    await AsyncStorage.setItem(PLAN_KEY, plan);
  },

  setGuestQuota: (scansToday, lastResetDate) =>
    set({ scansToday, lastResetDate, scanLimit: 1, plan: "visitor" }),

  incrementScans: () =>
    set((state) => ({
      scansToday: state.scansToday + 1,
    })),

  canScan: () => get().scansToday < get().dailyLimit(),

  dailyLimit: () => {
    const { plan, scanLimit } = get();
    if (plan === "visitor") return 1;
    return scanLimit || fallbackLimit(plan);
  },

  hydrateFromStorage: async () => {
    try {
      const [guestChoice, token] = await Promise.all([
        AsyncStorage.getItem(GUEST_CHOICE_KEY),
        getToken(),
      ]);

      if (guestChoice === "true") {
        const raw = await AsyncStorage.getItem(GUEST_QUOTA_KEY);
        const today = todayISO();
        let scansToday = 0;
        let lastResetDate: string | null = today;

        if (raw) {
          try {
            const data = JSON.parse(raw) as { scansToday: number; lastResetDate: string };
            if (data.lastResetDate === today) {
              scansToday = data.scansToday;
              lastResetDate = data.lastResetDate;
            } else {
              await AsyncStorage.setItem(
                GUEST_QUOTA_KEY,
                JSON.stringify({ scansToday: 0, lastResetDate: today })
              );
            }
          } catch {
            await AsyncStorage.setItem(
              GUEST_QUOTA_KEY,
              JSON.stringify({ scansToday: 0, lastResetDate: today })
            );
          }
        }

        set({
          plan: "visitor",
          userId: null,
          userEmail: null,
          scansToday,
          lastResetDate,
          scanLimit: 1,
          isHydrated: true,
          hasRestoredGuest: true,
        });
      }

      if (token) {
        const profile = await get().updateProfileFromServer();
        set({ isHydrated: true });
        return profile !== null;
      }

      if (guestChoice !== "true") {
        set({
          plan: "visitor",
          userId: null,
          userEmail: null,
          scansToday: 0,
          lastResetDate: null,
          scanLimit: 1,
          isHydrated: true,
          hasRestoredGuest: false,
        });
      }

      return true;
    } catch {
      set({ isHydrated: true });
      return false;
    }
  },

  startGuestSession: async () => {
    const today = todayISO();
    await clearToken();
    await AsyncStorage.setItem(GUEST_CHOICE_KEY, "true");
    await AsyncStorage.removeItem(PLAN_KEY);

    const raw = await AsyncStorage.getItem(GUEST_QUOTA_KEY);
    if (raw) {
      try {
        const data = JSON.parse(raw) as { scansToday: number; lastResetDate: string };
        if (data.lastResetDate === today) {
          set({
            plan: "visitor",
            userId: null,
            userEmail: null,
            scansToday: data.scansToday,
            lastResetDate: today,
            scanLimit: 1,
            hasRestoredGuest: true,
          });
          return;
        }
      } catch {
        // ignore
      }
    }

    set({
      plan: "visitor",
      userId: null,
      userEmail: null,
      scansToday: 0,
      lastResetDate: today,
      scanLimit: 1,
      hasRestoredGuest: true,
    });
    await AsyncStorage.setItem(
      GUEST_QUOTA_KEY,
      JSON.stringify({ scansToday: 0, lastResetDate: today })
    );
  },

  persistGuestQuota: async () => {
    const { plan, scansToday, lastResetDate } = get();
    if (plan !== "visitor" || !lastResetDate) return;

    try {
      await AsyncStorage.setItem(
        GUEST_QUOTA_KEY,
        JSON.stringify({ scansToday, lastResetDate })
      );
    } catch {
      // ignore
    }
  },

  updateProfileFromServer: async () => {
    try {
      const response = await apiFetch<{ profile: BackendProfile }>("/auth/me", { method: "GET" });
      if (!response.ok || !response.data?.profile) {
        return null;
      }

      const profile = response.data.profile;
      syncProfile(profile, set);
      await AsyncStorage.removeItem(GUEST_CHOICE_KEY);
      await AsyncStorage.setItem(PLAN_KEY, planFromProfile(profile));

      return profile;
    } catch {
      return null;
    }
  },

  signUp: async (email, password, displayName) => {
    const response = await apiFetch<{ idToken?: string; token?: string; profile?: BackendProfile }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ email, password, displayName }),
      }
    );

    if (!response.ok) {
      throw new Error(response.error || "Impossible de creer le compte");
    }

    const token = response.data?.idToken ?? response.data?.token;
    if (!token) {
      throw new Error("Le serveur n'a pas retourne de session valide");
    }

    await setToken(token);

    const profile = response.data?.profile ?? (await get().updateProfileFromServer());
    if (!profile) {
      throw new Error("Le profil utilisateur n'a pas pu etre recupere");
    }

    return {
      uid: profile.uid,
      email: profile.email ?? email,
    };
  },

  signIn: async (email, password) => {
    const response = await apiFetch<{ idToken?: string; token?: string; profile?: BackendProfile }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }
    );

    if (!response.ok) {
      throw new Error(response.error || "Impossible de se connecter");
    }

    const token = response.data?.idToken ?? response.data?.token;
    if (!token) {
      throw new Error("Le serveur n'a pas retourne de session valide");
    }

    await setToken(token);

    const profile = response.data?.profile ?? (await get().updateProfileFromServer());
    if (!profile) {
      throw new Error("Le profil utilisateur n'a pas pu etre recupere");
    }

    return {
      uid: profile.uid,
      email: profile.email ?? email,
    };
  },

  signOut: async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }

    await clearToken();
    await AsyncStorage.removeItem(PLAN_KEY);

    set({
      plan: "visitor",
      userId: null,
      userEmail: null,
      scansToday: 0,
      lastResetDate: null,
      scanLimit: 1,
      hasRestoredGuest: false,
    });
  },

  clearGuestAndReset: async () => {
    try {
      await AsyncStorage.removeItem(GUEST_CHOICE_KEY);
      await AsyncStorage.removeItem(PLAN_KEY);
    } catch {
      // ignore
    }

    set({
      plan: "visitor",
      userId: null,
      userEmail: null,
      scansToday: 0,
      lastResetDate: null,
      scanLimit: 1,
      hasRestoredGuest: false,
    });
  },
}));
