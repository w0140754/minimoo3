/*
  MobileControls
  - Detects coarse-pointer/mobile-ish browsers
  - Adds a left-side, touch-activated analog stick (virtual joystick)
  - Invisible when not in use

  Design goal: keep game code untouched.
  We simulate keyboard Arrow key events so your existing key handlers run.

  Installation:
    1) Save this file as: public/mobile_controls.js
    2) In index.html, add this line BEFORE your main inline <script>:
         <script src="/mobile_controls.js"></script>
*/

(() => {
  "use strict";

  function detectMobile() {
    try {
      const ua = (navigator.userAgent || "").toLowerCase();
      const uaMobile = /android|iphone|ipod|ipad|iemobile|opera mini|mobile/.test(ua);
      const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
      const noHover = typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches;
      // If it's a tablet with a mouse, (pointer:coarse) may be false; UA covers most cases.
      return !!(uaMobile || (coarse && noHover));
    } catch {
      return false;
    }
  }

  const isMobile = detectMobile();
  // Make it easy for the rest of your client code to check this later if you want.
  window.__IS_MOBILE__ = isMobile;

  // Expose a minimal API (optional)
  window.MobileControls = {
    isMobile,
  };

  if (!isMobile) return;

  // ---- CSS ----
  const style = document.createElement("style");
  style.textContent = `

    /* Prevent the page from scrolling while playing on mobile */
    html.mc-mobile, body.mc-mobile {
      height: 100%;
      overflow: hidden;
      overscroll-behavior: none;
    }
    body.mc-mobile {
      touch-action: none;
      -webkit-overflow-scrolling: auto;
    }

    /* Mobile analog stick */
    .mc-touch-zone {
            position: fixed;
      left: 0;
      top: 0;
      width: 50vw;
      height: 100vh;
      z-index: 9999;
      background: transparent;
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
    }
    .mc-joystick {
      position: absolute;
      left: 0;
      top: 0;
      width: 150px;
      height: 150px;
      margin-left: 0;
      margin-top: 0;
      transform: translate(-50%, -50%);
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
      z-index: 60;
    }
    .mc-joystick.mc-active {
      opacity: 1;
    }
    .mc-joy-base {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 130px;
      height: 130px;
      transform: translate(-50%, -50%);
      border-radius: 999px;
      background: rgba(0,0,0,0.18);
      border: 2px solid rgba(255,255,255,0.20);
      backdrop-filter: blur(2px);
    }
    .mc-joy-knob {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 62px;
      height: 62px;
      transform: translate(-50%, -50%);
      border-radius: 999px;
      background: rgba(255,255,255,0.22);
      border: 2px solid rgba(255,255,255,0.25);
      box-shadow: 0 6px 18px rgba(0,0,0,0.25);
    }
  `;
  document.head.appendChild(style);

  // ---- DOM ----
  function getGameWrap() {
    // Your page uses #gameWrap; fall back to body if not found.
    return document.getElementById("gameWrap") || document.body;
  }

  const wrap = getGameWrap();
  // Ensure wrap is a positioned container so absolute children work.
  const wrapStyle = window.getComputedStyle(wrap);
  if (wrapStyle.position === "static") {
    wrap.style.position = "relative";
  }

  const zone = document.createElement("div");
  zone.className = "mc-touch-zone";
  zone.setAttribute("aria-hidden", "true");

  const joy = document.createElement("div");
  joy.className = "mc-joystick";
  joy.setAttribute("aria-hidden", "true");
  joy.innerHTML = `
    <div class="mc-joy-base"></div>
    <div class="mc-joy-knob"></div>
  `;

  wrap.appendChild(zone);
  wrap.appendChild(joy);

  const knob = joy.querySelector(".mc-joy-knob");

  // ---- Key simulation ----
  const KEYMAP = {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
  };

  const held = { up: false, down: false, left: false, right: false };

  function dispatchKey(key, type) {
    try {
      const ev = new KeyboardEvent(type, {
        key,
        code: key,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ev);
    } catch {
      // Ignore
    }
  }

  function setHeld(next) {
    for (const dir of ["up", "down", "left", "right"]) {
      const v = !!next[dir];
      if (held[dir] === v) continue;
      held[dir] = v;
      dispatchKey(KEYMAP[dir], v ? "keydown" : "keyup");
    }
  }

  function clearHeld() {
    setHeld({ up: false, down: false, left: false, right: false });
  }

  // ---- Joystick math + state ----
  const RADIUS = 52;          // knob travel radius (px)
  const DEADZONE = 0.18;      // normalized deadzone
  const AXIS_ON = 0.35;       // normalized axis threshold

  let active = false;
  let pointerId = null;
  let origin = { x: 0, y: 0 };

  function showJoystickAt(x, y) {
    joy.style.left = `${x}px`;
    joy.style.top = `${y}px`;
    joy.classList.add("mc-active");
    // Center knob
    if (knob) knob.style.transform = "translate(-50%, -50%) translate(0px, 0px)";
  }

  function hideJoystick() {
    joy.classList.remove("mc-active");
  }

  function updateJoystick(x, y) {
    const dx = x - origin.x;
    const dy = y - origin.y;
    const dist = Math.hypot(dx, dy) || 0;

    let nx = 0, ny = 0;
    if (dist > 0) {
      const clamped = Math.min(dist, RADIUS);
      const scale = clamped / dist;
      const kx = dx * scale;
      const ky = dy * scale;
      if (knob) knob.style.transform = `translate(-50%, -50%) translate(${kx}px, ${ky}px)`;

      // Normalized (-1..1) based on clamped distance
      nx = (dx / RADIUS);
      ny = (dy / RADIUS);
      // Clamp normalization
      nx = Math.max(-1, Math.min(1, nx));
      ny = Math.max(-1, Math.min(1, ny));
    } else {
      if (knob) knob.style.transform = "translate(-50%, -50%) translate(0px, 0px)";
    }

    // Deadzone
    const mag = Math.hypot(nx, ny);
    if (mag < DEADZONE) {
      setHeld({ up: false, down: false, left: false, right: false });
      return;
    }

    setHeld({
      left: nx < -AXIS_ON,
      right: nx > AXIS_ON,
      up: ny < -AXIS_ON,
      down: ny > AXIS_ON,
    });
  }

  function startAt(clientX, clientY, pid) {
    active = true;
    pointerId = pid;
    origin = { x: clientX, y: clientY };
    showJoystickAt(clientX, clientY);
    updateJoystick(clientX, clientY);
  }

  function end() {
    if (!active) return;
    active = false;
    pointerId = null;
    clearHeld();
    hideJoystick();
  }

  // Prefer Pointer Events
  const hasPointer = "PointerEvent" in window;

  if (hasPointer) {
    zone.addEventListener("pointerdown", (e) => {
      // Only react to touch/pen, not mouse.
      if (e.pointerType === "mouse") return;
      // Only allow one active pointer for the joystick.
      if (active) return;
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      startAt(e.clientX, e.clientY, e.pointerId);
    }, { passive: false });

    zone.addEventListener("pointermove", (e) => {
      if (!active) return;
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      updateJoystick(e.clientX, e.clientY);
    }, { passive: false });

    zone.addEventListener("pointerup", (e) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      end();
    }, { passive: false });

    zone.addEventListener("pointercancel", (e) => {
      if (e.pointerId !== pointerId) return;
      end();
    });
  } else {
    // Touch fallback
    zone.addEventListener("touchstart", (e) => {
      if (active) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      e.preventDefault();
      startAt(t.clientX, t.clientY, t.identifier);
    }, { passive: false });

    zone.addEventListener("touchmove", (e) => {
      if (!active) return;
      const touches = e.changedTouches;
      if (!touches) return;
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        if (t.identifier === pointerId) {
          e.preventDefault();
          updateJoystick(t.clientX, t.clientY);
          break;
        }
      }
    }, { passive: false });

    zone.addEventListener("touchend", (e) => {
      const touches = e.changedTouches;
      if (!touches) return;
      for (let i = 0; i < touches.length; i++) {
        if (touches[i].identifier === pointerId) {
          e.preventDefault();
          end();
          break;
        }
      }
    }, { passive: false });

    zone.addEventListener("touchcancel", () => end());
  }

  // Safety: if the page blurs, release keys.
  window.addEventListener("blur", () => {
    end();
  });
})();
