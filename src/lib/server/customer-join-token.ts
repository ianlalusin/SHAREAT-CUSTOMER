import { createHmac } from "crypto";

export interface JoinTokenPayload {
  storeId: string;
  sessionId: string;
  pin: string;
  joinVersion: number;
  exp: number;
}

const SECRET = process.env.CUSTOMER_JOIN_TOKEN_SECRET!;

export function signJoinToken(payload: JoinTokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyJoinToken(token: string): JoinTokenPayload {
  const dot = token.lastIndexOf(".");
  if (dot === -1) throw new Error("Invalid join token signature.");
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", SECRET).update(data).digest("base64url");
  if (sig !== expected) throw new Error("Invalid join token signature.");
  const payload: JoinTokenPayload = JSON.parse(Buffer.from(data, "base64url").toString());
  if (payload.exp < Date.now()) throw new Error("Join token expired.");
  return payload;
}
