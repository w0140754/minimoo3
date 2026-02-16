/*
  MobileControls (Landscape + Zoom/Cover + No Ghosting)
  - Detects mobile-ish devices
  - Forces a landscape-only UX (shows rotate overlay in portrait)
  - Adds a left-side analog joystick that's invisible until touch
  - Prevents page scrolling while playing
  - Scales the game's canvas to "cover" the viewport (no letterboxing); crops edges if needed
  - Uses a single joystick instance (no accumulation/ghosting)
*/
(() => {
  "use strict";

  // ---------- mobile detection ----------
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

  // ---------- global scroll/selection guards ----------
  // Make the page behave like a full-screen game surface.
  const html = document.documentElement;
  const body = document.body;

  function setGlobalStyles() {
    html.style.height = "100%";
    body.style.height = "100%";
    body.style.margin = "0";
    body.style.overflow = "hidden";
    body.style.touchAction = "none"; // important: stops browser panning/zoom gestures
    body.style.background = "#000";
    body.style.userSelect = "none";
    body.style.webkitUserSelect = "none";
    body.style.webkitTouchCallout = "none";
  }
  setGlobalStyles();

  // ---------- helper: find your canvas ----------
  function getCanvas() {
    // Your project uses <canvas id="c">, but fall back to the first canvas if renamed.
    return document.getElementById("c") || document.querySelector("canvas");
  }

  // ---------- rotate overlay (portrait blocker) ----------
  const rotateOverlay = document.createElement("div");
  rotateOverlay.className = "mc-rotate-overlay";
  rotateOverlay.innerHTML = `
    <div class="mc-rotate-card">
      <div class="mc-rotate-title">Rotate your phone</div>
      <div class="mc-rotate-sub">This game is landscape-only.</div>
    </div>
  `;
  document.body.appendChild(rotateOverlay);

  // ---------- joystick touch zone + joystick UI (single instance) ----------
  const zone = document.createElement("div");
  zone.className = "mc-touch-zone";

  const joy = document.createElement("div");
  joy.className = "mc-joy";
  joy.innerHTML = `<div class="mc-joy-knob"></div>`;
  const knob = joy.querySelector(".mc-joy-knob");

  document.body.appendChild(zone);
  document.body.appendChild(joy);

  // ---------- styles ----------
  const style = document.createElement("style");
  style.textContent = `
    .mc-touch-zone{
      position: fixed;
      left: 0;
      top: 0;
      width: 50vw;
      height: 100vh;
      z-index: 2147483000;
      touch-action: none;
      background: rgba(0,0,0,0); /* invisible */
    }
    .mc-joy{
      position: fixed;
      left: -9999px;
      top: -9999px;
      width: 140px;
      height: 140px;
      margin: 0;
      transform: translate(-50%, -50%);
      border-radius: 999px;
      background: rgba(255,255,255,0.12);
      border: 2px solid rgba(255,255,255,0.18);
      z-index: 2147483001;
      display: none;
      touch-action: none;
      pointer-events: none; /* purely visual */
      box-shadow: 0 10px 28px rgba(0,0,0,0.35);
      backdrop-filter: blur(2px);
    }
    .mc-joy .mc-joy-knob{
      position: absolute;
      left: 50%;
      top: 50%;
      width: 62px;
      height: 62px;
      transform: translate(-50%, -50%);
      border-radius: 999px;
      background: rgba(255,255,255,0.22);
      border: 2px solid rgba(255,255,255,0.22);
      box-shadow: 0 6px 18px rgba(0,0,0,0.25);
    }

    .mc-rotate-overlay{
      position: fixed;
      inset: 0;
      z-index: 2147483500;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.75);
      padding: 24px;
      text-align: center;
    }
    .mc-rotate-card{
      max-width: 420px;
      border-radius: 16px;
      padding: 18px 16px;
      background: rgba(20,20,20,0.90);
      border: 1px solid rgba(255,255,255,0.14);
      color: rgba(255,255,255,0.92);
      box-shadow: 0 16px 40px rgba(0,0,0,0.5);
    }
    .mc-rotate-title{
      font: 700 20px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      margin-bottom: 6px;
    }
    .mc-rotate-sub{
      font: 500 14px/1.3 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      opacity: 0.9;
    }
  `;
  document.head.appendChild(style);

  // ---------- canvas cover scaling (no black bars) ----------
  function applyCanvasCover() {
    const c = getCanvas();
    if (!c) return;

    // base logical size (uses intrinsic canvas size)
    const baseW = c.width || 800;
    const baseH = c.height || 600;

    // Use visual viewport sizes
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Scale to cover: max so there are no bars; will crop
    const scale = Math.max(vw / baseW, vh / baseH);

    c.style.position = "fixed";
    c.style.left = "50%";
    c.style.top = "50%";
    c.style.width = `${Math.ceil(baseW * scale)}px`;
    c.style.height = `${Math.ceil(baseH * scale)}px`;
    c.style.transform = "translate(-50%, -50%)";
    c.style.imageRendering = "pixelated"; // keeps pixel art crisp when scaled
    c.style.zIndex = "0";
  }

  // ---------- portrait/landscape gating ----------
  let landscapeEnabled = true;

  function setLandscapeEnabled(on) {
    landscapeEnabled = on;
    zone.style.pointerEvents = on ? "auto" : "none";
    if (!on) {
      // stop movement + hide joystick when portrait
      endJoystick();
      rotateOverlay.style.display = "flex";
    } else {
      rotateOverlay.style.display = "none";
    }
  }

  function updateOrientationState() {
    const portrait = window.innerHeight > window.innerWidth;
    setLandscapeEnabled(!portrait);
    // Only scale canvas when landscape (in portrait we show overlay)
    if (!portrait) applyCanvasCover();
  }

  // ---------- key simulation (same contract as keyboard movement) ----------
  const KEYMAP = {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
  };

  const pressed = new Set();
  function dispatchKey(type, key) {
    // Many games listen on window; dispatch on window to match
    const ev = new KeyboardEvent(type, { key, bubbles: true });
    window.dispatchEvent(ev);
  }
  function setKey(dir, down) {
    const key = KEYMAP[dir];
    if (!key) return;
    if (down) {
      if (pressed.has(key)) return;
      pressed.add(key);
      dispatchKey("keydown", key);
    } else {
      if (!pressed.has(key)) return;
      pressed.delete(key);
      dispatchKey("keyup", key);
    }
  }
  function clearKeys() {
    for (const key of Array.from(pressed)) {
      pressed.delete(key);
      dispatchKey("keyup", key);
    }
  }

  // ---------- joystick logic ----------
  let active = false;
  let startX = 0, startY = 0;
  const radius = 60;     // outer radius (px)
  const deadzone = 10;   // px

  function showJoystick(x, y) {
    joy.style.left = `${x}px`;
    joy.style.top = `${y}px`;
    joy.style.display = "block";
    knob.style.transform = "translate(-50%, -50%)";
  }

  function moveJoystick(x, y) {
    const dx = x - startX;
    const dy = y - startY;

    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, radius);
    const ang = Math.atan2(dy, dx);

    const outX = Math.cos(ang) * clamped;
    const outY = Math.sin(ang) * clamped;

    knob.style.transform = `translate(calc(-50% + ${outX}px), calc(-50% + ${outY}px))`;

    // Convert to 4-way keys (keep your current movement model)
    const ax = Math.abs(outX);
    const ay = Math.abs(outY);

    const wantLeft = outX < -deadzone && ax >= ay;
    const wantRight = outX > deadzone && ax >= ay;
    const wantUp = outY < -deadzone && ay > ax;
    const wantDown = outY > deadzone && ay > ax;

    setKey("left", wantLeft);
    setKey("right", wantRight);
    setKey("up", wantUp);
    setKey("down", wantDown);

    if (!wantLeft) setKey("left", false);
    if (!wantRight) setKey("right", false);
    if (!wantUp) setKey("up", false);
    if (!wantDown) setKey("down", false);
  }

  function endJoystick() {
    active = false;
    joy.style.display = "none";
    clearKeys();
  }

  // Use Pointer Events (best on iOS 13+)
  zone.addEventListener("pointerdown", (e) => {
    if (!landscapeEnabled) return;
    e.preventDefault();
    zone.setPointerCapture?.(e.pointerId);

    active = true;
    startX = e.clientX;
    startY = e.clientY;
    showJoystick(startX, startY);
    moveJoystick(e.clientX, e.clientY);
  }, { passive: false });

  zone.addEventListener("pointermove", (e) => {
    if (!active) return;
    e.preventDefault();
    moveJoystick(e.clientX, e.clientY);
  }, { passive: false });

  function onPointerEnd(e) {
    if (!active) return;
    e.preventDefault();
    active = false;
    endJoystick();
  }
  zone.addEventListener("pointerup", onPointerEnd, { passive: false });
  zone.addEventListener("pointercancel", onPointerEnd, { passive: false });
  zone.addEventListener("lostpointercapture", () => { if (active) endJoystick(); });

  // Safety: if the page loses focus
  window.addEventListener("blur", () => endJoystick());

  // ---------- orientation + resize handlers ----------
  window.addEventListener("resize", updateOrientationState);
  window.addEventListener("orientationchange", updateOrientationState);

  // Initial apply
  updateOrientationState();
})();
