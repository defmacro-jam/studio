
// src/lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
// import { getAnalytics } from "firebase/analytics"; // Optional: If Analytics is needed

// --- Environment Variable Checks ---
const configValues = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID // Optional
};

const requiredKeys: (keyof typeof configValues)[] = ['apiKey', 'authDomain', 'projectId'];
let missingKeys: string[] = [];

requiredKeys.forEach(key => {
  if (!configValues[key]) {
    missingKeys.push(`NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
  }
});

if (missingKeys.length > 0) {
  console.error(`
    ********************************************************************************
    *                               ERROR: Firebase Config Missing                 *
    *------------------------------------------------------------------------------*
    * The following required environment variable(s) are not set:                  *
    *   ${missingKeys.join('\n    *   ')}
    *                                                                              *
    * Firebase features require these keys to function correctly.                  *
    * Please add them to your .env file in the root of your project.               *
    * You can find these values in your Firebase project settings:                 *
    * Project Settings > General > Your apps > Web apps > SDK setup and config     *
    *                                                                              *
    * Also ensure that Firebase Authentication is ENABLED in your Firebase Console:*
    * Build > Authentication > Get started                                         *
    *                                                                              *
    * The application might crash or Firebase features will fail.                  *
    ********************************************************************************
  `);
}
// --- End Environment Variable Checks ---


const firebaseConfig = {
  apiKey: configValues.apiKey || "MISSING_API_KEY_CHECK_CONSOLE",
  authDomain: configValues.authDomain || "MISSING_AUTH_DOMAIN_CHECK_CONSOLE",
  projectId: configValues.projectId || "MISSING_PROJECT_ID_CHECK_CONSOLE",
  storageBucket: configValues.storageBucket,
  messagingSenderId: configValues.messagingSenderId,
  appId: configValues.appId,
  // measurementId: configValues.measurementId // Optional
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
  } catch (error: any) {
     console.error("**************** Firebase Initialization Error ****************");
     console.error("Failed to initialize Firebase. This often happens if the config values in your .env file are incorrect or if the Firebase services (like Auth, Firestore) are not properly enabled in the Firebase console.");
     console.error("Original Error:", error.message);
     console.error("Firebase Config Used:", firebaseConfig);
     console.error("****************************************************************");
     // Re-throw the error or handle it gracefully depending on the desired behavior
     // For now, let's allow it to proceed but it will likely fail later.
     // A better approach might be to throw a new error or return a dummy app object.
     // throw new Error("Firebase initialization failed. Check console and .env file.");
     app = {} as FirebaseApp; // Dummy app to prevent immediate crash, though downstream will fail
  }

  // Optional: Initialize Analytics
  // if (typeof window !== 'undefined') {
  //   getAnalytics(app);
  // }
} else {
  app = getApp();
}

let auth: Auth;
let db: Firestore;

// Initialize Auth and Firestore, guarding against dummy app object
try {
    auth = getAuth(app);
    db = getFirestore(app);
} catch(initError: any) {
     console.error("**************** Firebase Service Initialization Error ****************");
     console.error("Failed to initialize Firebase Auth or Firestore. This likely means the initial app initialization failed due to configuration issues.");
     console.error("Original Error:", initError.message);
     console.error("****************************************************************");
     // Assign dummy objects to prevent hard crashes later, though functionality will be broken
     auth = {} as Auth;
     db = {} as Firestore;
}


// Connect to emulators if running in development
// Important: Ensure environment variable is correctly set, e.g., 'development'
if (process.env.NODE_ENV === 'development' && auth && db && Object.keys(auth).length > 0 && Object.keys(db).length > 0) { // Check if auth/db were initialized
  try {
    // Default ports: Auth=9099, Firestore=8080
    // Check if emulator flags are set explicitly, otherwise assume not running
    if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true') {
       console.log("Connecting to Firebase Emulators (Auth: 9099, Firestore: 8080)...");
       connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
       connectFirestoreEmulator(db, '127.0.0.1', 8080);
    } else {
       console.log("Firebase Emulators not explicitly enabled (NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'true'). Connecting to production Firebase.");
    }

  } catch (error) {
    console.error("Error connecting to Firebase emulators:", error);
  }
} else if (process.env.NODE_ENV === 'development') {
    console.warn("Skipping emulator connection because Firebase Auth/Firestore failed to initialize.");
}

export { app, auth, db };
