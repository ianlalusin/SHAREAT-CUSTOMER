import { describe, it, expect } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  CODE_TTL_MS,
  formatTransferCode,
  generateTransferCode,
  issueTransferCode,
  normalizeTransferCode,
  peekTransferCode,
} from "@/lib/server/transfer-code";

/**
 * Receive codes replace phone numbers in transfers (audit PRV-01): a sender can
 * only name a recipient by a short-lived code the recipient showed them, so a
 * phone number can never be probed for "does it have a card?".
 */
function fakeDb(preset: Record<string, any> = {}) {
  const store = new Map<string, any>(Object.entries(preset));
  const ref = (path: string): any => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    create: async (d: any) => {
      if (store.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
      store.set(path, d);
    },
  });
  return { db: { doc: ref } as any, store };
}

describe("code shape", () => {
  it("is 6 characters from an alphabet with no look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateTransferCode();
      expect(c).toHaveLength(CODE_LENGTH);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
    }
    for (const bad of ["0", "O", "1", "I", "L"]) expect(CODE_ALPHABET).not.toContain(bad);
  });

  it("is not the same every time", () => {
    expect(new Set(Array.from({ length: 50 }, generateTransferCode)).size).toBeGreaterThan(45);
  });

  it("normalizes what a person types, and rejects the rest", () => {
    expect(normalizeTransferCode("abc-def")).toBe("ABCDEF");
    expect(normalizeTransferCode(" a b c d e f ")).toBe("ABCDEF");
    expect(normalizeTransferCode("ABCDE")).toBeNull();
    expect(normalizeTransferCode("ABCDEFG")).toBeNull();
    expect(normalizeTransferCode("ABCDE0")).toBeNull(); // 0 is not in the alphabet
    expect(normalizeTransferCode(undefined)).toBeNull();
    expect(normalizeTransferCode(123456)).toBeNull();
  });

  it("formats with a dash for reading aloud", () => {
    expect(formatTransferCode("ABCDEF")).toBe("ABC-DEF");
  });
});

describe("issue and peek", () => {
  it("issues a code that names the phone, for 10 minutes", async () => {
    const { db, store } = fakeDb();
    const { code, expiresAtMs } = await issueTransferCode(db, "+639170000001", 1_000_000);
    expect(expiresAtMs).toBe(1_000_000 + CODE_TTL_MS);
    expect(CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(store.get(`transferCodes/${code}`)).toMatchObject({ phone: "+639170000001", expiresAtMs });
    expect(await peekTransferCode(db, code, 1_000_001)).toBe("+639170000001");
  });

  it("an expired code names nobody", async () => {
    const { db } = fakeDb();
    const { code, expiresAtMs } = await issueTransferCode(db, "+639170000001", 0);
    expect(await peekTransferCode(db, code, expiresAtMs)).toBeNull();
    expect(await peekTransferCode(db, code, expiresAtMs + 1)).toBeNull();
  });

  it("an unknown code names nobody", async () => {
    expect(await peekTransferCode(fakeDb().db, "ABCDEF", 0)).toBeNull();
  });

  it("never overwrites a live code held by someone else", async () => {
    const { db, store } = fakeDb();
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const { code } = await issueTransferCode(db, `+6391700${String(i).padStart(5, "0")}`, 0);
      expect(seen.has(code)).toBe(false);
      seen.add(code);
    }
    expect(store.size).toBe(300);
  });
});
