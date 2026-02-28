import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function adminDb() {
  if (!getApps().length) {
    // Works on Firebase App Hosting / GCP environments via ADC.
    // For local dev, you can provide FIREBASE_SERVICE_ACCOUNT_KEY (JSON string) if needed.
    const credential = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
      : applicationDefault();

    initializeApp({ credential });
  }
  return getFirestore();
}
