import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getShare, type ShareRecord } from "@/lib/shareStore";
import { EVENT_NAME, HASHTAG } from "@/lib/caption";
import styles from "./share.module.css";

/**
 * Server-rendered on purpose: X's crawler doesn't execute JavaScript, so the
 * og:image has to be in the initial HTML for the link preview to show the
 * actual card instead of a blank thumbnail (plan §4).
 */

async function absolute(url: string): Promise<string> {
  if (url.startsWith("http")) return url;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${url}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const record = await getShare(id);
  if (!record) return { title: `Card not found — ${EVENT_NAME}` };

  // Prefer the 1200x630 companion: handing crawlers the 4:5 card gets it
  // centre-cropped down to the middle of the photo slot, losing the logo,
  // the name and the dates entirely.
  const preview = await absolute(record.ogUrl ?? record.imageUrl);
  const hasWideOg = Boolean(record.ogUrl);
  const who = record.name ? `${record.name} is a ${record.title}` : record.title;
  const title = `${who} — ${EVENT_NAME}`;
  // Kept near 150 characters: long enough to fill a SERP snippet, short enough
  // not to be truncated in one.
  const description =
    `${record.name || "A builder"} claimed the title of ${record.title} at ` +
    `${EVENT_NAME}, 28–31 Oct. Make your own Builder ID card — no login. ${HASHTAG}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: EVENT_NAME,
      images: [
        {
          url: preview,
          width: hasWideOg ? 1200 : 1080,
          height: hasWideOg ? 630 : 1350,
          alt: title,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [preview],
    },
    // Deliberately NO `robots: { index: false }` here. Keeping these pages out
    // of search is handled in robots.txt, which can exempt the social crawlers;
    // a meta noindex applies to every bot and risks suppressing the link
    // preview card outright — the one thing this page exists to produce.
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record: ShareRecord | null = await getShare(id);
  if (!record) notFound();

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={record.imageUrl}
          alt={`${record.name || "Builder"} — ${record.title}`}
          width={1080}
          height={1350}
          className={styles.image}
        />
      </div>
      <div className={styles.meta}>
        <p className={styles.kicker}>{EVENT_NAME}</p>
        <h1 className={styles.title}>
          {record.name ? `${record.name} — ` : ""}
          {record.title}
        </h1>
        <Link href="/" className={styles.cta}>
          Make your own card
        </Link>
        <p className={styles.tag}>{HASHTAG}</p>
      </div>
    </main>
  );
}
