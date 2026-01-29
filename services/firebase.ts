
import { initializeApp, getApps } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCx72JRN_8oSMH9ZuYC0Nmgt-Ur7ef_UZs",
  authDomain: "firecheck-ai-pro.firebaseapp.com",
  projectId: "firecheck-ai-pro",
  storageBucket: "firecheck-ai-pro.firebasestorage.app",
  messagingSenderId: "800038267754",
  appId: "1:800038267754:web:1ccbce1c73b59bfd771313",
  measurementId: "G-LP4YXQGNR7"
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;
let googleProvider: GoogleAuthProvider | undefined;

try {
  // Initialize modular Firebase App
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }

  // Initialize services using modular functions to avoid "no exported member" errors
  if (app) {
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    googleProvider = new GoogleAuthProvider();
    // Force account selection on every login
    googleProvider.setCustomParameters({
      prompt: 'select_account'
    });

    // Enable persistence for faster subsequent loads
    if (auth && typeof window !== 'undefined') {
      import('firebase/auth').then(({ setPersistence, browserLocalPersistence }) => {
        setPersistence(auth!, browserLocalPersistence).catch((error) => {
          console.warn('Failed to set auth persistence:', error);
        });
      });
    }
  }
} catch (error) {
  console.warn("Firebase initialization failed. App will fallback to Guest/LocalStorage mode.", error);
}

export { auth, db, storage, googleProvider };
