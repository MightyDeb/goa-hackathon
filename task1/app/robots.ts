import type { MetadataRoute } from "next";

/**
 * Keeps the anonymous /share/[id] pages out of search results without using a
 * meta noindex — social crawlers need to fetch those pages to build the link
 * preview card, and a blanket meta directive would apply to them too.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ["Twitterbot", "facebookexternalhit", "LinkedInBot", "Slackbot-LinkExpanding", "WhatsApp", "Discordbot", "TelegramBot"],
        allow: "/",
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: "/share/",
      },
    ],
  };
}
