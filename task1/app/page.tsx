import Studio from "@/components/Studio";

/**
 * Static shell — no data fetching, no server round trip before the studio is
 * interactive. The card itself is drawn client-side from the first frame.
 */
export default function Page() {
  return <Studio />;
}
