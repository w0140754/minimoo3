(() => {
  "use strict";

  // ===== Mobile Controls (v16 debug) =====
  // Changes vs prior:
  // - Adds an on-screen "MC v16" badge so you can confirm you actually loaded this file.
  // - Uses iPhone safe-area insets for sizing.
  // - Limits horizontal fill to 92% of usable width to avoid edge overlap (adjustable).
  // - Tries harder to keep the hamburger/menu button above the canvas via CSS + JS.

  const MC_VERSION = "v16-debug";

  function isProbablyMobile() {
    const hasTouch =
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
      ("ontouchstart" in window);
    const coarsePointer =
      window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const smallScreen =
      window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
    const ua = (navigator.userAgent || "").toLowerCase();
    const uaMobile = /(android|iphone|ipad|ipod|mobile|silk|kindle)/.test(ua);
    return (hasTouch && coarsePointer) || (uaMobile && (hasTouch || smallScreen));
  }

  if (!isProbablyMobile()) return;

  function getCanvas() {
    return document.getElementById("c");
  }

  function getVP() {
    const vv = window.visualViewport;
    if (vv && vv.width && vv.height) {
      return {
        w: Math.max(1, Math.round(vv.width)),
        h: Math.max(1, Math.round(vv.height)),
      };
    }
    return { w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) };
  }

  function getSafeInsets() {
    const cs = getComputedStyle(document.documentElement);
    const toPx = (v) => {
      const n = parseFloat(String(v || "").replace("px", ""));
      return Number.isFinite(n) ? n : 0;
    };
    return {
      top: toPx(cs.getPropertyValue("--mc-safe-top")),
      right: toPx(cs.getPropertyValue("--mc-safe-right")),
      bottom: toPx(cs.getPropertyValue("--mc-safe-bottom")),
      left: toPx(cs.getPropertyValue("--mc-safe-left")),
    };
  }

  // ===== CSS / layout =====
  const style = document.createElement("style");
  style.textContent = `
    :root {
      --mc-safe-top: env(safe-area-inset-top);
      --mc-safe-right: env(safe-area-inset-right);
      --mc-safe-bottom: env(safe-area-inset-bottom);
      --mc-safe-left: env(safe-area-inset-left);
    }

    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      width: 100%;
      overflow: hidden;
      overscroll-behavior: none;
      touch-action: manipulation;
      background: #000;
    }

    /* Hide simple desktop text headers if present */
    body > h1, body > p {
      display: none !important;
    }

    #gameWrap {
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
      background: #000;
      box-sizing: border-box;
      padding: var(--mc-safe-top) var(--mc-safe-right) var(--mc-safe-bottom) var(--mc-safe-left);
      z-index: 0;
    }

    #c {
      position: absolute !important;
      left: 50% !important;
      top: 50% !important;
      transform: translate(-50%, -50%);
      display: block !important;
      image-rendering: pixelated;
      touch-action: none;
      z-index: 1;
    }

    /* Try to keep common menu/hamburger elements above the canvas */
    #menuBtn, #hamburger, #menu, .hamburger, .menu-btn, .menuButton,
    [aria-label*="menu" i], [aria-label*="hamburger" i] {
      z-index: 2147483605 !important;
      position: fixed !important;
    }

    .mc-touch-zone {
      position: fixed;
      left: 0;
      top: 0;
      width: 20vw;
      height: 100vh;
      z-index: 2147483000;
      touch-action: none;
      background: transparent;
    }

    .mc-rotate-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      display: none;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
      background: rgba(0,0,0,0.92);
      color: #fff;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      font-size: 18px;
      line-height: 1.35;
    }
    .mc-rotate-overlay strong { font-size: 22px; display:block; margin-bottom: 8px; }
  `;
  document.head.appendChild(style);

  // Ensure wrapper exists and owns the canvas.
  function ensureWrap() {
    const canvas = getCanvas();
    if (!canvas) return null;

    let wrap = document.getElementById("gameWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "gameWrap";
      canvas.parentNode.insertBefore(wrap, canvas);
      wrap.appendChild(canvas);
    } else if (canvas.parentNode !== wrap) {
      wrap.appendChild(canvas);
    }
    return { wrap, canvas };
  }

  function isLandscapeNow() {
    const vp = getVP();
    return vp.w >= vp.h;
  }

  // ===== Camera-safe zoom =====
  const BASE_W = 800;
  const BASE_H = 600;

  // User requested: 3/2 zoom => 1.5x bigger tiles / less world visible.
  const MOBILE_ZOOM = 3 / 2;

  // Keep vertical zoom fixed
  const MOBILE_H = Math.round(BASE_H / MOBILE_ZOOM); // ~400
  const MIN_MOBILE_W = Math.round(BASE_W / MOBILE_ZOOM); // ~533

  // Expand horizontal view to use wide screens, but cap it
  const MAX_INTERNAL_W = 960;

  // Fill a bit less than full usable width to avoid edge overlap (adjustable)
  const HORIZONTAL_FILL = 0.92; // try 0.90 if you want more margin

  function elevateHamburger() {
    // If the game creates the hamburger dynamically, try to find and raise it.
    const candidates = [];
    candidates.push(document.getElementById("menuBtn"));
    candidates.push(document.getElementById("hamburger"));
    candidates.push(document.getElementById("menu"));
    candidates.push(document.querySelector(".hamburger"));
    candidates.push(document.querySelector(".menu-btn"));
    candidates.push(document.querySelector(".menuButton"));
    candidates.push(document.querySelector("[aria-label*='menu' i]"));
    candidates.push(document.querySelector("[aria-label*='hamburger' i]"));

    for (const el of document.querySelectorAll("button, div, span, a")) {
      const t = (el.textContent || "").trim();
      if (t === "☰" || t === "≡") {
        candidates.push(el);
        break;
      }
    }

    const btn = candidates.find(Boolean);
    if (!btn) return;

    btn.style.zIndex = "2147483605";
    const pos = getComputedStyle(btn).position;
    if (pos !== "fixed" && pos !== "absolute") {
      const safe = getSafeInsets();
      btn.style.position = "fixed";
      btn.style.left = Math.round(safe.left + 10) + "px";
      btn.style.top = Math.round(safe.top + 10) + "px";
    }
  }

  function resizeCanvasInternal() {
    const ctx = ensureWrap();
    if (!ctx) return;
    const { canvas } = ctx;

    const vp = getVP();
    const safe = getSafeInsets();
    const usableW = Math.max(1, vp.w - safe.left - safe.right);
    const usableH = Math.max(1, vp.h - safe.top - safe.bottom);

    // Match internal width to phone aspect ratio (within caps), keeping vertical zoom fixed.
    const desiredW = Math.round(MOBILE_H * (usableW / usableH));
    const internalW = Math.max(MIN_MOBILE_W, Math.min(desiredW, MAX_INTERNAL_W));
    const internalH = MOBILE_H;

    // Force internal resolution (THIS is what the camera uses).
    if (canvas.width !== internalW) canvas.width = internalW;
    if (canvas.height !== internalH) canvas.height = internalH;

    // Scale to fit within safe area, with a little horizontal margin.
    const scale = Math.min((usableW * HORIZONTAL_FILL) / internalW, usableH / internalH);
    const dispW = Math.round(internalW * scale);
    const dispH = Math.round(internalH * scale);

    canvas.style.width = dispW + "px";
    canvas.style.height = dispH + "px";

    elevateHamburger();
  }

  // Run resize multiple times to "win" races with game init flows.
  function scheduleResizes() {
    const times = [0, 50, 150, 300, 700, 1200];
    for (const t of times) {
      setTimeout(() => {
        if (isLandscapeNow()) {
          resizeCanvasInternal();
          elevateHamburger();
        }
      }, t);
    }
  }

  // ===== Landscape lock overlay =====
  const rotateOverlay = document.createElement("div");
  rotateOverlay.className = "mc-rotate-overlay";
  rotateOverlay.innerHTML = `<div><strong>Rotate your phone</strong>This game is landscape-only.</div>`;
  document.body.appendChild(rotateOverlay);

  // ===== Virtual joystick (single instance, no accumulation) =====
  const touchZone = document.createElement("div");
  touchZone.className = "mc-touch-zone";
  document.body.appendChild(touchZone);

  const joy = document.createElement("div");
  const knob = document.createElement("div");
  joy.style.cssText = `
    position: fixed;
    width: 120px;
    height: 120px;
    border-radius: 999px;
    background: rgba(255,255,255,0.10);
    border: 2px solid rgba(255,255,255,0.20);
    z-index: 2147483600;
    display: none;
    pointer-events: none;
    transform: translate(-60px, -60px);
  `;
  knob.style.cssText = `
    position: absolute;
    left: 50%;
    top: 50%;
    width: 56px;
    height: 56px;
    border-radius: 999px;
    background: rgba(255,255,255,0.22);
    border: 2px solid rgba(255,255,255,0.28);
    transform: translate(-50%, -50%);
  `;
  joy.appendChild(knob);
  document.body.appendChild(joy);

  const RADIUS = 46;
  const DEADZONE = 10;

  let active = false;
  let startX = 0,
    startY = 0;
  let currentDirs = new Set();

  function dispatchKey(type, key) {
    const ev = new KeyboardEvent(type, { key, bubbles: true });
    window.dispatchEvent(ev);
    document.dispatchEvent(ev);
  }

  function setDirs(next) {
    for (const k of currentDirs) {
      if (!next.has(k)) dispatchKey("keyup", k);
    }
    for (const k of next) {
      if (!currentDirs.has(k)) dispatchKey("keydown", k);
    }
    currentDirs = next;
  }

  function stopAll() {
    setDirs(new Set());
  }

  function showJoystick(x, y) {
    joy.style.left = `${x}px`;
    joy.style.top = `${y}px`;
    joy.style.display = "block";
    knob.style.transform = "translate(-50%, -50%)";
  }

  function hideJoystick() {
    joy.style.display = "none";
    knob.style.transform = "translate(-50%, -50%)";
  }

  function onStart(x, y, pointerId) {
    active = true;
    startX = x;
    startY = y;
    showJoystick(x, y);
    if (typeof pointerId === "number" && touchZone.setPointerCapture) {
      try {
        touchZone.setPointerCapture(pointerId);
      } catch (_) {}
    }
  }

  function onMove(x, y) {
    if (!active) return;

    const dx = x - startX;
    const dy = y - startY;

    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, RADIUS);
    const angle = Math.atan2(dy, dx);

    const nx = Math.cos(angle) * clampedDist;
    const ny = Math.sin(angle) * clampedDist;

    knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;

    const next = new Set();
    if (Math.abs(nx) > DEADZONE) next.add(nx > 0 ? "ArrowRight" : "ArrowLeft");
    if (Math.abs(ny) > DEADZONE) next.add(ny > 0 ? "ArrowDown" : "ArrowUp");
    setDirs(next);
  }

  function onEnd(pointerId) {
    if (!active) return;
    active = false;
    stopAll();
    hideJoystick();
    if (typeof pointerId === "number" && touchZone.releasePointerCapture) {
      try {
        touchZone.releasePointerCapture(pointerId);
      } catch (_) {}
    }
  }

  touchZone.addEventListener(
    "pointerdown",
    (e) => {
      if (!isLandscapeNow()) return;
      e.preventDefault();
      onStart(e.clientX, e.clientY, e.pointerId);
    },
    { passive: false }
  );

  touchZone.addEventListener(
    "pointermove",
    (e) => {
      if (!active) return;
      e.preventDefault();
      onMove(e.clientX, e.clientY);
    },
    { passive: false }
  );

  touchZone.addEventListener(
    "pointerup",
    (e) => {
      e.preventDefault();
      onEnd(e.pointerId);
    },
    { passive: false }
  );

  touchZone.addEventListener(
    "pointercancel",
    (e) => {
      e.preventDefault();
      onEnd(e.pointerId);
    },
    { passive: false }
  );

  window.addEventListener("blur", () => onEnd(undefined));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) onEnd(undefined);
  });

  // ===== Orientation handling =====
  function applyOrientationMode() {
    const landscape = isLandscapeNow();
    rotateOverlay.style.display = landscape ? "none" : "flex";

    if (!landscape) {
      onEnd(undefined);
      touchZone.style.display = "none";
    } else {
      touchZone.style.display = "block";
      resizeCanvasInternal();
      scheduleResizes();
      setTimeout(elevateHamburger, 0);
    }
  }

  window.addEventListener("resize", applyOrientationMode, { passive: true });
  window.addEventListener("orientationchange", applyOrientationMode, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", applyOrientationMode, { passive: true });
  }

  // If the game code changes canvas attributes later, re-apply sizing.
  function attachCanvasObservers() {
    const canvas = getCanvas();
    if (!canvas) return;

    const mo = new MutationObserver(() => {
      if (isLandscapeNow()) resizeCanvasInternal();
    });
    mo.observe(canvas, { attributes: true, attributeFilter: ["width", "height", "style"] });
  }

  // Many games start after a "name confirm" button. Re-apply on first user interaction.
  let didFirstInteraction = false;
  function onFirstInteraction() {
    if (didFirstInteraction) return;
    didFirstInteraction = true;
    if (isLandscapeNow()) scheduleResizes();
  }
  document.addEventListener("click", onFirstInteraction, { passive: true });
  document.addEventListener("touchend", onFirstInteraction, { passive: true });

  // Initial
  attachCanvasObservers();
  applyOrientationMode();
  scheduleResizes();
})();