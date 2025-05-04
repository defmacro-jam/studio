// src/lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
// import { getAnalytics } from "firebase/analytics"; // Optional: If Analytics is needed

// Check if the API key is present
if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
  console.warn(
    `Firebase API key (NEXT_PUBLIC_FIREBASE_API_KEY) is missing.
     Please add it to your .env file. Firebase features will not work correctly.
     See .env file for required variables.`
  );
}


const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "MISSING_API_KEY", // Provide fallback to avoid immediate crash, error will still occur later
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID // Optional
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  // Optional: Initialize Analytics
  // if (typeof window !== 'undefined') {
  //   getAnalytics(app);
  // }
} else {
  app = getApp();
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

// Connect to emulators if running in development
// Important: Ensure environment variable is correctly set, e.g., 'development'
if (process.env.NODE_ENV === 'development') {
  try {
    // Default ports: Auth=9099, Firestore=8080
    // Check if emulator flags are set explicitly, otherwise assume not running
    // Example check (adjust based on your actual env var strategy for emulators):
    if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true') {
       console.log("Connecting to Firebase Emulators...");
       connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
       connectFirestoreEmulator(db, '127.0.0.1', 8080);
    } else {
       console.log("Firebase Emulators not explicitly enabled (NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'true'). Connecting to production Firebase.");
    }

  } catch (error) {
    console.error("Error connecting to Firebase emulators:", error);
  }
}

export { app, auth, db };
