# HH Goa 2026 — Builder ID Card Generator (Format B): Build Plan

Deadline: **11:59pm, 13 Aug 2026** (today: 7 Aug — 6 days)

Format chosen: **B — Builder ID Card**, with a template picker (2–3 designs).

---

## 1. Flow

1. **Upload photo** — jpg, png, HEIC from iPhone must all work.
2. **Fill fields** — name (required, capped length), stack/role (required or optional), builder title (**auto-generated**, not typed — see §3).
3. **Reposition photo** — drag/zoom the photo inside its slot on the card so off-center or oddly-cropped photos still look right.
4. **Pick a template** — 2–3 predefined card designs. Selecting one re-renders the same data through a different visual config, instantly, client-side.
5. **Preview** — composited card shown immediately (canvas render, not a network round trip).
6. **Download** — real image file (PNG/JPG), not just an on-screen render.
7. **Share to X** — opens a pre-filled tweet with caption + `#FrameInGoa`. See §4 for exactly how — this is the part to get right.

No login, no signup gate, anywhere before the result is shown.

---

## 2. Templates

Templates are just data, not separate code paths. One `renderCard(data, templateConfig)` function takes:

- `data`: photo (positioned/cropped), name, role, builder title
- `templateConfig`: background image, photo slot position/shape/size, text positions, fonts, colors

2–3 `templateConfig` objects give you visual variety (e.g. "Neon Panjim," "Sunset Badge," "Minimal Mono") without duplicating logic. Switching templates just re-runs the same composite — no re-upload, no re-crop.

Design each template config to be genuinely different (not just recolors) so it reads as real choice, not a palette swap — this reinforces "on-brand," not generic.

---

## 3. Fields & builder title generator

- **Name**: text input, hard cap (~24 chars) or auto-shrink font size to fit — pick one approach and test it, don't leave it to chance at render time.
- **Stack/role**: short text or a small preset dropdown (Full-stack, ML, Design, Infra, etc.) — a dropdown is safer for consistent card layout than free text.
- **Builder title**: **not typed by the user.** Auto-generate from a curated pool (30–50 combos) of Goa/hacker-flavored phrases, e.g. "Chaos Engineer of Panjim," "Full-Stack Beach Coder," "Prod-Breaker in Residence." Optionally let them hit "reroll" once or twice before locking it in. Keep this a static local list — no API call, so it's instant and never fails.

---

## 4. Share to X — no X API, no auto-posting

**Important correction from the brief:** the requirement is to **"open a pre-filled tweet"** — not to post on the user's behalf via the X API. Building an auto-post integration would require each user to OAuth their X account (effectively a login wall, which the brief explicitly rules out) plus an approved X Developer App with write access, which is a real risk to your 6-day timeline. Skip it entirely.

Instead:

1. **Primary path (mobile):** `navigator.share({ files: [cardImageFile], text: caption })` — opens the OS share sheet with the actual image attached; if X is installed, the user picks it and posts from their own logged-in session. No auth, no API keys.
2. **Fallback path (desktop / unsupported browsers):** upload the generated image to storage, get a short-lived unique URL (`/share/[id]`), then open `https://twitter.com/intent/tweet?text=<caption>&url=<that link>` in a new tab. This opens X's own compose box, pre-filled, in the user's existing X session (or prompts their normal login if logged out — that's X's own flow, not yours).

For the fallback to satisfy "link preview shows the actual graphic," `/share/[id]` must be a server-rendered page (not client-only React) with `<meta property="og:image">` pointing at that specific user's generated image — X's crawler doesn't execute JS.

**Personalize the caption** using their own data — free and makes the share more compelling:
`"I'm now officially a [Builder Title] at HH Goa 2026 🏖️ #FrameInGoa"`

---

## 5. Recommended stack

- **Next.js on Vercel** — serverless functions for the `/share/[id]` OG page, Vercel Blob (or Cloudinary/S3) for transient storage of the fallback-share images only.
- **Canvas API**, no heavy image-editing library — one `renderCard()` function, template configs as data.
- **heic2any** for iPhone HEIC → canvas-readable conversion.
- Card templates as static image assets + a JSON/JS config array — not separate components.

---

## 6. Mobile-first specifics

- Single column, large tap targets, sticky Download/Share buttons visible without scrolling.
- Test HEIC upload on a real iPhone in Safari specifically.
- Test `navigator.share` with files on iOS Safari, Android Chrome, and desktop separately — support differs; always keep the link fallback working, not just as a theoretical path.
- Keep font loading verified (`document.fonts.ready`) before any canvas text draw, on every template.

---

## 7. Suggested 6-day timeline

| Day | Focus |
|---|---|
| **Day 1 (today)** | Confirm 2–3 template concepts + assets (backgrounds, fonts, logo); scaffold Next.js + Vercel project; set up storage bucket for fallback share images. |
| **Day 2** | Upload + HEIC handling; fields form; builder-title generator pool; basic `renderCard()` with one template. |
| **Day 3** | Photo reposition/crop in slot; wire up remaining 2 templates via config; text overflow handling (name length). |
| **Day 4** | Download flow; Share flow — Web Share primary, `/share/[id]` OG fallback page; validate link preview with X's card validator. |
| **Day 5** | Mobile device testing (real iPhone + Android), polish, edge cases (very long names, tiny/huge photos, all 3 templates). |
| **Day 6** | Buffer for bugs, final deploy, submit link via the form. |

---

## 8. Pre-submission test checklist

- [ ] Upload: portrait, landscape, square, HEIC from iPhone, very large file, low-res file
- [ ] Off-center photo still looks right after reposition, on all 3 templates
- [ ] Very long name doesn't break card layout
- [ ] Builder title reroll works and never errors (fully local, no network dependency)
- [ ] Template switch re-renders instantly with the same data
- [ ] Download produces a real, openable image file
- [ ] Share on iOS Safari, Android Chrome, desktop Chrome/Safari
- [ ] Fallback tweet-intent link preview shows the actual generated card, not a blank/default thumbnail
- [ ] Caption includes personalized builder title + `#FrameInGoa`
- [ ] No login/signup/X-auth wall appears anywhere in the flow
- [ ] Upload-to-result feels like a few seconds, not a spinner

---

## 9. Known risks

- **X auto-posting temptation**: resist building real API posting — it adds an OAuth/login step and developer-app approval risk you don't have time for, and isn't what the brief asks for.
- **OG image caching**: X caches previews per-URL. Make `/share/[id]` IDs unique per generated image (random/content-derived), never reused, or a stale preview may show.
- **HEIC conversion speed**: can lag on very large iPhone photos — consider downscaling before conversion.
- **Web Share API inconsistency**: don't assume file-sharing support everywhere — the link fallback must be genuinely tested, not just theoretical.
- **Storage cleanup**: fallback-share images are uploaded anonymously (no login) — set a TTL/expiry so storage doesn't grow unbounded.
