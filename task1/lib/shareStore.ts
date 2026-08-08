import "server-only";
import { mkdir, readFile, writeFile, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Storage for the fallback-share path (plan §4.2). The mobile "Share…" button
 * hands the PNG straight to the OS share sheet and never touches this.
 *
 * Two things drive the design here:
 *
 *  1. A Blob store can be created with **public** or **private** access, and
 *     `put`/`get` reject the wrong one outright ("Cannot use public access on a
 *     private store"). Which mode a given deployment has is not knowable ahead
 *     of time, so every call tries one, falls back to the other, and remembers
 *     what worked.
 *  2. X's crawler must be able to fetch the OG image, and a private blob is not
 *     publicly fetchable. So the card is always advertised as `/api/card/<id>`
 *     on our own domain, which reads the blob server-side with the token. That
 *     URL works identically whichever mode the store is in.
 */

type BlobAccess = "public" | "private";

export type ShareRecord = {
  id: string;
  /** The full 4:5 card, shown on the share page itself. */
  imageUrl: string;
  /** 1200x630 companion used for og:image. Absent on older records. */
  ogUrl?: string;
  name: string;
  title: string;
  template: string;
  createdAt: number;
};

const LOCAL_DIR = path.join(process.cwd(), ".share-store");
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Remembered per warm instance so the fallback is paid at most once. */
let knownAccess: BlobAccess | null = null;

function accessOrder(preferred: BlobAccess): BlobAccess[] {
  if (knownAccess) return [knownAccess, knownAccess === "public" ? "private" : "public"];
  return [preferred, preferred === "public" ? "private" : "public"];
}

async function blobPut(pathname: string, body: ArrayBuffer | string, contentType: string) {
  const { put } = await import("@vercel/blob");
  let lastError: unknown;
  for (const access of accessOrder("public")) {
    try {
      const result = await put(pathname, body, {
        access,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60 * 60 * 24 * 30,
      });
      knownAccess = access;
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function blobGet(pathname: string): Promise<ArrayBuffer | null> {
  const { get } = await import("@vercel/blob");
  for (const access of accessOrder("private")) {
    try {
      const result = await get(pathname, { access });
      if (!result?.stream) continue;
      knownAccess = access;
      return await new Response(result.stream).arrayBuffer();
    } catch {
      /* wrong mode, or missing — try the other */
    }
  }
  return null;
}

export function newShareId(): string {
  // Unique per generated image and never reused — X caches OG previews per URL,
  // so a recycled id would show someone else's card (plan §9).
  return randomUUID().replace(/-/g, "").slice(0, 20);
}

export async function putShare(
  meta: Omit<ShareRecord, "imageUrl" | "ogUrl" | "createdAt">,
  image: ArrayBuffer,
  ogImage?: ArrayBuffer | null,
): Promise<ShareRecord> {
  const createdAt = Date.now();
  // Always our own routes, never the raw blob URL: these stay publicly
  // fetchable by X's crawler even when the underlying store is private.
  const record: ShareRecord = {
    ...meta,
    imageUrl: `/api/card/${meta.id}`,
    ogUrl: ogImage ? `/api/og/${meta.id}` : undefined,
    createdAt,
  };

  if (useBlob()) {
    await blobPut(`cards/${meta.id}.png`, image, "image/png");
    if (ogImage) await blobPut(`og/${meta.id}.jpg`, ogImage, "image/jpeg");
    await blobPut(`meta/${meta.id}.json`, JSON.stringify(record), "application/json");
    return record;
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, `${meta.id}.png`), Buffer.from(image));
  if (ogImage) await writeFile(path.join(LOCAL_DIR, `${meta.id}-og.jpg`), Buffer.from(ogImage));
  await writeFile(path.join(LOCAL_DIR, `${meta.id}.json`), JSON.stringify(record));
  return record;
}

export async function getShare(id: string): Promise<ShareRecord | null> {
  if (!/^[a-f0-9]{8,32}$/i.test(id)) return null;

  if (useBlob()) {
    const raw = await blobGet(`meta/${id}.json`);
    if (!raw) return null;
    try {
      return JSON.parse(new TextDecoder().decode(raw)) as ShareRecord;
    } catch {
      return null;
    }
  }

  try {
    const raw = await readFile(path.join(LOCAL_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as ShareRecord;
  } catch {
    return null;
  }
}

/** The card PNG itself, from whichever store this deployment is using. */
export async function getCardImage(id: string): Promise<Uint8Array | null> {
  if (!/^[a-f0-9]{8,32}$/i.test(id)) return null;

  if (useBlob()) {
    const raw = await blobGet(`cards/${id}.png`);
    return raw ? new Uint8Array(raw) : null;
  }

  try {
    return new Uint8Array(await readFile(path.join(LOCAL_DIR, `${id}.png`)));
  } catch {
    return null;
  }
}

/** The 1200x630 link-preview JPEG. */
export async function getOgImage(id: string): Promise<Uint8Array | null> {
  if (!/^[a-f0-9]{8,32}$/i.test(id)) return null;

  if (useBlob()) {
    const raw = await blobGet(`og/${id}.jpg`);
    return raw ? new Uint8Array(raw) : null;
  }

  try {
    return new Uint8Array(await readFile(path.join(LOCAL_DIR, `${id}-og.jpg`)));
  } catch {
    return null;
  }
}

/**
 * TTL sweep. These uploads are anonymous, so without expiry storage grows
 * without bound (plan §9). Wire to a Vercel Cron hitting /api/cleanup.
 */
export async function sweepExpired(maxAgeMs: number): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  if (useBlob()) {
    const { list, del } = await import("@vercel/blob");
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: "cards/", cursor, limit: 500 });
      const stale = page.blobs.filter((b) => new Date(b.uploadedAt).getTime() < cutoff);
      if (stale.length) {
        await del(stale.map((b) => b.url));
        const metas = await list({ prefix: "meta/", limit: 1000 });
        const staleIds = new Set(stale.map((b) => b.pathname.split("/")[1].replace(".png", "")));
        const staleMeta = metas.blobs.filter((b) =>
          staleIds.has(b.pathname.split("/")[1].replace(".json", "")),
        );
        if (staleMeta.length) await del(staleMeta.map((b) => b.url));
        removed += stale.length;
      }
      cursor = page.cursor;
    } while (cursor);
    return removed;
  }

  try {
    for (const file of await readdir(LOCAL_DIR)) {
      const full = path.join(LOCAL_DIR, file);
      const info = await stat(full);
      if (info.mtimeMs < cutoff) {
        await unlink(full);
        removed++;
      }
    }
  } catch {
    /* nothing stored yet */
  }
  return removed;
}
