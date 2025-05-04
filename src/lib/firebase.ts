
// src/lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
// import { getAnalytics } from "firebase/analytics"; // Optional: If Analytics is needed

// Check if the API key is present and log a more detailed warning if missing
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
if (!apiKey) {
  console.error(`
    ********************************************************************************
    *                                 ERROR: Firebase API Key Missing                *
    *------------------------------------------------------------------------------*
    * The environment variable NEXT_PUBLIC_FIREBASE_API_KEY is not set.            *
    * Firebase features require this key to function correctly.                    *
    *                                                                              *
    * Please add NEXT_PUBLIC_FIREBASE_API_KEY=<your_firebase_api_key> to your      *
    * .env file in the root of your project.                                       *
    * You can find your API key in your Firebase project settings:                 *
    * Project Settings > General > Your apps > Web apps > SDK setup and config     *
    *                                                                              *
    * The application might crash or Firebase features will fail.                  *
    ********************************************************************************
  `);
}


const firebaseConfig = {
  apiKey: apiKey || "MISSING_API_KEY_CHECK_CONSOLE_ERROR", // Use the checked key or a more descriptive placeholder
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
       console.log("Connecting to Firebase Emulators (Auth: 9099, Firestore: 8080)...");
       connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
       connectFirestoreEmulator(db, '127.0.0.1', 8080);
    } else {
       console.log("Firebase Emulators not explicitly enabled (NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'true'). Connecting to production Firebase (ensure API key is valid).");
    }

  } catch (error) {
    console.error("Error connecting to Firebase emulators:", error);
  }
}

export { app, auth, db };

