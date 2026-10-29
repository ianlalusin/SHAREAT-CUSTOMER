import { describe, it, expect, vi, beforeEach } from "vitest";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POS audit B05: the password hash moves from customers/{phone}.passwordHash to
 * the admin-only customers/{phone}/secrets/auth. These pin the transition:
 * logins work from either copy, writes go to both until the legacy field is
 * switched off.
 */

const h = vi.hoisted(() => ({ store: new Map<string, any>() }));

function fakeDb(): any {
  const ref = (path: string): any => ({
    path,
    get: async () => ({ exists: h.store.has(path), data: () => h.store.get(path) }),
  });
  const isDelete = (v: any) => v && typeof v === "object" && v.constructor?.name?.includes("Delete");
  const write = (path: string, d: any, mustExist: boolean) => {
    if (mustExist && !h.store.has(path)) throw new Error(`NOT_FOUND: ${path}`);
    const next = { ...(h.store.get(path) || {}) };
    for (const [k, v] of Object.entries(d)) {
      if (isDelete(v)) delete next[k];
      else next[k] = v;
    }
    h.store.set(path, next);
  };
  return {
    doc: ref,
    batch: () => {
      const ops: Array<() => void> = [];
      const creates: string[] = [];
      return {
        set: (r: any, d: any) => void ops.push(() => write(r.path, d, false)),
        update: (r: any, d: any) => void ops.push(() => write(r.path, d, true)),
        create: (r: any, d: any) => {
          creates.push(r.path);
          ops.push(() => write(r.path, d, false));
        },
        commit: async () => {
          if (creates.some((p) => h.store.has(p))) throw Object.assign(new Error("already exists"), { code: 6 });
          ops.forEach((op) => op());
        },
      };
    },
  };
}

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => fakeDb(),
  getAdminAuth: () => ({ createCustomToken: async () => "tok" }),
}));
vi.mock("@/lib/server/loyaltyLog", () => ({ writeLoyaltyLog: async () => {} }));
vi.mock("@/lib/server/rate-limit", () => ({
  RATE_RULES: { loginPhone: {}, loginIp: {}, signupIp: {} },
  clientIp: () => "1.1.1.1",
  checkRateLimits: async () => ({ ok: true }),
  consumeRateLimits: async () => ({ ok: true }),
  recordRateLimitFailures: async () => {},
  tooManyAttempts: () => new Response(null, { status: 429 }),
}));
vi.mock("bcryptjs", () => ({
  default: {
    hash: async (pw: string) => `hash:${pw}`,
    compare: async (pw: string, hash: string) => hash === `hash:${pw}`,
  },
}));

import {
  customerSecretRef,
  readCustomerPasswordHash,
  stageCustomerPasswordHash,
} from "@/lib/server/customer-secrets";
import { createCustomerAccount } from "@/lib/server/create-customer";
import { POST as login } from "@/app/api/customer/sharelebrator/login/route";

// Stored form: routes normalize what the diner types to +63…
const PHONE = "+639171234567";
const PROFILE = `customers/${PHONE}`;
const SECRET = `customers/${PHONE}/secrets/auth`;

function loginReq(password: string) {
  return new Request("http://x/api/customer/sharelebrator/login", {
    method: "POST",
    body: JSON.stringify({ phone: PHONE, password }),
  });
}

beforeEach(() => {
  h.store.clear();
  delete process.env.CUSTOMER_SECRETS_LEGACY_FIELD;
});

describe("readCustomerPasswordHash", () => {
  it("prefers the legacy field while it exists (it is the fresher copy mid-transition)", async () => {
    h.store.set(SECRET, { passwordHash: "hash:old" });
    expect(await readCustomerPasswordHash(fakeDb(), PHONE, { passwordHash: "hash:new" })).toBe("hash:new");
  });

  it("falls back to the secret doc once the legacy field is gone", async () => {
    h.store.set(SECRET, { passwordHash: "hash:pw" });
    expect(await readCustomerPasswordHash(fakeDb(), PHONE, { name: "Ana" })).toBe("hash:pw");
  });

  it("returns empty when neither exists", async () => {
    expect(await readCustomerPasswordHash(fakeDb(), PHONE, {})).toBe("");
  });
});

describe("stageCustomerPasswordHash", () => {
  it("writes the secret doc and keeps the legacy copy by default", () => {
    const db = fakeDb();
    const batch = db.batch();
    const patch = stageCustomerPasswordHash(batch, db, PHONE, "hash:pw");
    expect(patch).toEqual({ passwordHash: "hash:pw" });
    expect(customerSecretRef(db, PHONE).path).toBe(SECRET);
  });

  it("deletes the legacy field when CUSTOMER_SECRETS_LEGACY_FIELD=off", () => {
    const db = fakeDb();
    const patch = stageCustomerPasswordHash(db.batch(), db, PHONE, "hash:pw", { CUSTOMER_SECRETS_LEGACY_FIELD: "off" });
    expect(patch.passwordHash).toEqual(FieldValue.delete());
  });
});

describe("createCustomerAccount", () => {
  const fields = { phone: PHONE, passwordHash: "hash:pw", name: "Ana", address: "", email: null, bday: "01-01" };

  it("writes the hash to the secret doc and the legacy field while dual-writing", async () => {
    const db = fakeDb();
    expect(await createCustomerAccount(db, db.doc(PROFILE), fields)).toBe(true);
    expect(h.store.get(SECRET).passwordHash).toBe("hash:pw");
    expect(h.store.get(PROFILE).passwordHash).toBe("hash:pw");
  });

  it("keeps the hash off the profile when the legacy field is off", async () => {
    process.env.CUSTOMER_SECRETS_LEGACY_FIELD = "off";
    const db = fakeDb();
    expect(await createCustomerAccount(db, db.doc(PROFILE), fields)).toBe(true);
    expect(h.store.get(SECRET).passwordHash).toBe("hash:pw");
    expect(h.store.get(PROFILE)).not.toHaveProperty("passwordHash");
  });

  it("refuses an existing phone without touching its secret", async () => {
    h.store.set(PROFILE, { name: "Ben" });
    h.store.set(SECRET, { passwordHash: "hash:ben" });
    const db = fakeDb();
    expect(await createCustomerAccount(db, db.doc(PROFILE), fields)).toBe(false);
    expect(h.store.get(SECRET).passwordHash).toBe("hash:ben");
  });
});

describe("login route", () => {
  it("logs in a migrated customer whose profile no longer holds the hash", async () => {
    h.store.set(PROFILE, { name: "Ana" });
    h.store.set(SECRET, { passwordHash: "hash:pw" });
    const res = await login(loginReq("pw"));
    expect(res.status).toBe(200);
  });

  it("still logs in a not-yet-migrated customer from the legacy field", async () => {
    h.store.set(PROFILE, { name: "Ana", passwordHash: "hash:pw" });
    const res = await login(loginReq("pw"));
    expect(res.status).toBe(200);
  });

  it("rejects a wrong password against the secret doc", async () => {
    h.store.set(PROFILE, { name: "Ana" });
    h.store.set(SECRET, { passwordHash: "hash:pw" });
    const res = await login(loginReq("nope"));
    expect(res.status).toBe(401);
  });
});
