/* 
  Mobile analog stick controls (left side)
  - Enables only on touch/coarse-pointer devices
  - Prevents page scrolling/zooming gestures that interfere with gameplay
  - Emits Arrow-key events so existing keyboard movement code keeps working
*/

(() => {
  "use strict";

  function detectMobile() {
    try {
      const ua = (navigator.userAgent || "").toLowerCase();
      const uaMobile = /android|iphone|ipod|ipad|iemobile|opera mini|mobile/.test(ua);

      const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
      const noHover = typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches;

      const hasTouch = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ("ontouchstart" in window);

      // Prefer capability detection; UA is fallback.
      return !!((hasTouch && coarse && noHover) || (uaMobile && hasTouch));
    } catch {
      return false;
    }
  }

  const isMobile = detectMobile();
  window.__IS_MOBILE__ = isMobile;
  if (!isMobile) return;

  // --- Hard scroll lock (mobile only) ---
  // iOS Safari often scrolls unless body is fixed.
  const scrollY = window.scrollY || 0;
  const html = document.documentElement;
  const body = document.body;

  // Add a class for styling/debugging if you want
  html.classList.add("mc-mobile");
  body.classList.add("mc-mobile");

  // Freeze the page at current scroll position
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";

  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  html.style.height = "100%";
  body.style.height = "100%";

  // --- CSS ---
  const style = document.createElement("style");
  style.textContent = `
    html.mc-mobile, body.mc-mobile {
      overscroll-behavior: none;
      touch-action: none; /* stop browser panning/zoom gestures */
      -webkit-text-size-adjust: 100%;
    }

    /* Big invisible touch zone on left half of the screen */
    .mc-touch-zone {
      position: fixed;
      left: 0;
      top: 0;
      width: 50vw;
      height: 100vh;
      z-index: 2147483647;
      background: transparent;
      touch-action: none;
      pointer-events: auto;
      -webkit-user-select: none;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }

    .mc-joystick {
      position: absolute;
      left: 0;
      top: 0;
      width: 150px;
      height: 150px;
      margin-left: 0;
      margin-top: 0;
      border-radius: 999px;
      background: rgba(255,255,255,0.10);
      border: 2px solid rgba(255,255,255,0.15);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      pointer-events: none;
    }

    .mc-joy-knob {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 64px;
      height: 64px;
      margin-left: -32px;
      margin-top: -32px;
      border-radius: 999px;
      background: rgba(255,255,255,0.18);
      border: 2px solid rgba(255,255,255,0.22);
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);

  // --- DOM elements ---
  const zone = document.createElement("div");
  zone.className = "mc-touch-zone";
  zone.setAttribute("aria-hidden", "true");

  const joy = document.createElement("div");
  joy.className = "mc-joystick";
  joy.style.display = "none";

  const knob = document.createElement("div");
  knob.className = "mc-joy-knob";
  joy.appendChild(knob);

  // Append last to ensure it's on top
  document.body.appendChild(zone);
  document.body.appendChild(joy);

  // --- Key event helpers ---
  const pressed = new Set();
  function keyDown(key) {
    if (pressed.has(key)) return;
    pressed.add(key);
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }
  function keyUp(key) {
    if (!pressed.has(key)) return;
    pressed.delete(key);
    window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  }
  function releaseAll() {
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].forEach(keyUp);
  }

  // --- Joystick math/state ---
  let activeId = null;
  let baseX = 0, baseY = 0;
  const radius = 55;
  let joystickActive = false;

  function placeJoystick(x, y) {
    // Center the joystick circle on the finger.
    joy.style.left = `${x - 75}px`;
    joy.style.top = `${y - 75}px`;
    joy.style.display = "block";
  }

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function updateFromDelta(dx, dy) {
    // clamp to radius
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(radius, len);
    const nx = (dx / len) * clamped;
    const ny = (dy / len) * clamped;

    setKnob(nx, ny);

    const dead = 12;
    const horiz = Math.abs(nx) > dead;
    const vert = Math.abs(ny) > dead;

    if (!horiz) { keyUp("ArrowLeft"); keyUp("ArrowRight"); }
    else {
      if (nx < 0) { keyDown("ArrowLeft"); keyUp("ArrowRight"); }
      else { keyDown("ArrowRight"); keyUp("ArrowLeft"); }
    }

    if (!vert) { keyUp("ArrowUp"); keyUp("ArrowDown"); }
    else {
      if (ny < 0) { keyDown("ArrowUp"); keyUp("ArrowDown"); }
      else { keyDown("ArrowDown"); keyUp("ArrowUp"); }
    }
  }

  function getPointFromTouch(t) {
    return { x: t.clientX, y: t.clientY };
  }

  function begin(x, y, id) {
    activeId = id;
    baseX = x;
    baseY = y;
    joystickActive = true;
    placeJoystick(x, y);
    setKnob(0, 0);
  }

  function move(x, y) {
    const dx = x - baseX;
    const dy = y - baseY;
    updateFromDelta(dx, dy);
  }

  function end() {
    activeId = null;
    joystickActive = false;
    joy.style.display = "none";
    setKnob(0, 0);
    releaseAll();
  }

  // --- Prevent scrolling while joystick is active ---
  // Note: must be passive:false to allow preventDefault.
  document.addEventListener("touchmove", (e) => {
    if (joystickActive) e.preventDefault();
  }, { passive: false });

  // Also prevent pinch-zoom inside our zone
  zone.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
  zone.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });

  // --- Touch events (best for iOS reliability) ---
  zone.addEventListener("touchstart", (e) => {
    if (activeId !== null) return;
    if (!e.changedTouches || e.changedTouches.length === 0) return;

    const t = e.changedTouches[0];
    const p = getPointFromTouch(t);
    begin(p.x, p.y, t.identifier);
    e.preventDefault();
  }, { passive: false });

  zone.addEventListener("touchmove", (e) => {
    if (activeId === null) return;
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      if (t.identifier === activeId) {
        const p = getPointFromTouch(t);
        move(p.x, p.y);
        e.preventDefault();
        break;
      }
    }
  }, { passive: false });

  function touchEndLike(e) {
    if (activeId === null) return;
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      if (t.identifier === activeId) {
        end();
        e.preventDefault();
        break;
      }
    }
  }

  zone.addEventListener("touchend", touchEndLike, { passive: false });
  zone.addEventListener("touchcancel", touchEndLike, { passive: false });

  // --- Pointer events (Android/modern browsers). Helps if touch events are suppressed. ---
  zone.addEventListener("pointerdown", (e) => {
    if (activeId !== null) return;
    // Only use primary touch pointer
    if (e.pointerType !== "touch") return;
    activeId = e.pointerId;
    begin(e.clientX, e.clientY, e.pointerId);
    try { zone.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  }, { passive: false });

  zone.addEventListener("pointermove", (e) => {
    if (!joystickActive) return;
    if (e.pointerId !== activeId) return;
    move(e.clientX, e.clientY);
    e.preventDefault();
  }, { passive: false });

  zone.addEventListener("pointerup", (e) => {
    if (e.pointerId !== activeId) return;
    end();
    e.preventDefault();
  }, { passive: false });

  zone.addEventListener("pointercancel", (e) => {
    if (e.pointerId !== activeId) return;
    end();
    e.preventDefault();
  }, { passive: false });

})();
