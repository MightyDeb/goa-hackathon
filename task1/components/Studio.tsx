"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_TEMPLATE_ID,
  TEMPLATES,
  TEMPLATE_IMAGE_SOURCES,
  getTemplate,
  imageSourcesFor,
} from "@/lib/templates";
import { loadBackground } from "@/lib/backgrounds";
import {
  clampTransform,
  ensureFontsReady,
  prewarmTemplates,
  clearLayerCache,
  renderCard,
  type PhotoTransform,
} from "@/lib/renderCard";
import { FONT_BOOK } from "@/lib/fonts";
import { ACCEPTED_TYPES, canvasToBlob, loadPhoto } from "@/lib/image";
import { BUILDER_TITLES, ROLES, rollTitle } from "@/lib/titles";
import { EVENT_NAME, buildCaption, safeFileName, tweetIntentUrl } from "@/lib/caption";
import styles from "./studio.module.css";

const NAME_MAX = 24;
const MAX_DPR = 2;

type Scene = { name: string; role: string; title: string; templateId: string };

type Timings = { decode?: number; frame?: number; export?: number };

export default function Studio() {
  const [name, setName] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  // Deterministic on the server. Rolling during render would call Math.random()
  // on both the server and the client and hydrate with two different titles.
  const [title, setTitle] = useState(BUILDER_TITLES[0]);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [zoom, setZoom] = useState(1);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<null | string>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  /** Set only when the popup was blocked, so we can offer a clickable link. */
  const [tweetIntent, setTweetIntent] = useState<string | null>(null);
  const [timings, setTimings] = useState<Timings>({});

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const photoRef = useRef<ImageBitmap | null>(null);
  const transformRef = useRef<PhotoTransform>({ x: 0, y: 0, zoom: 1 });
  const frameRef = useRef<number | null>(null);
  // 0 means "never sized yet" — a non-zero seed here would make the
  // no-op guard in resize() skip the very first sizing pass whenever the
  // stage happened to land on that exact scale, leaving a 300x150 canvas.
  const scaleRef = useRef(0);
  const readyRef = useRef(false);

  // Mirrors state so the rAF callback always reads current values without
  // being re-created (and without re-subscribing listeners) on every keystroke.
  const sceneRef = useRef<Scene>({ name, role, title, templateId });
  sceneRef.current = { name, role, title, templateId };

  const template = useMemo(() => getTemplate(templateId), [templateId]);
  const caption = useMemo(() => buildCaption(title, name), [title, name]);

  /* ---------------------------------------------------------------- *
   * Render loop — every mutation funnels through one coalesced frame
   * ---------------------------------------------------------------- */

  const draw = useCallback(() => {
    frameRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas || !readyRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const started = performance.now();
    const scene = sceneRef.current;
    renderCard(
      ctx,
      {
        name: scene.name,
        role: scene.role,
        title: scene.title,
        photo: photoRef.current,
        transform: transformRef.current,
      },
      getTemplate(scene.templateId),
      FONT_BOOK,
      scaleRef.current,
    );
    const ms = performance.now() - started;
    // Only surface the slow frames; updating state every frame would itself
    // become the bottleneck during a drag.
    setTimings((t) => (Math.abs((t.frame ?? 0) - ms) > 0.8 ? { ...t, frame: ms } : t));
  }, []);

  const schedule = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  /* ---------------------------------------------------------------- *
   * Sizing
   * ---------------------------------------------------------------- */

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const cssWidth = stage.clientWidth;
    if (!cssWidth) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const scale = (cssWidth * dpr) / TEMPLATES[0].width;
    if (scaleRef.current !== 0 && Math.abs(scale - scaleRef.current) < 0.001) return;

    scaleRef.current = scale;
    canvas.width = Math.round(TEMPLATES[0].width * scale);
    canvas.height = Math.round(TEMPLATES[0].height * scale);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${(cssWidth * TEMPLATES[0].height) / TEMPLATES[0].width}px`;

    // Baked layers are resolution-specific; drop them and re-bake at the new one.
    clearLayerCache();
    prewarmTemplates([getTemplate(sceneRef.current.templateId)], scale);
    schedule();
  }, [schedule]);

  /* ---------------------------------------------------------------- *
   * Boot: fonts before the first text draw (plan §6), then prewarm
   * ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    const stage = stageRef.current;

    const observer = new ResizeObserver(() => resize());
    if (stage) observer.observe(stage);

    (async () => {
      // Fonts gate the first text draw (plan §6), but they must never gate it
      // forever: if the font pipeline stalls, paint with the fallback family
      // and repaint once the real faces land. A blank card is worse than a
      // briefly-unstyled one.
      await Promise.race([
        ensureFontsReady(FONT_BOOK, TEMPLATES),
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ]);
      if (cancelled) return;
      readyRef.current = true;
      setReady(true);
      document.fonts?.ready.then(() => {
        if (!cancelled) schedule();
      });
      resize();
      schedule();

      // The current template's artwork and logo first — it's the only card on
      // screen. Its layer is re-baked and cached once the images land.
      void Promise.all(
        imageSourcesFor(getTemplate(sceneRef.current.templateId)).map(loadBackground),
      ).then(() => {
        if (!cancelled) schedule();
      });

      // Everything else while the user is still reading the form, so both the
      // picker and the export are warm by the time they're used.
      const idle =
        window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
      idle(() => {
        if (cancelled) return;
        void Promise.all(TEMPLATE_IMAGE_SOURCES.map(loadBackground)).then(() => {
          if (cancelled) return;
          prewarmTemplates(TEMPLATES, scaleRef.current);
          schedule();
        });
      });
    })();

    try {
      const probe = new File([new Uint8Array(1)], "probe.png", { type: "image/png" });
      setCanShareFiles(Boolean(navigator.canShare?.({ files: [probe] })));
    } catch {
      setCanShareFiles(false);
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        // Must clear the handle, not just cancel it. schedule() treats a
        // non-null handle as "a frame is already queued", so leaving a stale
        // id here wedges the render loop permanently — every later schedule()
        // returns early and the canvas never repaints again. StrictMode's
        // mount/unmount/remount in dev hits this every single time.
        frameRef.current = null;
      }
    };
  }, [resize, schedule]);

  // Randomise the title once we're past hydration.
  useEffect(() => {
    setTitle((prev) => rollTitle(prev));
  }, []);

  // Any scene change repaints on the next frame.
  useEffect(() => {
    schedule();
  }, [name, role, title, templateId, schedule]);

  // Switching to a template whose images haven't arrived yet: fetch and
  // repaint. Renders immediately on the fallback colour in the meantime.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(imageSourcesFor(getTemplate(templateId)).map(loadBackground)).then(() => {
      if (!cancelled) schedule();
    });
    return () => {
      cancelled = true;
    };
  }, [templateId, schedule]);

  /* ---------------------------------------------------------------- *
   * Photo intake
   * ---------------------------------------------------------------- */

  const acceptFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
        setStatus("That file isn't an image.");
        return;
      }
      setBusy("Reading photo…");
      setStatus(null);
      try {
        const { bitmap, ms, usedHeicFallback } = await loadPhoto(file);
        photoRef.current?.close?.();
        photoRef.current = bitmap;
        transformRef.current = { x: 0, y: 0, zoom: 1 };
        setZoom(1);
        setHasPhoto(true);
        setTimings((t) => ({ ...t, decode: ms }));
        setStatus(usedHeicFallback ? "HEIC converted — drag to reposition." : null);
        schedule();
      } catch (error) {
        console.error(error);
        setStatus("Couldn't read that photo. Try a JPG or PNG.");
      } finally {
        setBusy(null);
      }
    },
    [schedule],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? [])[0];
      if (file) void acceptFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptFile]);

  /* ---------------------------------------------------------------- *
   * Reposition: drag + pinch + wheel, all writing to a ref so no React
   * re-render happens between pointermove and paint.
   * ---------------------------------------------------------------- */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ x: number; y: number; t: PhotoTransform } | null>(null);
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);

  const commit = useCallback(
    (next: PhotoTransform) => {
      const photo = photoRef.current;
      if (!photo) return;
      transformRef.current = clampTransform(next, getTemplate(sceneRef.current.templateId).slot, {
        width: photo.width,
        height: photo.height,
      });
      schedule();
    },
    [schedule],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!hasPhoto) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = { x: event.clientX, y: event.clientY, t: { ...transformRef.current } };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: transformRef.current.zoom,
      };
      dragStart.current = null;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const stage = stageRef.current;
    if (!stage) return;

    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const next = pinchStart.current.zoom * (dist / pinchStart.current.dist);
      const clamped = Math.min(4, Math.max(1, next));
      commit({ ...transformRef.current, zoom: clamped });
      setZoom(clamped);
      return;
    }

    if (!dragStart.current) return;
    const slot = getTemplate(sceneRef.current.templateId).slot;
    const cssWidth = stage.clientWidth;
    const cardW = TEMPLATES[0].width;
    // CSS pixels → design units → fraction of the slot.
    const perPx = cardW / cssWidth;
    const dx = ((event.clientX - dragStart.current.x) * perPx) / slot.w;
    const dy = ((event.clientY - dragStart.current.y) * perPx) / slot.h;
    commit({
      zoom: dragStart.current.t.zoom,
      x: dragStart.current.t.x + dx,
      y: dragStart.current.t.y + dy,
    });
  };

  const endPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) dragStart.current = null;
    else {
      const [first] = [...pointers.current.values()];
      dragStart.current = { x: first.x, y: first.y, t: { ...transformRef.current } };
    }
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    if (!hasPhoto) return;
    const next = Math.min(4, Math.max(1, transformRef.current.zoom * (1 - event.deltaY / 600)));
    commit({ ...transformRef.current, zoom: next });
    setZoom(next);
  };

  const nudge = (dx: number, dy: number) => {
    commit({
      ...transformRef.current,
      x: transformRef.current.x + dx,
      y: transformRef.current.y + dy,
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!hasPhoto) return;
    const step = event.shiftKey ? 0.05 : 0.012;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      nudge(move[0], move[1]);
    }
  };

  /* ---------------------------------------------------------------- *
   * Export — kept warm so Download/Share don't wait on a render
   * ---------------------------------------------------------------- */

  const exportCache = useRef<{ key: string; blob: Blob } | null>(null);

  const sceneKey = useCallback(() => {
    const t = transformRef.current;
    const s = sceneRef.current;
    return [s.name, s.role, s.title, s.templateId, hasPhoto, t.x.toFixed(4), t.y.toFixed(4), t.zoom.toFixed(3)].join("|");
  }, [hasPhoto]);

  const exportBlob = useCallback(async (): Promise<Blob> => {
    const key = sceneKey();
    if (exportCache.current?.key === key) return exportCache.current.blob;

    const started = performance.now();
    const config = getTemplate(sceneRef.current.templateId);

    // Never export a card missing its backdrop or logo just because the user
    // hit Download before the artwork finished loading.
    await Promise.all(imageSourcesFor(config).map(loadBackground));

    const canvas = document.createElement("canvas");
    canvas.width = config.width;
    canvas.height = config.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");

    const scene = sceneRef.current;
    renderCard(
      ctx,
      {
        name: scene.name,
        role: scene.role,
        title: scene.title,
        photo: photoRef.current,
        transform: transformRef.current,
      },
      config,
      FONT_BOOK,
      1,
    );
    const blob = await canvasToBlob(canvas, "image/png");
    exportCache.current = { key, blob };
    setTimings((t) => ({ ...t, export: performance.now() - started }));
    return blob;
  }, [sceneKey]);

  // Pre-render the full-size PNG once the user stops fiddling, so tapping
  // Download or Share is instant instead of kicking off a 1080x1350 render.
  //
  // Debounced *and* deferred to idle: baking the export-resolution layers plus
  // PNG-encoding 1080x1350 costs ~120ms of main thread, which would be a
  // visible hitch if it landed while someone was still dragging the photo.
  useEffect(() => {
    if (!ready) return;
    let idleHandle: number | undefined;
    const timer = window.setTimeout(() => {
      const idle = window.requestIdleCallback;
      if (idle) idleHandle = idle(() => void exportBlob().catch(() => undefined), { timeout: 2000 });
      else void exportBlob().catch(() => undefined);
    }, 450);
    return () => {
      window.clearTimeout(timer);
      if (idleHandle !== undefined) window.cancelIdleCallback?.(idleHandle);
    };
  }, [ready, name, role, title, templateId, zoom, hasPhoto, exportBlob]);

  const onDownload = async () => {
    setBusy("Building your card…");
    try {
      const blob = await exportBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safeFileName(name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus("Card downloaded.");
    } catch (error) {
      console.error(error);
      setStatus("Download failed — try again.");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Always opens X's own compose box, pre-filled. The card is uploaded first so
   * the tweet carries a /share/[id] link whose OG tags render the actual card
   * as the preview image. Still no X API and no OAuth (plan §4).
   */
  const onShareX = async () => {
    // Popup blockers only allow window.open synchronously inside the gesture,
    // so the tab is opened now and pointed at X once the upload lands.
    //
    // Deliberately NOT "noopener": with that feature the spec makes window.open
    // return null while still opening the tab, which leaves the user staring at
    // a stranded about:blank we have no handle to navigate. We take the handle
    // and sever `opener` ourselves instead.
    const pending = window.open("about:blank", "_blank");
    if (pending) {
      try {
        pending.opener = null;
      } catch {
        /* cross-origin guard; nothing to sever */
      }
      // Something to look at while the upload runs.
      pending.document.write(
        `<!doctype html><meta charset="utf-8"><title>Opening X…</title>` +
          `<body style="margin:0;display:grid;place-items:center;height:100vh;` +
          `background:#0a0518;color:#f4f0ff;font:16px system-ui">` +
          `Preparing your card, then opening X…</body>`,
      );
      pending.document.close();
    }

    setBusy("Uploading card for the tweet preview…");
    try {
      const blob = await exportBlob();
      const file = new File([blob], safeFileName(name), { type: "image/png" });

      const form = new FormData();
      form.append("image", file);
      form.append("name", name);
      form.append("title", title);
      form.append("template", templateId);
      const res = await fetch("/api/share", { method: "POST", body: form });
      if (!res.ok) {
        // Surface the server's stated cause rather than a bare status code.
        const detail = await res
          .json()
          .then((d: { reason?: string; blobConfigured?: boolean }) =>
            d.blobConfigured === false
              ? "storage not configured"
              : (d.reason ?? `HTTP ${res.status}`),
          )
          .catch(() => `HTTP ${res.status}`);
        throw new Error(detail);
      }
      const { shareUrl } = (await res.json()) as { shareUrl: string };

      const intent = tweetIntentUrl(caption, shareUrl);
      if (pending && !pending.closed) {
        pending.location.replace(intent);
        setStatus("X opened with your caption and card preview.");
        return;
      }

      // Popup was blocked. A second window.open after an await is usually
      // blocked too, so surface a real link the user can click instead of
      // silently doing nothing.
      const opened = window.open(intent, "_blank", "noopener");
      if (!opened) {
        setTweetIntent(intent);
        setStatus("Popup blocked — use the “Open X” link below.");
      } else {
        setStatus("X opened with your caption and card preview.");
      }
    } catch (error) {
      pending?.close();
      console.error(error);
      const why = error instanceof Error ? error.message : String(error);
      setStatus(`Couldn't open X (${why}). Download the card and post it manually.`);
    } finally {
      setBusy(null);
    }
  };

  /** OS share sheet with the real PNG attached. Nothing is uploaded. */
  const onNativeShare = async () => {
    setBusy("Preparing share…");
    try {
      const blob = await exportBlob();
      const file = new File([blob], safeFileName(name), { type: "image/png" });
      if (!navigator.canShare?.({ files: [file] })) {
        setStatus("This browser can't share files — use Share on X.");
        return;
      }
      await navigator.share({ files: [file], text: caption, title: `${EVENT_NAME} Builder ID` });
      setStatus("Shared.");
    } catch (error) {
      if ((error as Error)?.name === "AbortError") setStatus(null);
      else {
        console.error(error);
        setStatus("Share sheet didn't open. Try Download instead.");
      }
    } finally {
      setBusy(null);
    }
  };

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDropActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void acceptFile(file);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>{EVENT_NAME}</p>
        <h1 className={styles.h1}>Builder ID</h1>
      </header>

      <div className={styles.layout}>
        {/* ---------------- Preview ---------------- */}
        <section className={styles.previewCol} aria-label="Card preview">
          <div
            ref={stageRef}
            className={`${styles.stage} ${dropActive ? styles.stageDrop : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={onDrop}
          >
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              role="img"
              aria-label={`Builder ID card for ${name || "your name"}, ${title}`}
              tabIndex={hasPhoto ? 0 : -1}
              style={{ cursor: hasPhoto ? "grab" : "default", touchAction: hasPhoto ? "none" : "auto" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
              onWheel={onWheel}
              onKeyDown={onKeyDown}
            />
            {!ready && <div className={styles.shimmer} aria-hidden />}
            {!hasPhoto && ready && (
              <button
                type="button"
                className={styles.stageCta}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className={styles.stageCtaIcon} aria-hidden>
                  ＋
                </span>
                Add your photo
                <span className={styles.stageCtaHint}>drag, drop or paste</span>
              </button>
            )}
          </div>

          {hasPhoto && (
            <div className={styles.repositionBar}>
              <label className={styles.zoomLabel} htmlFor="zoom">
                Zoom
              </label>
              <input
                id="zoom"
                className={styles.zoom}
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={zoom}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setZoom(next);
                  commit({ ...transformRef.current, zoom: next });
                }}
              />
              <button
                type="button"
                className={styles.ghost}
                onClick={() => {
                  transformRef.current = { x: 0, y: 0, zoom: 1 };
                  setZoom(1);
                  schedule();
                }}
              >
                Reset
              </button>
            </div>
          )}
          <p className={styles.hint}>
            {hasPhoto
              ? "Drag the card to reposition · pinch or scroll to zoom · arrow keys nudge"
              : "Your photo never leaves this device unless you use the desktop share link."}
          </p>
        </section>

        {/* ---------------- Controls ---------------- */}
        <section className={styles.controls} aria-label="Card details">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className={styles.fileInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void acceptFile(file);
              e.target.value = "";
            }}
          />

          <button type="button" className={styles.upload} onClick={() => fileInputRef.current?.click()}>
            {hasPhoto ? "Replace photo" : "Upload photo"}
          </button>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Name
              <span className={styles.counter}>
                {name.length}/{NAME_MAX}
              </span>
            </label>
            <input
              id="name"
              className={styles.input}
              value={name}
              maxLength={NAME_MAX}
              placeholder="Your name"
              autoComplete="name"
              enterKeyHint="done"
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="role">
              Stack / role
            </label>
            <select
              id="role"
              className={styles.input}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Builder title</span>
            <div className={styles.titleRow}>
              <output className={styles.titleValue}>{title}</output>
              <button
                type="button"
                className={styles.reroll}
                onClick={() => setTitle((prev) => rollTitle(prev))}
              >
                Reroll
              </button>
            </div>
            <p className={styles.microHint}>Assigned, not typed. Reroll until it fits you.</p>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Template</span>
            <div className={styles.templates} role="radiogroup" aria-label="Card template">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={t.id === templateId}
                  className={`${styles.templateChip} ${t.id === templateId ? styles.templateChipOn : ""}`}
                  onClick={() => setTemplateId(t.id)}
                >
                  {/* The real artwork, not an abstract colour chip — it's
                      already loaded, so the picker may as well show it. */}
                  <span
                    className={styles.swatch}
                    style={
                      t.backdrop.kind === "image"
                        ? {
                            backgroundImage: `linear-gradient(135deg, ${t.swatch[0]}55, ${t.swatch[1]}33), url(${t.backdrop.src})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : { background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }
                    }
                    aria-hidden
                  />
                  <span className={styles.templateText}>
                    <strong>{t.label}</strong>
                    <em>{t.blurb}</em>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.captionPreview}>
            <span className={styles.label}>Tweet caption</span>
            <p>{caption}</p>
          </div>
        </section>
      </div>

      {/* ---------------- Sticky actions ---------------- */}
      <div className={styles.actionBar}>
        <div className={styles.actionInner}>
          <button
            type="button"
            className={styles.secondary}
            onClick={onDownload}
            disabled={!ready || busy !== null}
          >
            Download
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={onShareX}
            disabled={!ready || busy !== null}
          >
            <XLogo />
            <span>Share on X</span>
          </button>
          {canShareFiles ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={onNativeShare}
              disabled={!ready || busy !== null}
            >
              Share…
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(caption)
                  .then(() => setStatus("Caption copied."))
                  .catch(() => setStatus("Couldn't copy the caption."));
              }}
              disabled={!ready || busy !== null}
            >
              Copy text
            </button>
          )}
        </div>
        {tweetIntent && (
          <a className={styles.blockedLink} href={tweetIntent} target="_blank" rel="noreferrer">
            Open X →
          </a>
        )}
        <p className={styles.statusLine} role="status" aria-live="polite">
          {busy ?? status ?? <Timing timings={timings} template={template.label} />}
        </p>
      </div>
    </main>
  );
}

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden focusable="false">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function Timing({ timings, template }: { timings: Timings; template: string }) {
  const parts = [template];
  if (timings.decode) parts.push(`decode ${Math.round(timings.decode)}ms`);
  if (timings.frame) parts.push(`frame ${timings.frame.toFixed(1)}ms`);
  if (timings.export) parts.push(`export ${Math.round(timings.export)}ms`);
  return <span className={styles.timing}>{parts.join(" · ")}</span>;
}
