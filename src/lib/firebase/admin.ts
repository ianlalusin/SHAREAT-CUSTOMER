import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function adminDb() {
  if (!getApps().length) {
    try {
      const credential = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
        : applicationDefault();

      initializeApp({ credential });
    } catch (e) {
      console.warn("Firebase Admin failed to initialize. Falling back to public SDK where possible.");
    }
  }
  try {
    return getFirestore();
  } catch (e) {
    console.error("Firestore Admin access failed.");
    throw e;
  }
}
