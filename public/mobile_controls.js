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

  // Canvas may exist immediately, but some flows re-create/re-style it.
  // We'll look it up lazily too.
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

    .mc-touch-zone {
      position: fixed;
      left: 0;
      top: 0;
      width: 50vw;
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

  // ===== Mobile zoom (camera-safe) =====
  // Keep the GAME'S canvas coordinate system smaller on mobile, so the camera
  // uses a smaller view size (zoomed-in world) rather than CSS-cropping.
  const BASE_W = 800;
  const BASE_H = 600;

  // Requested zoom: 1.5x (3/2)
  const MOBILE_ZOOM = 3 / 2; // 1.5

  // Internal canvas size on mobile (this is what your camera math uses).
  // Note: width isn't an integer for 800/1.5, so we round to the closest int.
  // Height is exactly 400.
  const MOBILE_W = Math.round(BASE_W / MOBILE_ZOOM); // ~533
  const MOBILE_H = Math.round(BASE_H / MOBILE_ZOOM); // 400

  function resizeCanvasInternal() {
    const ctx = ensureWrap();
    if (!ctx) return;
    const { canvas } = ctx;

    const vp = getVP();

    // Use smaller internal size on mobile landscape so camera follows correctly.
    const internalW = MOBILE_W;
    const internalH = MOBILE_H;

    // Force internal resolution (THIS is what the camera uses).
    if (canvas.width !== internalW) canvas.width = internalW;
    if (canvas.height !== internalH) canvas.height = internalH;

    // Scale the smaller canvas up to fit the screen (uniform scale, no distortion).
    const scale = Math.min(vp.w / internalW, vp.h / internalH);
    const dispW = Math.round(internalW * scale);
    const dispH = Math.round(internalH * scale);

    // Centered via CSS (left/top 50% + translate). Just set size.
    canvas.style.width = dispW + "px";
    canvas.style.height = dispH + "px";
  }

  // Run resize multiple times to "win" races with game init flows.
  function scheduleResizes() {
    const times = [0, 50, 150, 300, 700, 1200];
    for (const t of times) {
      setTimeout(() => {
        if (isLandscapeNow()) resizeCanvasInternal();
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
  let startX = 0, startY = 0;
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
      try { touchZone.releasePointerCapture(pointerId); } catch (_) {}
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