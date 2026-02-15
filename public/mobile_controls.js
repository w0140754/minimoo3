/*
  mobile_controls.js (iPhone-friendly, no-distortion + robust joystick)

  What this does (mobile only):
  - Detects touch/mobile-ish devices.
  - Prevents page scrolling/panning (so joystick drags don't move the page).
  - Full-screen game presentation WITHOUT stretching.
      * Landscape: letterbox "contain" (no crop, no distortion)
      * Portrait: "cover-ish" (bigger, may crop a bit left/right) + rotate hint
  - Virtual joystick on left side (invisible until touched).
  - Emits Arrow key events (so your existing keyboard movement works unchanged).

  Put this file in: /public/mobile_controls.js
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

    return (hasTouch && coarsePointer) || (uaMobile && (hasTouch || smallScreen));
  }

  if (!isProbablyMobile()) return;

  // ---------- Mobile-only CSS + scroll lock ----------
  document.documentElement.classList.add("mc-mobile");
  document.body.classList.add("mc-mobile");

  const style = document.createElement("style");
  style.textContent = `
    html.mc-mobile, body.mc-mobile {
      margin: 0;
      padding: 0;
      height: 100%;
      width: 100%;
      overflow: hidden;
      overscroll-behavior: none;
      touch-action: none;
      -webkit-overflow-scrolling: auto;
      background: #000;
    }

    /* Hide desktop header text above the canvas on mobile */
    body.mc-mobile > h1,
    body.mc-mobile > p { display: none !important; }

    /* Fullscreen wrap */
    #gameWrap {
      position: fixed !important;
      inset: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background: #000 !important;
    }

    /* Canvas centered; size set by JS */
    #c { display: block; margin: 0 auto; }

    /* Joystick visuals */
    .mc-joy-base{
      position: fixed;
      width: 140px;
      height: 140px;
      border-radius: 999px;
      border: 2px solid rgba(255,255,255,0.30);
      background: rgba(255,255,255,0.06);
      transform: translate(-50%, -50%);
      z-index: 2147483647;
      pointer-events: none;
      display: none;
    }
    .mc-joy-knob{
      position: absolute;
      left: 50%;
      top: 50%;
      width: 58px;
      height: 58px;
      border-radius: 999px;
      border: 2px solid rgba(255,255,255,0.35);
      background: rgba(255,255,255,0.14);
      transform: translate(-50%, -50%);
    }

    /* Invisible touch zone (left side) */
    .mc-touch-zone{
      position: fixed;
      left: 0;
      top: 0;
      width: 50vw;
      height: 100vh;
      z-index: 2147483646;
      background: rgba(0,0,0,0);
      touch-action: none;
    }

    /* Rotate hint */
    .mc-rotate-hint{
      position: fixed;
      left: 50%;
      top: 12px;
      transform: translateX(-50%);
      padding: 8px 12px;
      border-radius: 10px;
      background: rgba(0,0,0,0.55);
      border: 1px solid rgba(255,255,255,0.18);
      color: rgba(255,255,255,0.95);
      font: 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      z-index: 2147483647;
      pointer-events: none;
      display: none;
    }
  `;
  document.head.appendChild(style);

  // iOS-safe scroll lock (prevents "rubber band" + page panning)
  const scrollY = window.scrollY || 0;
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";

  // ---------- Helpers ----------
  function getCanvas() { return document.getElementById("c"); }
  function getWrap() { return document.getElementById("gameWrap"); }

  function viewportSize() {
    const vw = (window.visualViewport && window.visualViewport.width) ? window.visualViewport.width : window.innerWidth;
    const vh = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
    return { vw, vh };
  }

  // Fit the canvas without distortion:
  // - Landscape: contain (letterbox)
  // - Portrait: cover-ish (bigger, may crop a bit left/right)
  function fitCanvas() {
    const c = getCanvas();
    const wrap = getWrap();
    if (!c || !wrap) return;

    const nativeW = c.width || 800;
    const nativeH = c.height || 600;
    const { vw, vh } = viewportSize();

    const isPortrait = vh > vw * 1.05;

    const scaleContain = Math.min(vw / nativeW, vh / nativeH);
    const scaleCover = Math.max(vw / nativeW, vh / nativeH);

    const scale = isPortrait ? scaleCover : scaleContain;

    const cssW = Math.floor(nativeW * scale);
    const cssH = Math.floor(nativeH * scale);

    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
  }

  function showRotateHintIfNeeded() {
    const { vw, vh } = viewportSize();
    const hint = document.getElementById("mcRotateHint");
    if (!hint) return;
    const isPortrait = vh > vw * 1.05;
    hint.style.display = isPortrait ? "block" : "none";
  }

  // Keep things updated when address bar shows/hides or orientation changes.
  function refitAll() {
    fitCanvas();
    showRotateHintIfNeeded();
  }
  window.addEventListener("resize", () => { refitAll(); }, { passive: true });
  window.addEventListener("orientationchange", () => { setTimeout(refitAll, 250); }, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => { refitAll(); }, { passive: true });
    window.visualViewport.addEventListener("scroll", () => { refitAll(); }, { passive: true });
  }
  window.addEventListener("load", () => { refitAll(); }, { once: true });

  // Optional hint
  const rotateHint = document.createElement("div");
  rotateHint.id = "mcRotateHint";
  rotateHint.className = "mc-rotate-hint";
  rotateHint.textContent = "Rotate your phone for a bigger view";
  document.body.appendChild(rotateHint);

  // ---------- Virtual joystick (robust: one element, no accumulation) ----------
  const deadZone = 18;
  const maxRadius = 48;

  // One stick element reused forever (prevents stacking even if an "end" is missed)
  const baseEl = document.createElement("div");
  baseEl.className = "mc-joy-base";
  const knobEl = document.createElement("div");
  knobEl.className = "mc-joy-knob";
  baseEl.appendChild(knobEl);
  document.body.appendChild(baseEl);

  function setStickVisible(visible) {
    baseEl.style.display = visible ? "block" : "none";
    if (!visible) {
      knobEl.style.transform = "translate(-50%, -50%)";
    }
  }

  const touchZone = document.createElement("div");
  touchZone.className = "mc-touch-zone";
  document.body.appendChild(touchZone);

  let active = false;
  let startX = 0, startY = 0;
  let held = { up:false, down:false, left:false, right:false };
  let activePointerId = null;

  function dispatchKey(type, key) {
    window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  }

  function setPressed(next) {
    const map = [
      ["up", "ArrowUp"],
      ["down", "ArrowDown"],
      ["left", "ArrowLeft"],
      ["right", "ArrowRight"],
    ];
    for (const [dir, key] of map) {
      if (held[dir] !== next[dir]) {
        held[dir] = next[dir];
        dispatchKey(next[dir] ? "keydown" : "keyup", key);
      }
    }
  }

  function beginAt(x, y) {
    active = true;
    startX = x; startY = y;
    baseEl.style.left = `${x}px`;
    baseEl.style.top = `${y}px`;
    setStickVisible(true);
    setPressed({up:false,down:false,left:false,right:false});
  }

  function moveTo(x, y) {
    if (!active) return;

    const dx = x - startX;
    const dy = y - startY;

    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxRadius);
    const nx = dist ? dx / dist : 0;
    const ny = dist ? dy / dist : 0;

    const kx = nx * clamped;
    const ky = ny * clamped;

    knobEl.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

    const next = { up:false, down:false, left:false, right:false };
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

  function end() {
    if (!active) return;
    active = false;
    activePointerId = null;
    setStickVisible(false);
    setPressed({up:false,down:false,left:false,right:false});
  }

  // Extra safety: if something goes weird, releasing anywhere ends movement.
  window.addEventListener("blur", end);
  window.addEventListener("visibilitychange", () => { if (document.hidden) end(); });

  // Pointer Events (best on modern iOS/Android)
  touchZone.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    e.preventDefault();
    activePointerId = e.pointerId;
    // Capture so we still get pointerup even if finger moves outside zone
    if (touchZone.setPointerCapture) {
      try { touchZone.setPointerCapture(activePointerId); } catch {}
    }
    beginAt(e.clientX, e.clientY);
  }, { passive: false });

  touchZone.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") return;
    if (!active || e.pointerId !== activePointerId) return;
    e.preventDefault();
    moveTo(e.clientX, e.clientY);
  }, { passive: false });

  touchZone.addEventListener("pointerup", (e) => {
    if (e.pointerType === "mouse") return;
    if (e.pointerId !== activePointerId) return;
    e.preventDefault();
    end();
  }, { passive: false });

  touchZone.addEventListener("pointercancel", (e) => {
    if (e.pointerType === "mouse") return;
    if (e.pointerId !== activePointerId) return;
    e.preventDefault();
    end();
  }, { passive: false });

  // Touch Events fallback (older browsers)
  touchZone.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length === 0) return;
    e.preventDefault();
    const t = e.touches[0];
    beginAt(t.clientX, t.clientY);
  }, { passive: false });

  touchZone.addEventListener("touchmove", (e) => {
    if (!active || !e.touches || e.touches.length === 0) return;
    e.preventDefault();
    const t = e.touches[0];
    moveTo(t.clientX, t.clientY);
  }, { passive: false });

  touchZone.addEventListener("touchend", (e) => {
    e.preventDefault();
    end();
  }, { passive: false });

  touchZone.addEventListener("touchcancel", (e) => {
    e.preventDefault();
    end();
  }, { passive: false });

  // Tiny nudge (sometimes helps on non-standalone Android)
  setTimeout(() => { window.scrollTo(0, 1); }, 200);
})();
