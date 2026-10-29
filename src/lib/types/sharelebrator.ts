import type { Timestamp } from "firebase/firestore";

export type SharelebratorCustomer = {
  phone: string;
  /** Legacy copy; the hash lives in customers/{phone}/secrets/auth (customer-secrets.ts). */
  passwordHash?: string;
  name: string;
  address: string;
  email?: string;
  bday: string;
  pointsBalance: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type PointsLedgerEntry = {
  type: "earn" | "redeem" | "adjust";
  points: number;
  amount: number;
  storeId: string;
  sessionId: string;
  receiptId?: string;
  createdAt: Timestamp;
  createdByUid: string;
};
