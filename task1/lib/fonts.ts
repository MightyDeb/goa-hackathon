import { Space_Grotesk, JetBrains_Mono, Inter } from "next/font/google";
import type { FontBook } from "./templates";

/**
 * next/font self-hosts these at build time: no Google Fonts request at runtime,
 * no FOIT, and no third-party round trip on the critical path.
 */
export const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "block",
  variable: "--font-display",
});

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "block",
  variable: "--font-mono",
});

export const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-body",
});

/**
 * Canvas needs a real family name, not a CSS variable — `style.fontFamily`
 * gives us the hashed family next/font actually registered.
 */
export const FONT_BOOK: FontBook = {
  display: display.style.fontFamily,
  mono: mono.style.fontFamily,
  body: body.style.fontFamily,
};

export const fontClassNames = `${display.variable} ${mono.variable} ${body.variable}`;
