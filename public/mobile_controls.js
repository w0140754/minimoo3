(() => {
  "use strict";

  // ===== Mobile Controls (v16 debug) =====
  // Changes vs prior:
  // - Adds an on-screen "MC v16" badge so you can confirm you actually loaded this file.
  // - Uses iPhone safe-area insets for sizing.
  // - Limits horizontal fill to 92% of usable width to avoid edge overlap (adjustable).
  // - Tries harder to keep the hamburger/menu button above the canvas via CSS + JS.

  const MC_VERSION = "v17-actions";

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
    #invBtn, #mainMenu,
    #menuBtn, #hamburger, #menu, .hamburger, .menu-btn, .menuButton,
    [aria-label*="menu" i], [aria-label*="hamburger" i] {
      z-index: 2147483605 !important;
      position: fixed !important;
    }

    .mc-touch-zone {
      position: fixed;
      left: 0;
      top: 0;
      width: 30vw;
      height: 100vh;
      z-index: 2147483000;
      touch-action: none;
      background: transparent;
    }


.mc-action-wrap{
  position: fixed;
  z-index: 2147483592;
  touch-action: none;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
}
.mc-action-btn{
  width: 72px;
  height: 72px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  border: 2px solid rgba(255,255,255,0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  font-weight: 700;
  font-size: 14px;
  color: rgba(255,255,255,0.70);
  -webkit-tap-highlight-color: transparent;
}
/* Very subtle by default (attack buttons) */
.mc-action-btn.mc-ghost{
  background: rgba(255,255,255,0.02);
  border-color: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.00);
}
.mc-action-btn:active{
  background: rgba(255,255,255,0.14);
  border-color: rgba(255,255,255,0.26);
  color: rgba(255,255,255,0.92);
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
    candidates.push(document.getElementById("invBtn"));
    candidates.push(document.getElementById("mainMenu"));
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

    // ===== Mobile-only HUD defaults (canvas-space) =====
    // The main game script reads these localStorage keys during init.
    // Because this file loads BEFORE the inline game script, this affects mobile only.
    try {
      // Match index.html constants
      const HUD_POS_STORAGE_KEY = "uiHudPos_v1";
      const HOTBAR_POS_STORAGE_KEY = "uiHotbarPos_v1";

      // Hotbar layout constants (must match getHotbarLayout() in index.html)
      const HOTBAR_SIZE = 6;
      const HOTBAR_BOX = 44;
      const HOTBAR_GAP = 6;
      const hotbarTotalW = HOTBAR_SIZE * HOTBAR_BOX + (HOTBAR_SIZE - 1) * HOTBAR_GAP;

      // HUD layout constants (must match getHudLayout() in index.html)
      const HUD_W = 170;
      const HUD_HP_H = 14;
      const HUD_XP_H = 7;
      const HUD_PAD = 4;

      // Hotbar: flush bottom-right
      const hotbarX = Math.round(canvas.width - hotbarTotalW);
      const hotbarY = Math.round(canvas.height - HOTBAR_BOX);

      // HUD: bottom-center, flush bottom edge
      // Background rect is drawn at (x-4,y-4) with height (hpH+xpH+pad*2).
      // To make the background flush with the bottom of the canvas:
      const hudH = HUD_HP_H + HUD_XP_H + HUD_PAD * 2;
      const hudX = Math.round(canvas.width / 2 - HUD_W / 2);
      const hudY = Math.round(canvas.height - hudH + 4);

      localStorage.setItem(HOTBAR_POS_STORAGE_KEY, JSON.stringify({ x: hotbarX, y: hotbarY }));
      localStorage.setItem(HUD_POS_STORAGE_KEY, JSON.stringify({ x: hudX, y: hudY }));
    } catch (_) {
      // ignore storage failures (private mode, etc.)
    }

    try { positionActionCluster(); } catch (_) {}

    elevateHamburger();
  }

  // Run resize multiple times to "win" races with game init flows.
  function scheduleResizes() {
    const times = [0, 50, 150, 300, 700, 1200];
    for (const t of times) {
      setTimeout(() => {
        if (isLandscapeNow()) {
          resizeCanvasInternal();
          try { positionActionCluster(); } catch (_) {}

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


// ===== Interact + Directional Attack buttons =====
// Layout: a central Interact button with 4 directional attack pads around it.
// By default:
// - Interact is faintly visible (discoverable)
// - Attack pads are "ghost" (nearly invisible) but still tappable; they brighten while pressed.

const ACTION_SIZE = 72;
const ACTION_GAP = 10;
const ACTION_RANGE_PX = 220; // how far ahead to aim for directional attacks
const ACTION_HOLD_REPEAT = true; // hold-to-attack (uses attackHold if available)

const actionWrap = document.createElement("div");
actionWrap.className = "mc-action-wrap";
document.body.appendChild(actionWrap);

function isMainMenuOpenDom() {
  const mm = document.getElementById("mainMenu");
  return !!(mm && mm.classList.contains("open"));
}

function syncActionInteractivity() {
  // When the hamburger dropdown is open, make the action cluster non-interactive
  // so it never blocks tapping menu items.
  const open = isMainMenuOpenDom();
  actionWrap.style.pointerEvents = open ? "none" : "auto";
}

function makeBtn(label, extraClass = "") {
  const b = document.createElement("div");
  b.className = `mc-action-btn ${extraClass}`.trim();
  b.textContent = label;
  b.setAttribute("role", "button");
  b.setAttribute("aria-label", label || "attack");
  return b;
}

// Keep the action cluster from blocking hamburger-menu clicks.
try {
  const mm = document.getElementById("mainMenu");
  if (mm) {
    const mo = new MutationObserver(() => syncActionInteractivity());
    mo.observe(mm, { attributes: true, attributeFilter: ["class", "style"] });
  }
} catch (_) {}

// Fallback (in case the menu is created later)
setInterval(() => {
  try { syncActionInteractivity(); } catch (_) {}
}, 250);

const btnInteract = makeBtn("");
btnInteract.setAttribute("aria-label", "Interact");
const btnUp = makeBtn("", "mc-ghost");
const btnDown = makeBtn("", "mc-ghost");
const btnLeft = makeBtn("", "mc-ghost");
const btnRight = makeBtn("", "mc-ghost");

// Position with CSS grid (we'll place the wrapper itself in JS per safe area)
actionWrap.style.display = "none";
actionWrap.style.width = (ACTION_SIZE * 3 + ACTION_GAP * 2) + "px";
actionWrap.style.height = (ACTION_SIZE * 3 + ACTION_GAP * 2) + "px";
actionWrap.style.display = "grid";
actionWrap.style.gridTemplateColumns = `repeat(3, ${ACTION_SIZE}px)`;
actionWrap.style.gridTemplateRows = `repeat(3, ${ACTION_SIZE}px)`;
actionWrap.style.gap = ACTION_GAP + "px";
actionWrap.style.alignItems = "center";
actionWrap.style.justifyItems = "center";

// grid placement
btnUp.style.gridColumn = "2";
btnUp.style.gridRow = "1";
btnLeft.style.gridColumn = "1";
btnLeft.style.gridRow = "2";
btnInteract.style.gridColumn = "2";
btnInteract.style.gridRow = "2";
btnRight.style.gridColumn = "3";
btnRight.style.gridRow = "2";
btnDown.style.gridColumn = "2";
btnDown.style.gridRow = "3";

// Make Interact more visible than ghost pads
btnInteract.style.background = "rgba(255,255,255,0.07)";
btnInteract.style.borderColor = "rgba(255,255,255,0.16)";
btnInteract.style.color = "rgba(255,255,255,0.75)";

actionWrap.appendChild(btnUp);
actionWrap.appendChild(btnLeft);
actionWrap.appendChild(btnInteract);
actionWrap.appendChild(btnRight);
actionWrap.appendChild(btnDown);

function getMyWorldPos() {
  if (typeof window.getMyPos === "function") return window.getMyPos();
  try {
    const id = window.myId;
    const wp = window.worldPlayers;
    if (id && wp && wp[id]) return { x: wp[id].x, y: wp[id].y };
  } catch (_) {}
  return null;
}

function doInteract() {
  if (isMainMenuOpenDom()) return;
  try {
    if (typeof window.isOnPortal === "function" && window.isOnPortal()) {
      if (typeof window.startPortalFade === "function") { window.startPortalFade(); return; }
    }
    if (typeof window.tryInteract === "function") { window.tryInteract(); return; }
  } catch (_) {}
  dispatchKey("keydown", "e");
  dispatchKey("keyup", "e");
}

function aimWorldFromDir(dx, dy) {
  const me = getMyWorldPos();
  if (!me) return null;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return { wx: me.x + ux * ACTION_RANGE_PX, wy: me.y + uy * ACTION_RANGE_PX };
}

let holdActive = false;
let holdDir = null;

function startAttackDir(dx, dy) {
  if (isMainMenuOpenDom()) return;
  const aim = aimWorldFromDir(dx, dy);
  if (!aim) return;

  try {
    if (window.mainMenuOpen || window.inventoryOpen || window.skillsOpen || window.monsterBookOpen) return;
  } catch (_) {}

  if (ACTION_HOLD_REPEAT && typeof window.sendAttackHoldState === "function") {
    holdActive = true;
    holdDir = { dx, dy };
    window.sendAttackHoldState(true, aim.wx, aim.wy);
  } else if (typeof window.sendAttackAtWorld === "function") {
    window.sendAttackAtWorld(aim.wx, aim.wy);
  } else if (typeof window.sendAttack === "function") {
    window.sendAttack();
  }
}

function stopAttackHold() {
  if (!holdActive) return;
  holdActive = false;
  holdDir = null;
  try {
    if (typeof window.sendAttackHoldStop === "function") window.sendAttackHoldStop();
    else if (typeof window.sendAttackHoldState === "function") window.sendAttackHoldState(false, 0, 0);
  } catch (_) {}
}

function tickHoldAim() {
  if (!holdActive || !holdDir) return;
  const aim = aimWorldFromDir(holdDir.dx, holdDir.dy);
  if (!aim) return;
  try {
    if (typeof window.sendAttackHoldAim === "function") window.sendAttackHoldAim(aim.wx, aim.wy);
  } catch (_) {}
}
setInterval(tickHoldAim, 80);

function bindPress(el, onDown, onUp) {
  el.addEventListener("pointerdown", (e) => {
    if (!isLandscapeNow()) return;
    if (isMainMenuOpenDom()) return;
    e.preventDefault();
    e.stopPropagation();
    onDown(e);
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  }, { passive: false });

  el.addEventListener("pointerup", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onUp) onUp(e);
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}
  }, { passive: false });

  el.addEventListener("pointercancel", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onUp) onUp(e);
  }, { passive: false });
}

bindPress(btnInteract, () => doInteract());

bindPress(btnUp, () => startAttackDir(0, -1), () => stopAttackHold());
bindPress(btnDown, () => startAttackDir(0, 1), () => stopAttackHold());
bindPress(btnLeft, () => startAttackDir(-1, 0), () => stopAttackHold());
bindPress(btnRight, () => startAttackDir(1, 0), () => stopAttackHold());

window.addEventListener("blur", () => stopAttackHold());
document.addEventListener("visibilitychange", () => { if (document.hidden) stopAttackHold(); });

function positionActionCluster() {
  const vp = getVP();
  const safe = getSafeInsets();

  const clusterW = ACTION_SIZE * 3 + ACTION_GAP * 2;
  const clusterH = ACTION_SIZE * 3 + ACTION_GAP * 2;

  const minTop = safe.top + 84;
  const maxTop = vp.h - safe.bottom - clusterH - 84;

  const top = Math.max(minTop, Math.min(Math.round(vp.h / 2 - clusterH / 2), maxTop));
  const right = Math.round(safe.right + 12);

  actionWrap.style.top = top + "px";
  actionWrap.style.right = right + "px";
}

  // ===== Orientation handling =====
  function applyOrientationMode() {
    const landscape = isLandscapeNow();
    rotateOverlay.style.display = landscape ? "none" : "flex";

    if (!landscape) {
      onEnd(undefined);
      touchZone.style.display = "none";
      actionWrap.style.display = "none";
    } else {
      touchZone.style.display = "block";
      actionWrap.style.display = "grid";
      positionActionCluster();
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