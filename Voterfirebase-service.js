// =====================================
// FIREBASE SERVICE & REALTIME DATABASE
// =====================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  update,
  onValue,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";


const firebaseConfig = {
  apiKey: "AIzaSyBsbhH9D-EHAkRu8_MHA8c46uIJvXtkvTs",
  authDomain: "form-359da.firebaseapp.com",
  databaseURL: "https://form-359da-default-rtdb.firebaseio.com",
  projectId: "form-359da",
  storageBucket: "form-359da.firebasestorage.app",
  messagingSenderId: "214530619278",
  appId: "1:214530619278:web:e25beac9d2c023443c96df"
};


// Initialize Firebase & Realtime Database
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Dynamic database path (updated whenever the user changes village)
let DB_PATH = "voter_directory_records/Sampathnagaram";

// Update the active village database path
export function setFirebaseVillagePath(newPath) {
  DB_PATH = newPath;
}

// Listen to live database changes for the currently active village
// Returns the unsubscribe function so previous village listeners can be detached
export function setupFirebaseListener(onDataUpdated) {
  const recordsRef = ref(db, DB_PATH);

  const unsubscribe = onValue(
    recordsRef,
    snapshot => {
      const data = snapshot.val() || {};
      const verificationData = {};
      const partyData = {};

      Object.entries(data).forEach(([voterKey, record]) => {
        if (record && typeof record === "object") {
          if (record.isVerified === true) verificationData[voterKey] = true;
          if (record.isMyParty === true) partyData[voterKey] = true;
        }
      });

      onDataUpdated(verificationData, partyData);
    },
    error => {
      console.error("Firebase Realtime Database read error:", error);
    }
  );

  return unsubscribe;
}

// Fetch initial snapshot once on load for the active village
export async function fetchInitialFirebaseData() {
  try {
    const snapshot = await get(ref(db, DB_PATH));
    if (snapshot.exists()) {
      const data = snapshot.val() || {};
      const verificationData = {};
      const partyData = {};

      Object.entries(data).forEach(([voterKey, record]) => {
        if (record?.isVerified === true) verificationData[voterKey] = true;
        if (record?.isMyParty === true) partyData[voterKey] = true;
      });

      return { verificationData, partyData };
    }
  } catch (error) {
    console.error("Error fetching initial Firebase data:", error);
  }
  return { verificationData: {}, partyData: {} };
}

// Update ONLY the changed field independently in Firebase under the active village node
export async function saveVoterField(voterKey, fieldName, value) {
  try {
    const voterRef = ref(db, `${DB_PATH}/${voterKey}`);
    await update(voterRef, {
      [fieldName]: value === true,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error(`Error updating ${fieldName} in Realtime Database:`, error);
    alert("Failed to sync change to Firebase. Check your internet connection.");
  }
}