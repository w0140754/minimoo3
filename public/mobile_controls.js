/*
  mobile_controls.js (letterbox / no-distortion edition)

  - Detects touch/mobile-ish devices
  - Locks page scrolling (so thumb drags don't pan the page)
  - Makes the game area full-screen on mobile WITHOUT stretching:
      * Canvas is scaled to fit the viewport while preserving its native aspect ratio
      * Black "letterbox" bars fill the remaining space
  - Virtual joystick on left side (invisible until touched)
  - Emits Arrow key events (so existing keyboard movement logic works unchanged)

  Drop this file into your static folder (e.g., /public/mobile_controls.js)
*/

(() => {
  "use strict";

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

    // Prefer capabilities over UA; UA is a fallback.
    return (hasTouch && coarsePointer) || (uaMobile && (hasTouch || smallScreen));
  }

  if (!isProbablyMobile()) return;

  // ---------- Mobile-only CSS + scroll lock ----------
  const style = document.createElement("style");
  style.textContent = `
    html.mc-mobile, body.mc-mobile {
      margin: 0;
      padding: 0;
      height: 100%;
      overflow: hidden;
      overscroll-behavior: none;
      touch-action: none;
      -webkit-overflow-scrolling: auto;
      background: #000;
    }

    /* Hide the desktop header text on mobile (your index has an h1 + p above the canvas) */
    body.mc-mobile > h1,
    body.mc-mobile > p {
      display: none !important;
    }

    /* Make the wrapper full-screen and center the canvas */
    #gameWrap.mc-mobile-wrap {
      position: fixed !important;
      inset: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background: #000 !important;
      z-index: 0;
      /* use custom viewport height to reduce iOS address-bar weirdness */
      height: var(--mc-vh, 100vh) !important;
      width: 100vw !important;
    }

    /* IMPORTANT: do NOT stretch; JS will set explicit pixel CSS sizes */
    canvas#c.mc-mobile-canvas {
      display: block;
      image-rendering: pixelated;
      background: transparent;
      z-index: 1;
    }

    /* Left-side touch capture zone (50% of screen) */
    .mc-touch-zone {
      position: fixed;
      left: 0;
      top: 0;
      width: 50vw;
      height: var(--mc-vh, 100vh);
      z-index: 999999;
      background: transparent;
      touch-action: none;
    }

    .mc-joy-base {
      position: fixed;
      width: 120px;
      height: 120px;
      border-radius: 999px;
      background: rgba(255,255,255,0.12);
      border: 2px solid rgba(255,255,255,0.18);
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 1000000;
    }

    .mc-joy-knob {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 56px;
      height: 56px;
      border-radius: 999px;
      background: rgba(255,255,255,0.22);
      border: 2px solid rgba(255,255,255,0.25);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    /* Optional: small hint text for first-time users */
    .mc-hint {
      position: fixed;
      left: 10px;
      bottom: 10px;
      font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: rgba(255,255,255,0.75);
      background: rgba(0,0,0,0.35);
      padding: 6px 8px;
      border-radius: 10px;
      z-index: 1000001;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);

  document.documentElement.classList.add("mc-mobile");
  document.body.classList.add("mc-mobile");

  // Strong iOS-safe scroll lock: freeze body position.
  // (This prevents the "rubber band" scroll even when preventDefault is ignored.)
  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  document.body.style.position = "fixed";
  document.body.style.left = `-${scrollX}px`;
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = "100%";

  // ---------- Ensure the game wrapper/canvas are present ----------
  function getCanvas() {
    return document.getElementById("c");
  }
  function getWrap() {
    return document.getElementById("gameWrap");
  }

  // Use visualViewport height when available; it helps in landscape where browser chrome changes height.
  function updateVhVar() {
    const vh = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty("--mc-vh", `${vh}px`);
  }

  // Letterbox scaling: preserve the canvas's internal aspect ratio by setting CSS pixel size.
  function fitCanvasLetterbox() {
    const c = getCanvas();
    const wrap = getWrap();
    if (!c || !wrap) return;

    wrap.classList.add("mc-mobile-wrap");
    c.classList.add("mc-mobile-canvas");

    // Canvas "native" resolution (attributes). If not set, fall back to current.
    const nativeW = c.width || 800;
    const nativeH = c.height || 600;

    // Available viewport size (prefer visualViewport).
    const vw = (window.visualViewport && window.visualViewport.width) ? window.visualViewport.width : window.innerWidth;
    const vh = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;

    const scale = Math.min(vw / nativeW, vh / nativeH);

    const cssW = Math.floor(nativeW * scale);
    const cssH = Math.floor(nativeH * scale);

    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
  }

  // Keep things updated when address bar shows/hides or orientation changes.
  updateVhVar();
  window.addEventListener("resize", () => { updateVhVar(); fitCanvasLetterbox(); }, { passive: true });
  window.addEventListener("orientationchange", () => {
    setTimeout(() => { updateVhVar(); fitCanvasLetterbox(); }, 250);
  }, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => { updateVhVar(); fitCanvasLetterbox(); }, { passive: true });
    window.visualViewport.addEventListener("scroll", () => { updateVhVar(); fitCanvasLetterbox(); }, { passive: true });
  }

  // Initial fit once DOM has painted.
  window.addEventListener("load", () => { updateVhVar(); fitCanvasLetterbox(); }, { once: true });

  // Optional one-time hint
  const hint = document.createElement("div");
  hint.className = "mc-hint";
  hint.textContent = "Use left thumb to move";
  document.body.appendChild(hint);
  setTimeout(() => hint.remove(), 2500);


  // Optional: fullscreen button (mostly works on Android/Chrome; iOS Safari generally won't allow true fullscreen)
  (function addFullscreenButton(){
    const ua = (navigator.userAgent || "").toLowerCase();
    const isiOS = /iphone|ipad|ipod/.test(ua);
    if (isiOS) return;
    if (!document.fullscreenEnabled) return;

    const btn = document.createElement("button");
    btn.textContent = "Fullscreen";
    btn.style.position = "fixed";
    btn.style.right = "10px";
    btn.style.top = "10px";
    btn.style.zIndex = "1000002";
    btn.style.padding = "8px 10px";
    btn.style.borderRadius = "12px";
    btn.style.border = "1px solid rgba(255,255,255,0.25)";
    btn.style.background = "rgba(0,0,0,0.45)";
    btn.style.color = "rgba(255,255,255,0.9)";
    btn.style.font = "13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

    btn.addEventListener("click", async () => {
      const wrap = getWrap() || document.documentElement;
      try {
        if (!document.fullscreenElement) {
          await wrap.requestFullscreen({ navigationUI: "hide" });
          btn.textContent = "Exit";
        } else {
          await document.exitFullscreen();
          btn.textContent = "Fullscreen";
        }
      } catch (_) {
        // ignore
      }
    });

    document.addEventListener("fullscreenchange", () => {
      btn.textContent = document.fullscreenElement ? "Exit" : "Fullscreen";
    });

    document.body.appendChild(btn);
  })();


  // ---------- Virtual joystick ----------
  const touchZone = document.createElement("div");
  touchZone.className = "mc-touch-zone";
  document.body.appendChild(touchZone);

  let baseEl = null;
  let knobEl = null;
  let active = false;
  let startX = 0;
  let startY = 0;
  const maxRadius = 46;   // px from center
  const deadZone = 10;    // px before movement registers

  let pressed = { up: false, down: false, left: false, right: false };

  function sendKey(type, key) {
    const evt = new KeyboardEvent(type, { key, bubbles: true });
    window.dispatchEvent(evt);
    document.dispatchEvent(evt);
  }

  function setPressed(next) {
    const map = {
      left: "ArrowLeft",
      right: "ArrowRight",
      up: "ArrowUp",
      down: "ArrowDown",
    };
    for (const dir of Object.keys(map)) {
      if (pressed[dir] !== next[dir]) {
        pressed[dir] = next[dir];
        sendKey(next[dir] ? "keydown" : "keyup", map[dir]);
      }
    }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function createStick(x, y) {
    baseEl = document.createElement("div");
    baseEl.className = "mc-joy-base";
    baseEl.style.left = `${x}px`;
    baseEl.style.top = `${y}px`;

    knobEl = document.createElement("div");
    knobEl.className = "mc-joy-knob";
    baseEl.appendChild(knobEl);

    document.body.appendChild(baseEl);
  }

  function destroyStick() {
    if (baseEl && baseEl.parentNode) baseEl.parentNode.removeChild(baseEl);
    baseEl = null;
    knobEl = null;
  }

  function updateStick(dx, dy) {
    if (!knobEl) return;

    const dist = Math.hypot(dx, dy);
    const r = dist > 0 ? Math.min(maxRadius, dist) : 0;

    const nx = dist > 0 ? (dx / dist) : 0;
    const ny = dist > 0 ? (dy / dist) : 0;

    const kx = nx * r;
    const ky = ny * r;

    knobEl.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

    // Movement decision: treat as 4-way digital with deadzone
    const next = { up: false, down: false, left: false, right: false };
    if (dist >= deadZone) {
      if (Math.abs(dx) > Math.abs(dy)) {
        next.left = dx < -deadZone;
        next.right = dx > deadZone;
      } else {
        next.up = dy < -deadZone;
        next.down = dy > deadZone;
      }
    }
    setPressed(next);
  }

  function onStart(clientX, clientY) {
    active = true;
    startX = clientX;
    startY = clientY;
    createStick(startX, startY);
    updateStick(0, 0);
  }

  function onMove(clientX, clientY) {
    if (!active) return;
    const dx = clamp(clientX - startX, -maxRadius, maxRadius);
    const dy = clamp(clientY - startY, -maxRadius, maxRadius);
    updateStick(dx, dy);
  }

  function onEnd() {
    if (!active) return;
    active = false;
    destroyStick();
    setPressed({ up: false, down: false, left: false, right: false });
  }

  // Prevent page gestures while joystick is active (extra safety)
  document.addEventListener("touchmove", (e) => {
    if (active) e.preventDefault();
  }, { passive: false });

  // Touch events
  touchZone.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    if (!t) return;
    e.preventDefault();
    onStart(t.clientX, t.clientY);
  }, { passive: false });

  touchZone.addEventListener("touchmove", (e) => {
    const t = e.changedTouches[0];
    if (!t) return;
    e.preventDefault();
    onMove(t.clientX, t.clientY);
  }, { passive: false });

  touchZone.addEventListener("touchend", (e) => {
    e.preventDefault();
    onEnd();
  }, { passive: false });

  touchZone.addEventListener("touchcancel", (e) => {
    e.preventDefault();
    onEnd();
  }, { passive: false });

  // Pointer events (Android Chrome / modern browsers)
  touchZone.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    e.preventDefault();
    touchZone.setPointerCapture(e.pointerId);
    onStart(e.clientX, e.clientY);
  });

  touchZone.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") return;
    if (!active) return;
    e.preventDefault();
    onMove(e.clientX, e.clientY);
  });

  touchZone.addEventListener("pointerup", (e) => {
    if (e.pointerType === "mouse") return;
    e.preventDefault();
    onEnd();
  });

  touchZone.addEventListener("pointercancel", (e) => {
    if (e.pointerType === "mouse") return;
    e.preventDefault();
    onEnd();
  });

  // Try to nudge the browser UI away (works sometimes on Android; iOS is stubborn)
  setTimeout(() => { window.scrollTo(0, 1); }, 200);
})();
