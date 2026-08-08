import "server-only";
import { mkdir, readFile, writeFile, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Storage for the *fallback* share path only (plan §4.2). The primary share
 * path — `navigator.share({ files })` — never uploads anything, so on mobile
 * this code is never hit and the share stays a zero-latency local operation.
 */

export type ShareRecord = {
  id: string;
  imageUrl: string;
  name: string;
  title: string;
  template: string;
  createdAt: number;
};

const LOCAL_DIR = path.join(process.cwd(), ".share-store");
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export function newShareId(): string {
  // Unique per generated image and never reused — X caches OG previews per URL,
  // so a recycled id would show someone else's card (plan §9).
  return randomUUID().replace(/-/g, "").slice(0, 20);
}

export async function putShare(
  meta: Omit<ShareRecord, "imageUrl" | "createdAt">,
  image: ArrayBuffer,
): Promise<ShareRecord> {
  const createdAt = Date.now();

  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    const uploaded = await put(`cards/${meta.id}.png`, image, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
      cacheControlMaxAge: 60 * 60 * 24 * 30,
    });
    const record: ShareRecord = { ...meta, imageUrl: uploaded.url, createdAt };
    await put(`meta/${meta.id}.json`, JSON.stringify(record), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });
    return record;
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, `${meta.id}.png`), Buffer.from(image));
  const record: ShareRecord = { ...meta, imageUrl: `/api/card/${meta.id}`, createdAt };
  await writeFile(path.join(LOCAL_DIR, `${meta.id}.json`), JSON.stringify(record));
  return record;
}

export async function getShare(id: string): Promise<ShareRecord | null> {
  if (!/^[a-f0-9]{8,32}$/i.test(id)) return null;

  if (useBlob()) {
    const { head } = await import("@vercel/blob");
    try {
      const info = await head(`meta/${id}.json`);
      const res = await fetch(info.url, { next: { revalidate: 300 } });
      if (!res.ok) return null;
      return (await res.json()) as ShareRecord;
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

export async function getLocalImage(id: string): Promise<Buffer | null> {
  if (!/^[a-f0-9]{8,32}$/i.test(id)) return null;
  try {
    return await readFile(path.join(LOCAL_DIR, `${id}.png`));
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
