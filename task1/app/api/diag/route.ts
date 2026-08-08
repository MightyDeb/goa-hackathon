import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-word answer to "did the Blob token reach the running function?".
 *
 * Reports presence only, never values — nothing here is a secret. It exists so
 * a broken share link can be diagnosed by opening a URL, without digging
 * through Vercel's dashboard or a browser console. Safe to delete once the
 * deployment is known good.
 */
export async function GET() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  let blobReachable: boolean | string = "not attempted";
  if (token) {
    try {
      const { list } = await import("@vercel/blob");
      await list({ limit: 1 });
      blobReachable = true;
    } catch (error) {
      blobReachable = error instanceof Error ? error.message : String(error);
    }
  }

  return NextResponse.json({
    blobConfigured: Boolean(token),
    // A token that exists but is malformed looks identical to a missing one
    // from the outside, so surface just enough shape to tell them apart.
    tokenLooksValid: token ? token.startsWith("vercel_blob_") : false,
    tokenLength: token ? token.length : 0,
    blobReachable,
    vercelEnv: process.env.VERCEL_ENV ?? "not on vercel",
  });
}
