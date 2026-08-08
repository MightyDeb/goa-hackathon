import { NextResponse } from "next/server";
import { sweepExpired } from "@/lib/shareStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * TTL sweep for anonymous fallback-share uploads (plan §9).
 * Point a Vercel Cron at this and set CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const removed = await sweepExpired(TTL_MS);
  return NextResponse.json({ removed });
}
