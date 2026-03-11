import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const GUEST_CHOICE_KEY = "@saferoom/guest";
const GUEST_QUOTA_KEY = "@saferoom/guest_quota";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export type PlanType = "visitor" | "free" | "premium";

interface AuthState {
  plan: PlanType;
  scansToday: number;
  lastResetDate: string | null;
  isHydrated: boolean;
  /** true quand on a restauré une session invité depuis AsyncStorage */
  hasRestoredGuest: boolean;
  setPlan: (plan: PlanType) => void;
  setGuestQuota: (scansToday: number, lastResetDate: string) => void;
  incrementScans: () => void;
  canScan: () => boolean;
  dailyLimit: () => number;
  /** À appeler au démarrage : restaure invité + quota depuis l’appareil */
  hydrateFromStorage: () => Promise<boolean>;
  /** Passe en mode invité et persiste le choix + quota initial */
  startGuestSession: () => Promise<void>;
  /** Persiste le quota invité (à appeler après incrementScans en mode invité) */
  persistGuestQuota: () => Promise<void>;
  /** Déconnexion : efface le choix invité uniquement (le quota reste par appareil). */
  clearGuestAndReset: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  plan: "visitor",
  scansToday: 0,
  lastResetDate: null,
  isHydrated: false,
  hasRestoredGuest: false,

  setPlan: (plan) => set({ plan }),

  setGuestQuota: (scansToday, lastResetDate) =>
    set({ scansToday, lastResetDate }),

  incrementScans: () =>
    set((s) => ({ scansToday: s.scansToday + 1 })),

  canScan: () => get().scansToday < get().dailyLimit(),

  dailyLimit: () => {
    const plan = get().plan;
    if (plan === "visitor") return 1;
    if (plan === "free") return 5;
    return 999;
  },

  hydrateFromStorage: async () => {
    try {
      const guest = await AsyncStorage.getItem(GUEST_CHOICE_KEY);
      if (guest === "true") {
        const raw = await AsyncStorage.getItem(GUEST_QUOTA_KEY);
        const today = todayISO();
        let scansToday = 0;
        if (raw) {
          try {
            const data = JSON.parse(raw) as { scansToday: number; lastResetDate: string };
            if (data.lastResetDate === today) {
              scansToday = data.scansToday;
            } else {
              await AsyncStorage.setItem(
                GUEST_QUOTA_KEY,
                JSON.stringify({ scansToday: 0, lastResetDate: today })
              );
            }
          } catch (_) {}
        }
        set({
          plan: "visitor",
          scansToday,
          lastResetDate: today,
          isHydrated: true,
          hasRestoredGuest: true,
        });
        return true;
      }

      set({ isHydrated: true, hasRestoredGuest: false });
    } catch (_) {
      set({ isHydrated: true });
    }
    return false;
  },

  startGuestSession: async () => {
    const today = todayISO();
    await AsyncStorage.setItem(GUEST_CHOICE_KEY, "true");
    const raw = await AsyncStorage.getItem(GUEST_QUOTA_KEY);
    if (raw) {
      try {
        const data = JSON.parse(raw) as { scansToday: number; lastResetDate: string };
        if (data.lastResetDate === today) {
          set({ plan: "visitor", scansToday: data.scansToday, lastResetDate: today });
          return;
        }
      } catch (_) {}
    }
    set({ plan: "visitor", scansToday: 0, lastResetDate: today });
    await AsyncStorage.setItem(
      GUEST_QUOTA_KEY,
      JSON.stringify({ scansToday: 0, lastResetDate: today })
    );
  },

  persistGuestQuota: async () => {
    const { plan, scansToday, lastResetDate } = get();
    if (plan !== "visitor" || lastResetDate == null) return;
    try {
      await AsyncStorage.setItem(
        GUEST_QUOTA_KEY,
        JSON.stringify({ scansToday, lastResetDate })
      );
    } catch (_) {}
  },

  clearGuestAndReset: async () => {
    try {
      await AsyncStorage.removeItem(GUEST_CHOICE_KEY);
      // On ne supprime pas GUEST_QUOTA_KEY : le quota reste lié à l'appareil pour la journée
    } catch (_) {}
    set({
      plan: "visitor",
      scansToday: 0,
      lastResetDate: null,
      hasRestoredGuest: false,
    });
  },
}));
