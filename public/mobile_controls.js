/* mobile_controls.js (landscape-only, no bars, no crop)
   - Enforces landscape on mobile (shows rotate overlay in portrait)
   - Fits the canvas to the viewport WITHOUT distortion and WITHOUT cropping:
       * keeps internal height at 600
       * adjusts internal width to match viewport aspect ratio
       * CSS stretches canvas to 100vw x 100vh (aspect matches, so no stretch)
   - Left-side virtual joystick (invisible until touch), emits Arrow key events
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

  const canvas = document.getElementById("c");
  if (!canvas) return;

  // ===== CSS / layout =====
  const style = document.createElement("style");
  style.textContent = `
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      width: 100%;
      overflow: hidden;
      overscroll-behavior: none;
      touch-action: none; /* lets JS own gestures */
      background: #000;
    }

    /* Hide simple desktop text headers if present */
    body > h1, body > p {
      display: none !important;
    }

    /* Make the game container full-viewport */
    #gameWrap {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: calc(var(--vh, 1vh) * 100) !important;
      overflow: hidden !important;
    }

    /* Canvas fills the viewport; aspect matches internal size so no distortion */
    #c {
      position: absolute !important;
      inset: 0 !important;
      width: 100vw !important;
      height: calc(var(--vh, 1vh) * 100) !important;
      display: block !important;
      image-rendering: pixelated;
      touch-action: none;
    }

    /* Joystick touch zone (left half) */
    .mc-touch-zone {
      position: fixed;
      left: 0;
      top: 0;
      width: 50vw;
      height: calc(var(--vh, 1vh) * 100);
      z-index: 2147483000;
      touch-action: none;
      background: transparent;
    }

    /* Rotate overlay (portrait lock) */
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

  // Ensure there is a #gameWrap wrapper (your project already uses it, but just in case)
  let wrap = document.getElementById("gameWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "gameWrap";
    canvas.parentNode.insertBefore(wrap, canvas);
    wrap.appendChild(canvas);
  }

  // Viewport height fix for iOS address bar changes
  function setVH() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty("--vh", `${vh}px`);
  }

  // Resize internal canvas to match viewport aspect ratio, keeping internal height = 600.
  // This avoids black bars AND avoids cropping.
  function resizeCanvasInternal() {
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);

    // Keep 600 "game units" vertically; adjust width to match device aspect.
    const baseH = 600;
    const newW = Math.max(320, Math.round(baseH * (vw / vh)));

    // If your rendering uses DPR internally, let it stay simple to avoid breaking any math.
    // (If you want crisper rendering later, we can add DPR scaling carefully.)
    if (canvas.width !== newW) canvas.width = newW;
    if (canvas.height !== baseH) canvas.height = baseH;
  }

  // ===== Landscape lock overlay =====
  const rotateOverlay = document.createElement("div");
  rotateOverlay.className = "mc-rotate-overlay";
  rotateOverlay.innerHTML = `<div><strong>Rotate your phone</strong>This game is landscape-only.</div>`;
  document.body.appendChild(rotateOverlay);

  function isLandscapeNow() {
    return window.innerWidth >= window.innerHeight;
  }

  // ===== Virtual joystick (single instance, no accumulation) =====
  const touchZone = document.createElement("div");
  touchZone.className = "mc-touch-zone";
  document.body.appendChild(touchZone);

  // Joystick visuals (single elements)
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

  const RADIUS = 46;     // max knob travel
  const DEADZONE = 10;   // ignore small thumb jitter

  let active = false;
  let startX = 0, startY = 0;
  let currentDirs = new Set(); // "ArrowUp", etc.

  function dispatchKey(type, key) {
    // Use KeyboardEvent so your existing key handlers work.
    const ev = new KeyboardEvent(type, { key, bubbles: true });
    window.dispatchEvent(ev);
    document.dispatchEvent(ev);
  }

  function setDirs(next) {
    // Release missing
    for (const k of currentDirs) {
      if (!next.has(k)) dispatchKey("keyup", k);
    }
    // Press new
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

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function onStart(x, y, pointerId) {
    active = true;
    startX = x;
    startY = y;
    showJoystick(x, y);
    if (typeof pointerId === "number" && touchZone.setPointerCapture) {
      try { touchZone.setPointerCapture(pointerId); } catch (_) {}
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
    if (Math.abs(nx) > DEADZONE) {
      if (nx > 0) next.add("ArrowRight");
      else next.add("ArrowLeft");
    }
    if (Math.abs(ny) > DEADZONE) {
      if (ny > 0) next.add("ArrowDown");
      else next.add("ArrowUp");
    }
    setDirs(next);
  }

  function onEnd(pointerId) {
    if (!active) return;
    active = false;
    stopAll();
    hideJoystick();
    if (typeof pointerId === "number" && touchZone.releasePointerCapture) {
      try { touchZone.releasePointerCapture(pointerId); } catch (_) {}
    }
  }

  // Pointer events (best on modern iOS/Android)
  touchZone.addEventListener("pointerdown", (e) => {
    if (!isLandscapeNow()) return;
    e.preventDefault();
    onStart(e.clientX, e.clientY, e.pointerId);
  }, { passive: false });

  touchZone.addEventListener("pointermove", (e) => {
    if (!active) return;
    e.preventDefault();
    onMove(e.clientX, e.clientY);
  }, { passive: false });

  touchZone.addEventListener("pointerup", (e) => {
    e.preventDefault();
    onEnd(e.pointerId);
  }, { passive: false });

  touchZone.addEventListener("pointercancel", (e) => {
    e.preventDefault();
    onEnd(e.pointerId);
  }, { passive: false });

  // Safety net: if the finger leaves the zone
  window.addEventListener("blur", () => onEnd(undefined));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) onEnd(undefined);
  });

  // ===== Orientation handling =====
  function applyOrientationMode() {
    setVH();
    const landscape = isLandscapeNow();
    rotateOverlay.style.display = landscape ? "none" : "flex";

    if (!landscape) {
      // Disable controls while portrait
      onEnd(undefined);
      touchZone.style.display = "none";
    } else {
      touchZone.style.display = "block";
      resizeCanvasInternal();
    }
  }

  window.addEventListener("resize", applyOrientationMode, { passive: true });
  window.addEventListener("orientationchange", applyOrientationMode, { passive: true });

  // Initial
  applyOrientationMode();
})();
