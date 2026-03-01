/**
 * Local Store Directory (no DB)
 * - Key: storeId (from pinRegistry.storeId)
 * - Value: human-friendly store name (shown in admin tables, etc.)
 *
 * Defaults live in code. Admin UI can override per-browser via localStorage.
 */

export const STORE_DIRECTORY: Record<string, string> = {
  // demo / local
  store_demo: "Demo Store",

  // Add real storeIds here, example:
  // "pVHSvbG8UsBXuVEBALtz": "SharEat Lipa",
  // "L5MExycvUOfQ96Y10FqF": "SharEat Malvar",
};

const LS_KEY = "shareat_store_directory_v1";

function loadOverrides(): Record<string, string> {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function getStoreName(storeId?: string | null) {
  const id = String(storeId ?? "").trim();
  if (!id) return "-";

  const overrides = loadOverrides();
  return overrides[id] ?? STORE_DIRECTORY[id] ?? id; // fallback shows raw id
}

export function getStoreLabel(storeId?: string | null) {
  const id = String(storeId ?? "").trim();
  if (!id) return "-";

  const overrides = loadOverrides();
  const name = overrides[id] ?? STORE_DIRECTORY[id];
  return name ? `${name} (${id})` : id;
}
