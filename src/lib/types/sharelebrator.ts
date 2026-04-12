import type { Timestamp } from "firebase/firestore";

export type SharelebratorCustomer = {
  phone: string;
  passwordHash: string;
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
