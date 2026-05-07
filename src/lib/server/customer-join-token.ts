import { createHmac } from "crypto";

export interface JoinTokenPayload {
  s: string;  // storeId
  i: string;  // sessionId
  p: string;  // pin
  v: number;  // joinVersion
  e: number;  // exp (Unix seconds)
}

const SECRET = process.env.CUSTOMER_JOIN_TOKEN_SECRET!;

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest().slice(0, 16).toString("base64url");
}

export function signJoinToken(payload: JoinTokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifyJoinToken(token: string): JoinTokenPayload {
  const dot = token.lastIndexOf(".");
  if (dot === -1) throw new Error("Invalid join token signature.");
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (sig !== sign(data)) throw new Error("Invalid join token signature.");
  const payload: JoinTokenPayload = JSON.parse(Buffer.from(data, "base64url").toString());
  if (payload.e < Date.now() / 1000) throw new Error("Join token expired.");
  return payload;
}
