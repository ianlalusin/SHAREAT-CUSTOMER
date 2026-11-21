import { readFileSync } from "fs";
import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

function loadCredential() {
  // 1. Inline JSON (for cloud deploys like Vercel)
  if (process.env.SERVICE_ACCOUNT_KEY_JSON) {
    return cert(JSON.parse(process.env.SERVICE_ACCOUNT_KEY_JSON));
  }
  // 2. File path (for local dev — shared with POS repo via SERVICE_ACCOUNT_KEY_PATH)
  const saPath = process.env.SERVICE_ACCOUNT_KEY_PATH || process.env.FIREBASE_ADMIN_SA_PATH;
  if (saPath) {
    const raw = readFileSync(saPath, "utf8");
    return cert(JSON.parse(raw));
  }
  // 3. Application Default Credentials fallback
  return applicationDefault();
}

function ensureAdmin() {
  if (!getApps().length) {
    try {
      initializeApp({
        credential: loadCredential(),
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

/** The shared Storage bucket (same one POS uses). */
export function getAdminBucket() {
  ensureAdmin();
  return getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET || "shareat-hub-v2.firebasestorage.app");
}
