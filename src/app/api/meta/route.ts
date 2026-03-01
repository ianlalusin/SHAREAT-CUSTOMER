import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    build: {
      commit: "651771a",
      ts: new Date().toISOString(),
    },
    env: {
      GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || null,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || null,
      NODE_ENV: process.env.NODE_ENV || null,
    },
  });
}
