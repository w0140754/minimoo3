(() => {
  "use strict";

  // Mobile controls (v19)
  // Fixes:
  // - Hamburger/menu taps no longer blocked (no full-screen touch overlay).
  // - Horizontal fill can be limited (e.g. 90%) and enforced with !important.
  // - Keeps the 1.5x camera-safe zoom and wider horizontal FOV logic.
  // - Respects iPhone safe-area insets.

  const DEBUG = false;
  const VERSION = "v19";

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
      return { w: Math.max(1, Math.round(vv.width)), h: Math.max(1, Math.round(vv.height)) };
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
    body > h1, body > p { display: none !important; }

    #gameWrap {
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
      background: #000;
      box-sizing: border-box;
      padding: var(--mc-safe-top) var(--mc-safe-right) var(--mc-safe-bottom) var(--mc-safe-left);
    }

    #c {
      position: absolute !important;
      left: 50% !important;
      top: 50% !important;
      transform: translate(-50%, -50%);
      display: block !important;
      image-rendering: pixelated;
      touch-action: none;
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

    .mc-debug-badge {
      position: fixed;
      left: calc(var(--mc-safe-left) + 10px);
      top: calc(var(--mc-safe-top) + 10px);
      z-index: 2147483647;
      background: rgba(0,0,0,0.6);
      color: #fff;
      padding: 6px 8px;
      border-radius: 10px;
      font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      pointer-events: none;
      white-space: pre;
      display: none;
    }
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

  // ===== Camera-safe zoom + horizontal expansion =====
  const BASE_W = 800;
  const BASE_H = 600;

  // Requested zoom: 1.5x bigger tiles
  const MOBILE_ZOOM = 3 / 2;

  // Keep vertical zoom fixed (camera uses this)
  const MOBILE_H = Math.round(BASE_H / MOBILE_ZOOM); // ~400
  const MIN_MOBILE_W = Math.round(BASE_W / MOBILE_ZOOM); // ~533

  // Cap max horizontal FOV so it doesn't get too wide
  const MAX_INTERNAL_W = 960;

  // Limit horizontal fill so you can leave margins (e.g., 90% of usable width)
  const HORIZONTAL_FILL = 0.90;

  let debugBadge = null;

  function findMenuElement() {
    const candidates = [
      document.getElementById("menuBtn"),
      document.getElementById("hamburger"),
      document.getElementById("menu"),
      document.querySelector(".hamburger"),
      document.querySelector(".menu-btn"),
      document.querySelector(".menuButton"),
      document.querySelector("[aria-label*='menu' i]"),
      document.querySelector("[aria-label*='hamburger' i]"),
    ].filter(Boolean);

    // Button containing the ☰ character
    for (const el of document.querySelectorAll("button, div, span, a")) {
      const t = (el.textContent || "").trim();
      if (t === "☰" || t === "≡") {
        candidates.push(el);
        break;
      }
    }

    return candidates[0] || null;
  }

  function elevateHamburger() {
    const btn = findMenuElement();
    if (!btn) return;

    // Raise above canvas and joystick.
    btn.style.zIndex = "2147483605";

    // Don't force position unless needed; just ensure it's not clipped/hidden.
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
    // Height is fixed for the zoom; width may be adjusted later to fit horizontal margins.
    if (canvas.width !== internalW) canvas.width = internalW;
    if (canvas.height !== internalH) canvas.height = internalH;

    // Scale strategy:
    // Prefer using the full safe-area height (so we don't shrink vertically),
    // then (if needed) reduce internalW (horizontal FOV) to respect the horizontal fill margin.
    const scaleH = usableH / internalH; // use full height
    const maxDispW = usableW * HORIZONTAL_FILL;
    const maxInternalWAtFullHeight = Math.floor(maxDispW / scaleH);

    const adjustedInternalW = Math.max(
      MIN_MOBILE_W,
      Math.min(internalW, maxInternalWAtFullHeight)
    );

    if (canvas.width !== adjustedInternalW) canvas.width = adjustedInternalW;

    const scale = scaleH;
    const dispW = Math.round(adjustedInternalW * scale);
    const dispH = Math.round(internalH * scale);

    // Enforce these so game code can't override with 100% later.
    canvas.style.setProperty("width", dispW + "px", "important");
    canvas.style.setProperty("height", dispH + "px", "important");

    elevateHamburger();

    if (DEBUG && debugBadge) {
      debugBadge.style.display = "block";
      debugBadge.textContent =
        `MC ${VERSION}
` +
        `vp: ${vp.w}x${vp.h}
` +
        `safe: t${Math.round(safe.top)} r${Math.round(safe.right)} b${Math.round(safe.bottom)} l${Math.round(safe.left)}
` +
        `usable: ${usableW}x${usableH}
` +
        `internal: ${internalW}x${internalH}
` +
        `disp: ${dispW}x${dispH}`;
    }
  }

  function scheduleResizes() {
    const times = [0, 50, 150, 300, 700, 1200];
    for (const t of times) {
      setTimeout(() => {
        if (isLandscapeNow()) {
          resizeCanvasInternal();
        }
      }, t);
    }
  }

  // ===== Landscape lock overlay =====
  const rotateOverlay = document.createElement("div");
  rotateOverlay.className = "mc-rotate-overlay";
  rotateOverlay.innerHTML = `<div><strong>Rotate your phone</strong>This game is landscape-only.</div>`;
  document.body.appendChild(rotateOverlay);

  if (DEBUG) {
    debugBadge = document.createElement("div");
    debugBadge.className = "mc-debug-badge";
    debugBadge.textContent = `MC ${VERSION}`;
    document.body.appendChild(debugBadge);
  }

  // ===== Virtual joystick (single instance, no accumulation) =====
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
  let startX = 0, startY = 0;
  let currentDirs = new Set();
  let activePointerId = null;

  function dispatchKey(type, key) {
    const ev = new KeyboardEvent(type, { key, bubbles: true });
    window.dispatchEvent(ev);
    document.dispatchEvent(ev);
  }

  function setDirs(next) {
    for (const k of currentDirs) if (!next.has(k)) dispatchKey("keyup", k);
    for (const k of next) if (!currentDirs.has(k)) dispatchKey("keydown", k);
    currentDirs = next;
  }

  function stopAll() { setDirs(new Set()); }

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
    activePointerId = pointerId;
    startX = x;
    startY = y;
    showJoystick(x, y);
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

  function onEnd() {
    if (!active) return;
    active = false;
    activePointerId = null;
    stopAll();
    hideJoystick();
  }

  // Instead of a full-screen overlay div that can block UI buttons,
  // listen at the document level (capturing) and only take over touches
  // in the left half of the screen that are NOT on the menu button.
  function shouldIgnoreForUI(target) {
    if (!target) return false;
    // Allow clicks/taps on any obvious menu button area.
    return !!target.closest?.(
      "#menuBtn, #hamburger, #menu, .hamburger, .menu-btn, .menuButton, [aria-label*='menu' i], [aria-label*='hamburger' i]"
    );
  }

  // Joystick activation zone: left edge portion of the screen.
  const JOYSTICK_ZONE_FRACTION = 0.20; // 20% of screen width

  function isInJoystickZone(x) {
    const vp = getVP();
    return x <= vp.w * JOYSTICK_ZONE_FRACTION;
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!isLandscapeNow()) return;
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      if (!isInJoystickZone(e.clientX)) return;
      if (shouldIgnoreForUI(e.target)) return;

      // Take over for joystick
      e.preventDefault();
      onStart(e.clientX, e.clientY, e.pointerId);
    },
    { passive: false, capture: true }
  );

  document.addEventListener(
    "pointermove",
    (e) => {
      if (!active) return;
      if (e.pointerId !== activePointerId) return;
      e.preventDefault();
      onMove(e.clientX, e.clientY);
    },
    { passive: false, capture: true }
  );

  document.addEventListener(
    "pointerup",
    (e) => {
      if (!active) return;
      if (e.pointerId !== activePointerId) return;
      e.preventDefault();
      onEnd();
    },
    { passive: false, capture: true }
  );

  document.addEventListener(
    "pointercancel",
    (e) => {
      if (!active) return;
      if (e.pointerId !== activePointerId) return;
      e.preventDefault();
      onEnd();
    },
    { passive: false, capture: true }
  );

  window.addEventListener("blur", () => onEnd());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) onEnd();
  });

  // ===== Orientation handling =====
  function applyOrientationMode() {
    const landscape = isLandscapeNow();
    rotateOverlay.style.display = landscape ? "none" : "flex";

    if (!landscape) {
      onEnd();
    } else {
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