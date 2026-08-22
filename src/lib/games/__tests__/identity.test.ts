import { describe, it, expect } from "vitest";
import { gameIdentityKey, isUsableParticipantId } from "@/lib/games/identity";

/** A real participantId: sha256(deviceId).slice(0,16). */
const PARTICIPANT = "a1b2c3d4e5f60718";
const OTHER = "0718f6e5d4c3b2a1";

describe("gameIdentityKey", () => {
  it("derives one stable key per participant", () => {
    expect(gameIdentityKey(PARTICIPANT)).toBe(`d_${PARTICIPANT}`);
    expect(gameIdentityKey(PARTICIPANT)).toBe(gameIdentityKey(PARTICIPANT));
  });

  /**
   * The bug this module exists to prevent. Everyone at one table shares a
   * session and a `linkedCustomerPhone`; only the participant id separates
   * them. If two diners at one table ever produced the same key, the second to
   * open the game would be told they had already voted.
   */
  it("keeps two diners at the same table apart", () => {
    expect(gameIdentityKey(PARTICIPANT)).not.toBe(gameIdentityKey(OTHER));
  });

  it("refuses a caller with no usable identity rather than inventing one", () => {
    // Every one of these would otherwise become a single shared key.
    expect(gameIdentityKey("")).toBeNull();
    expect(gameIdentityKey(null)).toBeNull();
    expect(gameIdentityKey(undefined)).toBeNull();
    expect(gameIdentityKey("   ")).toBeNull();
    expect(gameIdentityKey("short")).toBeNull();
  });

  it("rejects ids carrying path characters", () => {
    // The key becomes a Firestore document id, so a slash would silently
    // reparent the vote doc.
    expect(gameIdentityKey("../../etc/passwd")).toBeNull();
    expect(gameIdentityKey("abcdefgh/ijkl")).toBeNull();
  });
});

describe("isUsableParticipantId", () => {
  it("accepts a real participant id and nothing ragged", () => {
    expect(isUsableParticipantId(PARTICIPANT)).toBe(true);
    expect(isUsableParticipantId("abc")).toBe(false);
    expect(isUsableParticipantId("has space here")).toBe(false);
  });
});
