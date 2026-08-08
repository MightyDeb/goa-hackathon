export const HASHTAG = "#FrameInGoa";
export const EVENT_NAME = "HH Goa 2026";

/**
 * Every vowel-initial title in the pool ("Off-by-One…", "Infinite Scroll…",
 * "Edge Case…", "Uptime Custodian…") reads with "an", so the simple rule is
 * correct here — no "a hour"/"an unicorn" exceptions to worry about.
 */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/** Personalised with the user's own generated title (plan §4). */
export function buildCaption(title: string, name?: string): string {
  const who = title || "Builder";
  const suffix = name ? ` — ${name}` : "";
  return `I'm now officially ${article(who)} ${who} at ${EVENT_NAME} 🏖️${suffix} ${HASHTAG}`;
}

/**
 * `url` is optional on purpose. The card is attached as a real image rather
 * than linked, and X suppresses the link-preview card whenever media is
 * attached — so a URL here would just be dead text in the tweet.
 */
export function tweetIntentUrl(caption: string, url?: string): string {
  const params = new URLSearchParams({ text: caption });
  if (url) params.set("url", url);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function safeFileName(name: string): string {
  const base = (name || "builder").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `hh-goa-2026-${base || "builder"}.png`;
}
