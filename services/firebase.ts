import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signOut as firebaseSignOut, type Auth } from "@firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
};

let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;

const hasValidConfig =
  typeof firebaseConfig.apiKey === "string" &&
  firebaseConfig.apiKey.length > 0 &&
  typeof firebaseConfig.projectId === "string" &&
  firebaseConfig.projectId.length > 0;

if (hasValidConfig) {
  try {
    app = initializeApp(firebaseConfig);
    const authRn = require("@firebase/auth");
    _auth =
      typeof authRn.initializeAuth === "function" &&
      typeof authRn.getReactNativePersistence === "function"
        ? authRn.initializeAuth(app, {
            persistence: authRn.getReactNativePersistence(AsyncStorage),
          })
        : getAuth(app);
    _db = getFirestore(app);
    _storage = getStorage(app);
  } catch (_) {
    app = null;
    _auth = null;
    _db = null;
    _storage = null;
  }
}

export const auth = _auth;
export const db = _db;
export const storage = _storage;
export const isFirebaseConfigured = (): boolean => _auth !== null;

/** Déconnecte l'utilisateur Firebase (no-op si non configuré). */
export async function signOutUser(): Promise<void> {
  if (_auth?.currentUser) await firebaseSignOut(_auth);
}
