import type { Metadata, Viewport } from "next";
import { fontClassNames } from "@/lib/fonts";
import { EVENT_NAME, HASHTAG } from "@/lib/caption";
import "./globals.css";

export const metadata: Metadata = {
  title: `Builder ID — ${EVENT_NAME}`,
  description: `Make your ${EVENT_NAME} builder ID card in seconds. No login. ${HASHTAG}`,
  applicationName: "HH Goa Builder ID",
  openGraph: {
    title: `Builder ID — ${EVENT_NAME}`,
    description: `Make your ${EVENT_NAME} builder ID card in seconds. No login. ${HASHTAG}`,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#04170a",
  width: "device-width",
  initialScale: 1,
  // The photo stage handles its own pinch-zoom; page zoom stays available.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontClassNames}>
      <head>
        {/* The default template's artwork, fetched alongside the HTML rather
            than after the bundle has parsed and the studio has mounted. */}
        <link rel="preload" as="image" href="/templates/main.webp" type="image/webp" />
      </head>
      <body>{children}</body>
    </html>
  );
}
