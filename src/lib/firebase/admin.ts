import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function ensureAdmin() {
  if (!getApps().length) {
    try {
      const credential = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
        : applicationDefault();

      initializeApp({
        credential,
        projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "shareat-hub-v2",
      });
    } catch (e) {
      console.warn(
        "Firebase Admin failed to initialize. Falling back to public SDK where possible."
      );
    }
  }
}

export function adminDb() {
  ensureAdmin();
  try {
    return getFirestore();
  } catch (e) {
    console.error("Firestore Admin access failed.");
    throw e;
  }
}

// Backward-compatible named exports expected by API routes
export function getAdminDb() {
  return adminDb();
}

export function getAdminAuth() {
  ensureAdmin();
  return getAuth();
}
