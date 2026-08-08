/**
 * Mock data for the admin/manager "Preview" page (/admin/preview) — lets
 * staff see what a real customer sees without a real dine-in session. None
 * of this is ever read from or written to Firestore; it exists purely as
 * component state fed to the real presentational pieces (DashboardHeader,
 * CustomerCatalog) and the preview-only loyalty card / action notices.
 */

export type MockSession = {
  storeId: string;
  sessionId: string;
  customerName: string;
  tableId: string;
  tableNumber: string;
  tableDisplayName: string;
  packageOfferingId: string;
  packageName: string;
  initialFlavorIds: string[];
  status: string;
  sessionMode: string;
};

export function getMockSession(storeId: string, storeName: string): MockSession {
  return {
    storeId,
    sessionId: "preview",
    customerName: "Preview Guest",
    tableId: "preview-table",
    tableNumber: "12",
    tableDisplayName: "Table 12 (Preview)",
    packageOfferingId: "preview-package",
    packageName: `${storeName} Preview`,
    initialFlavorIds: [],
    status: "active",
    sessionMode: "dine-in",
  };
}

export type MockLedgerEntry = {
  id: string;
  type: "earn" | "redeem" | "adjust";
  points: number;
  amount: number;
  storeId: string;
  sessionId: string;
  createdAtMs: number | null;
};

export type MockLoyaltyCustomer = {
  phone: string;
  name: string;
  bday: string;
  address: string;
  email: string | null;
  pointsBalance: number;
};

export function getMockLoyaltyData(storeId: string): { customer: MockLoyaltyCustomer; ledger: MockLedgerEntry[] } {
  const now = Date.now();
  const day = 86_400_000;
  return {
    customer: {
      phone: "09990001234",
      name: "Preview Member",
      bday: "1995-06-15",
      address: "123 Preview Street",
      email: "preview@example.com",
      pointsBalance: 1250,
    },
    ledger: [
      { id: "preview-1", type: "earn", points: 150, amount: 1500, storeId, sessionId: "preview", createdAtMs: now - day },
      { id: "preview-2", type: "redeem", points: -300, amount: 0, storeId, sessionId: "preview", createdAtMs: now - 5 * day },
      { id: "preview-3", type: "earn", points: 220, amount: 2200, storeId, sessionId: "preview", createdAtMs: now - 12 * day },
      { id: "preview-4", type: "adjust", points: 50, amount: 0, storeId, sessionId: "preview", createdAtMs: now - 20 * day },
    ],
  };
}
