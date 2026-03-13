import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch, clearToken, setToken, getToken } from "../services/api";
import { auth } from "../services/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

const GUEST_CHOICE_KEY = "@saferoom/guest";
const GUEST_QUOTA_KEY = "@saferoom/guest_quota";
const PLAN_KEY = "@saferoom/plan";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export type PlanType = "visitor" | "free" | "premium";

interface AuthState {
  plan: PlanType;
  userId: string | null;
  userEmail: string | null;
  scansToday: number;
  lastResetDate: string | null;
  isHydrated: boolean;
  /** true quand on a restauré une session invité depuis AsyncStorage */
  hasRestoredGuest: boolean;
  setPlan: (plan: PlanType) => Promise<void>;
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
  /** Met à jour le profil depuis le backend (renouvelle `plan`) */
  updateProfileFromServer: () => Promise<any | null>;
  /** Crée un compte et se connecte */
  signUp: (email: string, password: string) => Promise<User | null>;
  /** Connexion existante */
  signIn: (email: string, password: string) => Promise<User | null>;
  /** Déconnexion */
  signOut: () => Promise<void>;
  /** Déconnexion : efface le choix invité uniquement (le quota reste par appareil). */
  clearGuestAndReset: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  plan: "visitor",
  userId: null,
  userEmail: null,
  scansToday: 0,
  lastResetDate: null,
  isHydrated: false,
  hasRestoredGuest: false,

  setPlan: async (plan) => {
    set({ plan });
    try {
      await AsyncStorage.setItem(PLAN_KEY, plan);
    } catch (_) {
      // ignore
    }

    // Attempt to sync the plan with the backend
    try {
      if (plan === "premium") {
        await apiFetch("/premium/activate", { method: "POST" });
      } else {
        await apiFetch("/premium/cancel", { method: "POST" });
      }
    } catch (_) {
      // ignore backend errors
    }
  },

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
      const [guest, plan] = await Promise.all([
        AsyncStorage.getItem(GUEST_CHOICE_KEY),
        AsyncStorage.getItem(PLAN_KEY),
      ]);

      const today = todayISO();
      let scansToday = 0;
      let lastResetDate: string | null = null;

      if (guest === "true") {
        const raw = await AsyncStorage.getItem(GUEST_QUOTA_KEY);
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
              lastResetDate = today;
            }
          } catch (_) {
            lastResetDate = today;
            await AsyncStorage.setItem(
              GUEST_QUOTA_KEY,
              JSON.stringify({ scansToday: 0, lastResetDate: today })
            );
          }
        }

        set({
          plan: "visitor",
          scansToday,
          lastResetDate,
          isHydrated: true,
          hasRestoredGuest: true,
        });
      } else if (plan === "free" || plan === "premium") {
        set({ plan, isHydrated: true });
      } else {
        set({ isHydrated: true, hasRestoredGuest: false });
      }

      // If we have a stored token, try to restore profile from backend
      const token = await getToken();
      if (token && !get().userId) {
        try {
          const response = await apiFetch("/auth/me", { method: "GET" });
          if (response.ok) {
            const profile = response.data.profile;
            set({
              userId: profile?.uid ?? null,
              userEmail: profile?.email ?? null,
              plan: profile?.accountType ?? get().plan,
            });
          }
        } catch (_e) {
          // ignore
        }
      }
      
      // Keep user state in sync with Firebase auth if configured
      if (auth) {
        onAuthStateChanged(auth, (user) => {
          if (user) {
            set({ userId: user.uid, userEmail: user.email ?? null });
            set((state) => ({
              plan: state.plan === "visitor" ? "free" : state.plan,
            }));
          } else {
            set({ userId: null, userEmail: null });
          }
        });
      }

      set({ isHydrated: true });   // ← AJOUT IMPORTANT
      return true;
    } catch (_) {
      set({ isHydrated: true });
      return false;
    }
  },

  startGuestSession: async () => {
    const today = todayISO();
    await AsyncStorage.setItem(GUEST_CHOICE_KEY, "true");
    await AsyncStorage.removeItem(PLAN_KEY);

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

  async updateProfileFromServer() {
    try {
      const response = await apiFetch("/auth/me", { method: "GET" });

      console.log("PROFILE RESPONSE:", response);

      if (!response.ok) {
        console.log("PROFILE NOT FOUND");
        return null;
      }

      const profile = response.data?.profile ?? response.data;

      if (!profile) {
        console.log("PROFILE EMPTY");
        return null;
      }

      // 🔑 lire le plan depuis différentes clés possibles
      const plan: PlanType =
        profile.plan ||
        profile.accountType ||
        (profile.isPremium ? "premium" : "free");

      console.log("PLAN FROM SERVER:", plan);

      set({
        userId: profile.uid ?? profile.id ?? null,
        userEmail: profile.email ?? null,
        plan,
      });

      await AsyncStorage.setItem(PLAN_KEY, plan);

      return profile;
    } catch (err) {
      console.log("PROFILE FETCH ERROR:", err);
      return null;
    }
  },

  signUp: async (email: string, password: string) => {
    try {
      // Call backend to create account + profile
      const response = await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, displayName: email }),
      });
      if (!response.ok) return null;

      const { token } = response.data;
      if (token) await setToken(token);

      const profile = await get().updateProfileFromServer();

      if (!profile) {
        // fallback si le profil n'existe pas encore
        return { email } as unknown as User;
      }

      return profile as unknown as User;
    } catch (_) {
      return null;
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      const response = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        console.log("LOGIN ERROR:", response);
        return null;
      }

      const { idToken, uid, plan } = response.data;

      if (idToken) {
        await setToken(idToken);
      }

      // 🔄 récupérer le profil depuis Firestore via le backend
      let profile = await get().updateProfileFromServer();

      if (!profile) {
        console.log("Profile not found, creating local session");

        const userPlan = plan ?? "free";

        set({
          userId: uid,
          userEmail: email,
          plan: userPlan,
        });

        await AsyncStorage.setItem(PLAN_KEY, userPlan);

        return { uid, email } as unknown as User;
      }

      return profile as unknown as User;
    } catch (err) {
      console.log("SIGNIN ERROR:", err);
      return null;
    }
  },

  signOut: async () => {
    try {
      await clearToken();
      await auth?.signOut();
    } catch (_) {
      // ignore
    }
    set({ userId: null, userEmail: null, plan: "visitor" });
    await AsyncStorage.removeItem(PLAN_KEY);
  },

  clearGuestAndReset: async () => {
    try {
      await AsyncStorage.removeItem(GUEST_CHOICE_KEY);
      await AsyncStorage.removeItem(PLAN_KEY);
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
