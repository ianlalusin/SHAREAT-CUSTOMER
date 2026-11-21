import { describe, expect, it, vi } from "vitest";

const deletedFiles: string[] = [];
vi.mock("@/lib/firebase/admin", () => ({
  getAdminBucket: () => ({ file: (path: string) => ({ delete: async () => void deletedFiles.push(path) }) }),
}));
vi.mock("@/lib/server/games/config", () => ({ readGameConfigs: async () => ({}) }));

import { MAX_BYTES, deleteConsentedPhoto, readBodyLimited, validateUpload } from "./capture-share-store";

/** A minimal "complete" JPEG: start marker FF D8 FF, end marker FF D9. */
const jpeg = (n: number) => {
  const b = new Uint8Array(n);
  b.set([0xff, 0xd8, 0xff]);
  b.set([0xff, 0xd9], n - 2);
  return b;
};

describe("validateUpload", () => {
  it("accepts a normal JPEG", () => {
    expect(validateUpload(jpeg(200_000), "1732170000000-abc123")).toBeNull();
  });
  it("rejects non-JPEG, empty, oversized and bad ids", () => {
    const png = new Uint8Array(5000);
    png.set([0x89, 0x50, 0x4e]);
    expect(validateUpload(png, "abcdef")).toMatch(/JPEG/);
    expect(validateUpload(jpeg(100), "abcdef")).toMatch(/empty/);
    expect(validateUpload(jpeg(MAX_BYTES + 1), "abcdef")).toMatch(/large/);
    expect(validateUpload(jpeg(5000), "../x")).toMatch(/id/);
  });
  it("rejects a payload that only borrows the JPEG start bytes (audit CUSTOMER-03)", () => {
    const fake = new Uint8Array(5000);
    fake.set([0xff, 0xd8, 0xff]);
    expect(validateUpload(fake, "abcdef")).toMatch(/complete JPEG/);
  });
});

describe("readBodyLimited (audit CUSTOMER-03)", () => {
  it("returns the body when it fits", async () => {
    const body = await readBodyLimited(new Request("http://x", { method: "POST", body: new Uint8Array(10) }), 100);
    expect(body?.length).toBe(10);
  });
  it("stops and returns null once the body passes the limit, whatever Content-Length says", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(64)); // endless: only the limit ends it
      },
    });
    const req = new Request("http://x", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(await readBodyLimited(req, 1000)).toBeNull();
  });
});

describe("deleteConsentedPhoto ownership (audit CUSTOMER-04)", () => {
  const fakeDb = (doc: Record<string, unknown> | null) => {
    let deleted = false;
    const ref = {
      get: async () => ({ exists: doc !== null && !deleted, data: () => doc }),
      delete: async () => void (deleted = true),
    };
    return { db: { collection: () => ({ doc: () => ref }) } as never, wasDeleted: () => deleted };
  };

  it("lets the diner who consented remove their photo", async () => {
    const f = fakeDb({ identityKey: "p_me", path: "captureShare/s/x.jpg" });
    expect(await deleteConsentedPhoto(f.db, "s", "sess_photo", "p_me")).toBe("deleted");
    expect(f.wasDeleted()).toBe(true);
  });

  it("refuses another diner at the same table", async () => {
    const f = fakeDb({ identityKey: "p_me", path: "captureShare/s/x.jpg" });
    expect(await deleteConsentedPhoto(f.db, "s", "sess_photo", "p_other")).toBe("not-owner");
    expect(f.wasDeleted()).toBe(false);
  });

  it("staff (no owner key) can remove any photo; a missing photo is reported", async () => {
    expect(await deleteConsentedPhoto(fakeDb({ identityKey: "p_me", path: "p" }).db, "s", "id")).toBe("deleted");
    expect(await deleteConsentedPhoto(fakeDb(null).db, "s", "id", "p_me")).toBe("missing");
  });
});

import { printingOnAt } from "./capture-share-store";

describe("printingOnAt (per-branch printing switch)", () => {
  it("is on by default, for every branch", () => {
    expect(printingOnAt(undefined, "lipa")).toBe(true);
    expect(printingOnAt({}, "lipa")).toBe(true);
  });
  it("the chain-wide switch turns every branch off", () => {
    expect(printingOnAt({ printingEnabled: false, printingDisabledStoreIds: [] }, "lipa")).toBe(false);
  });
  it("a branch in printingDisabledStoreIds is off; the others stay on", () => {
    const cfg = { printingEnabled: true, printingDisabledStoreIds: ["malvar"] };
    expect(printingOnAt(cfg, "malvar")).toBe(false);
    expect(printingOnAt(cfg, "lipa")).toBe(true);
  });
});
