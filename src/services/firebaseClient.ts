import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';

export interface FirebaseEnvConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  useEmulator: boolean;
}

export function getFirebaseEnvConfig(): FirebaseEnvConfig | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const apiKey = (
    env.VITE_FIREBASE_API_KEY ||
    env['\uFEFFVITE_FIREBASE_API_KEY'] ||
    ''
  ).trim();
  const authDomain = (env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
  const projectId = (env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const messagingSenderId = (env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim();
  const appId = (env.VITE_FIREBASE_APP_ID || '').trim();
  const useEmulator = env.VITE_USE_FIREBASE_EMULATOR === 'true';

  if (
    !apiKey ||
    apiKey === 'your-api-key' ||
    !projectId ||
    projectId === 'your-project-id'
  ) {
    return null;
  }

  return {
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    messagingSenderId: messagingSenderId || '',
    appId: appId || '',
    useEmulator,
  };
}

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firestoreDb: Firestore | null = null;
let emulatorConnected = false;

export function getFirebaseClients(): {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
} | null {
  const cfg = getFirebaseEnvConfig();
  if (!cfg) return null;

  if (!firebaseApp) {
    firebaseApp = initializeApp({
      apiKey: cfg.apiKey,
      authDomain: cfg.authDomain,
      projectId: cfg.projectId,
      messagingSenderId: cfg.messagingSenderId,
      appId: cfg.appId,
    });
    firebaseAuth = getAuth(firebaseApp);
    firestoreDb = getFirestore(firebaseApp);

    if (cfg.useEmulator && !emulatorConnected) {
      connectFirestoreEmulator(firestoreDb, '127.0.0.1', 8080);
      emulatorConnected = true;
    }
  }

  return {
    app: firebaseApp!,
    auth: firebaseAuth!,
    db: firestoreDb!,
  };
}

export async function signInWithGooglePopup(): Promise<void> {
  const clients = getFirebaseClients();
  if (!clients) {
    throw new Error('ローカルデモモードで動作中です。上部バーの「テストユーザー切替」からアカウントを選択してください。');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(clients.auth, provider);
}

export async function signOutFirebase(): Promise<void> {
  const clients = getFirebaseClients();
  if (!clients) return;
  await signOut(clients.auth);
}
