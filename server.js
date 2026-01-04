import http from "http";
import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// DEV FLAG: set to false to disable the in-game map editor network messages
const ENABLE_MAP_EDITOR = true;
const MAP_EDITOR_DEBUG_LOG = true; // set false to silence editor logs

/* ======================
   HTTP FILE SERVER
====================== */
const server = http.createServer((req, res) => {
  const requested = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, "public", safePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type =
      ext === ".html" ? "text/html" :
      ext === ".js" ? "text/javascript" :
      ext === ".css" ? "text/css" :
      ext === ".png" ? "image/png" :
      "application/octet-stream";

    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

/* ======================
   MAPS (multi-zone)
   0 floor
   1 wall
   3 portal
   4 statue (save)
====================== */
const TILE = 48;
const PORTAL_TILE = 3;
const STATUE_TILE = 4;

function makeBorderMap(w, h) {
  const map = Array.from({ length: h }, () => Array(w).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) map[y][x] = 1;
    }
  }
  return map;
}

function makeEmptyLayer(w, h, fill = 0) {
  return Array.from({ length: h }, () => Array(w).fill(fill));
}


function makeMapA() {
  // Redesigned "Map 1" (A): tall open clearing with embedded top/bottom portals.
  const w = 25, h = 18;

  // Ground layer: 0 = ground, 1 = wall/boundary, 3 = portal
  const map = [
    [1,1,1,1,1,1,1,1,1,1,1,PORTAL_TILE,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,PORTAL_TILE,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ];

  // Object layer: 0 empty, 1 canopy (drawn on top), 2 large rock (solid), 6 stump (solid)
  const obj = makeEmptyLayer(w, h, 0);

  // Trees framing the sides (stump with canopy above)
  const treeCoords = [
    { x: 2,  y: 2 }, { x: 22, y: 2 },
    { x: 2,  y: 6 }, { x: 22, y: 6 },
    { x: 2,  y: 10 }, { x: 22, y: 10 },
    { x: 2,  y: 14 }, { x: 22, y: 14 },
  ];
  for (const t of treeCoords) {
    if (t.y > 0) obj[t.y - 1][t.x] = 1; // canopy
    obj[t.y][t.x] = 6; // stump (solid)
  }

  // Rocks (solid) as landmarks
  obj[4][8]  = 2;
  obj[4][16] = 2;
  obj[8][8]  = 2;
  obj[8][16] = 2;
  obj[12][8] = 2;
  obj[12][16]= 2;

  // Portals embedded in boundary wall
  const pToC = { x: 11, y: 0,  to: "C" }; // top -> starting map (C)
  const pToB = { x: 11, y: 16, to: "B" }; // bottom -> map B

  return { id: "A", w, h, map, obj, portals: [pToC, pToB] };
}

function makeMapB() {
  const w = 26, h = 18;
  const map = makeBorderMap(w, h);
  const obj = makeEmptyLayer(w, h, 0);


  for (let x = 3; x < w - 3; x++) map[6][x] = (x % 3 === 0) ? 1 : 0;
  for (let y = 3; y < h - 3; y++) map[y][13] = (y % 4 === 0) ? 1 : 0;

  // Portal back to A (left edge)
  const pToA = { x: 1, y: Math.floor(h / 2), to: "A" };
  map[pToA.y][pToA.x] = PORTAL_TILE;

  // Object layer decorations
  const trees = [
    { x: 4, y: 4 },
    { x: 5, y: 4 },
    { x: 4, y: 5 },
    { x: 13, y: 8 },
    { x: 16, y: 3 },
  ];
  for (const t of trees) {
    if (t.y > 0) obj[t.y - 1][t.x] = 1;
    obj[t.y][t.x] = 6;
  }
  obj[9][9] = 2;
  obj[6][15] = 2;
  return { id: "B", w, h, map, obj, portals: [pToA] };
}

function makeMapC() {
  const w = 18, h = 12;
  const map = makeBorderMap(w, h);
  const obj = makeEmptyLayer(w, h, 0);


  // Portal back to A (left edge)
  const pToA = { x: 1, y: Math.floor(h / 2), to: "A" };
  map[pToA.y][pToA.x] = PORTAL_TILE;

  // Statue in center
  const sx = Math.floor(w / 2);
  const sy = Math.floor(h / 2);
  map[sy][sx] = STATUE_TILE;

  // Sanctuary: light decoration only (no blocking clusters)
  const trees = [
    { x: 3, y: 3 },
    { x: w - 4, y: 3 },
  ];
  for (const t of trees) {
    if (t.y > 0) obj[t.y - 1][t.x] = 1;
    obj[t.y][t.x] = 6;
  }
  obj[Math.floor(h/2)][Math.floor(w/2) + 3] = 2;
  return { id: "C", w, h, map, obj, portals: [pToA] };
}

// Build map templates, then clone into a live, mutable runtime copy.
const mapTemplates = { A: makeMapA(), B: makeMapB(), C: makeMapC() };

function clone2D(grid) {
  return grid.map(row => row.slice());
}
function clonePortals(portals) {
  return (portals || []).map(p => ({ ...p }));
}
function cloneMap(m) {
  return {
    id: m.id,
    w: m.w,
    h: m.h,
    map: clone2D(m.map),
    obj: m.obj ? clone2D(m.obj) : makeEmptyLayer(m.w, m.h, 0),
    portals: clonePortals(m.portals),
  };
}

// Live, editable maps used for collision, portals, snapshots, etc.
let maps = {
  A: cloneMap(mapTemplates.A),
  B: cloneMap(mapTemplates.B),
  C: cloneMap(mapTemplates.C),
};

function tileAt(mapId, x, y) {
  const m = maps[mapId];
  if (!m) return 1;
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 1;
  return m.map[ty][tx];
}

function objAt(mapId, x, y) {
  const m = maps[mapId];
  if (!m) return 0;
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 0;
  return (m.obj && m.obj[ty] ? m.obj[ty][tx] : 0) || 0;
}

// Ground collision tiles
function isSolid(tile) { return tile === 1; }

// Object layer collision tiles (tileIds refer to tiles_objects.png, where 0=empty)
function isObjSolid(objTile) { return objTile === 2 || objTile === 6; } // 2=large rock, 6=tree stump

function isBlocked(mapId, x, y) {
  return isSolid(tileAt(mapId, x, y)) || isObjSolid(objAt(mapId, x, y));
}

/* ======================
   COLLISION
====================== */
const PLAYER_RADIUS = 16;
const NPC_RADIUS = 16;
const MOB_RADIUS = 16;

// 64x64 sprite: use a "foot" collision circle so the head/cape can overlap tiles
// without the feet clipping into walls.
const PLAYER_FOOT_RADIUS = 14;
// Player position is sprite center; bottom of sprite is +32. Put feet a bit above bottom.
const PLAYER_FOOT_OFFSET_Y = 22;

function collides(mapId, nx, ny, radius) {
  const left = nx - radius;
  const right = nx + radius;
  const top = ny - radius;
  const bottom = ny + radius;

  return (
    isBlocked(mapId, left, top) ||
    isBlocked(mapId, right, top) ||
    isBlocked(mapId, left, bottom) ||
    isBlocked(mapId, right, bottom)
  );
}


// Player-specific collision using a foot-circle (ny is player center Y)
function collidesPlayer(mapId, nx, ny) {
  return collides(mapId, nx, ny + PLAYER_FOOT_OFFSET_Y, PLAYER_FOOT_RADIUS);
}

function clampToWorldPlayer(mapId, p) {
  const m = maps[mapId];
  if (!m) return;

  const minX = PLAYER_FOOT_RADIUS;
  const maxX = m.w * TILE - PLAYER_FOOT_RADIUS;

  const minFootY = PLAYER_FOOT_RADIUS;
  const maxFootY = m.h * TILE - PLAYER_FOOT_RADIUS;

  // Clamp using the foot position, then derive center Y
  p.x = Math.max(minX, Math.min(maxX, p.x));
  const footY = Math.max(minFootY, Math.min(maxFootY, p.y + PLAYER_FOOT_OFFSET_Y));
  p.y = footY - PLAYER_FOOT_OFFSET_Y;
}

function playerFootTile(p) {
  const fx = p.x;
  const fy = p.y + PLAYER_FOOT_OFFSET_Y;
  return { tx: Math.floor(fx / TILE), ty: Math.floor(fy / TILE), fx, fy };
}


function clampToWorld(mapId, p, radius) {
  const m = maps[mapId];
  p.x = Math.max(radius, Math.min(m.w * TILE - radius, p.x));
  p.y = Math.max(radius, Math.min(m.h * TILE - radius, p.y));
}

function findSpawn(mapId, radius) {
  const m = maps[mapId];
  for (let i = 0; i < 600; i++) {
    const x = (TILE * 2) + Math.random() * (m.w * TILE - TILE * 4);
    const y = (TILE * 2) + Math.random() * (m.h * TILE - TILE * 4);
    if (!collides(mapId, x, y, radius)) return { x, y };
  }
  return { x: TILE * 2, y: TILE * 2 };
}

function findPortalSpawn(mapId, fromMapId) {
  const m = maps[mapId];
  if (!m) return findSpawn(mapId, PLAYER_FOOT_RADIUS);

  const portals = m.portals || [];
  const back = portals.find(p => p.to === fromMapId) || portals[0];
  if (!back) return findSpawn(mapId, PLAYER_FOOT_RADIUS);

  const x = back.x, y = back.y;
  const onLeft = x <= 1;
  const onRight = x >= m.w - 2;
  const onTop = y <= 1;
  const onBottom = y >= m.h - 2;

  let spawnTx = x, spawnTy = y;
  if (onLeft) spawnTx = x + 1;
  else if (onRight) spawnTx = x - 1;
  else if (onTop) spawnTy = y + 1;
  else if (onBottom) spawnTy = y - 1;
  else spawnTx = x + 1;

  return { x: (spawnTx * TILE) + TILE / 2, y: (spawnTy * TILE) + TILE / 2 };
}

function centerOfTile(tx, ty) {
  return { x: (tx * TILE) + TILE / 2, y: (ty * TILE) + TILE / 2 };
}

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function newId() { return crypto.randomBytes(6).toString("hex"); }

/* ======================
   LEVEL / XP HELPERS
====================== */
function xpToNext(level) {
  return Math.floor(20 * Math.pow(level, 1.35));
}

function broadcastToMap(mapId, obj) {
  // Sends a small patch message to every connected client currently on mapId.
  for (const client of wss.clients) {
    const pid = socketToId.get(client);
    if (!pid) continue;
    const p = players.get(pid);
    if (!p) continue;
    if (p.mapId !== mapId) continue;
    send(client, obj);
  }
}


const idToSocket = new Map();
function awardXp(player, amount) {
  if (!player) return;

  player.xp += amount;

  let leveled = false;
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext;
    player.level += 1;
    player.xpNext = xpToNext(player.level);

    player.maxHp += 10;
    player.atk += 2;
    player.hp = player.maxHp;

    leveled = true;
  }

  if (leveled) {
    const ws = idToSocket.get(player.id);
    if (ws) {
      send(ws, {
        type: "levelup",
        level: player.level,
        maxHp: player.maxHp,
        atk: player.atk,
        xp: player.xp,
        xpNext: player.xpNext
      });
    }
  }
}

/* ======================
   LOOT (COINS)
====================== */
const drops = new Map(); // dropId -> {id,mapId,x,y,amount,expiresAtMs}
const DROP_LIFETIME_MS = 12000;
const PICKUP_RADIUS = 22;

function spawnCoins(mapId, x, y, amount) {
  const id = "d_" + newId();
  drops.set(id, {
    id,
    mapId,
    x, y,
    amount,
    expiresAtMs: Date.now() + DROP_LIFETIME_MS
  });
  return id;
}

function maybePickupDropsForPlayer(p) {
  const nowMs = Date.now();
  for (const [did, d] of drops) {
    if (d.expiresAtMs <= nowMs) { drops.delete(did); continue; }
    if (d.mapId !== p.mapId) continue;
    if (dist(p.x, p.y, d.x, d.y) <= PICKUP_RADIUS) {
      p.gold += d.amount;
            addItemToInventory(p, "coin", d.amount);
drops.delete(did);

      const ws = idToSocket.get(p.id);
      if (ws) send(ws, { type: "loot", kind: "gold", amount: d.amount, totalGold: p.gold });
    }
  }
}

/* ======================
   WEAPONS
====================== */
const WEAPONS = ["sword", "spear", "wand"];

/* ======================
   ITEMS / INVENTORY
====================== */
const ITEMS = {
  // currency
  coin: { id: "coin", name: "Coin", maxStack: 999 },

  // consumables
  potion_small: {
    id: "potion_small",
    name: "Small Potion",
    maxStack: 20,
    onUse(p) {
      p.hp = Math.min(p.maxHp, p.hp + 25);
    }
  },

  // equipment (MapleStory-style)
  training_sword: { id: "training_sword", name: "Training Sword", type: "weapon", slot: "weapon", weaponKey: "sword", maxStack: 1 },
  training_spear: { id: "training_spear", name: "Training Spear", type: "weapon", slot: "weapon", weaponKey: "spear", maxStack: 1 },

  candy_cane_spear: { id: "candy_cane_spear", name: "Candy Cane Spear", type: "weapon", slot: "weapon", weaponKey: "spear", maxStack: 1 },
  fang_spear:       { id: "fang_spear",       name: "Fang Spear",       type: "weapon", slot: "weapon", weaponKey: "spear", maxStack: 1 },
  training_wand:  { id: "training_wand",  name: "Training Wand",  type: "weapon", slot: "weapon", weaponKey: "wand",  maxStack: 1 },

  cloth_armor:   { id: "cloth_armor",   name: "Cloth Armor",   type: "armor",     slot: "armor",     maxStack: 1 },
  cloth_hat:     { id: "cloth_hat",     name: "Cloth Hat",     type: "hat",       slot: "hat",       maxStack: 1 },
  lucky_charm:   { id: "lucky_charm",   name: "Lucky Charm",   type: "accessory", slot: "accessory", maxStack: 1 }
};

function addItemToInventory(p, itemId, amount) {
  const def = ITEMS[itemId];
  if (!def || amount <= 0) return false;

  // stack first
  for (const slot of p.inventory.slots) {
    if (slot && slot.id === itemId && slot.qty < def.maxStack) {
      const space = def.maxStack - slot.qty;
      const add = Math.min(space, amount);
      slot.qty += add;
      amount -= add;
      if (amount <= 0) return true;
    }
  }

  // empty slots
  for (let i = 0; i < p.inventory.slots.length && amount > 0; i++) {
    if (!p.inventory.slots[i]) {
      const add = Math.min(def.maxStack, amount);
      p.inventory.slots[i] = { id: itemId, qty: add };
      amount -= add;
    }
  }

  return amount === 0;
}


function nextWeapon(w) {
  const i = WEAPONS.indexOf(w);
  return WEAPONS[(i >= 0 ? i + 1 : 0) % WEAPONS.length];
}

function facingFromInputs(inputs, fallback) {
  // prefer cardinal
  if (inputs.left && !inputs.right) return { x: -1, y: 0 };
  if (inputs.right && !inputs.left) return { x: 1, y: 0 };
  if (inputs.up && !inputs.down) return { x: 0, y: -1 };
  if (inputs.down && !inputs.up) return { x: 0, y: 1 };
  return fallback || { x: 0, y: 1 };
}

function norm(v) {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

function meleeHitTest(p, m, offset, radius) {
  const f = norm(p.facing || { x: 0, y: 1 });
  const cx = p.x + f.x * offset;
  const cy = p.y + f.y * offset;
  return dist(cx, cy, m.x, m.y) <= radius;
}

/* ======================
   PROJECTILES
====================== */
const projectiles = new Map(); // id -> {id,mapId,ownerId,x,y,vx,vy,rad,damage,expiresAtMs}

function spawnProjectile({ mapId, ownerId, x, y, vx, vy, rad = 10, damage = 8, lifeMs = 850 }) {
  const id = "pr_" + newId();
  projectiles.set(id, {
    id, mapId, ownerId,
    x, y, vx, vy,
    rad,
    damage,
    expiresAtMs: Date.now() + lifeMs
  });
  return id;
}

/* ======================
   STATE
====================== */
const players = new Map();    // id -> player
const socketToId = new Map(); // ws -> id

/* ======================
   NPCS
====================== */
const npcs = new Map();

function spawnNpc(id, name, mapId) {
  const s = findSpawn(mapId, NPC_RADIUS);
  npcs.set(id, {
    id, name, mapId,
    x: s.x, y: s.y,
    dirX: 0, dirY: 0,
    changeDirIn: 0,
  });
}
spawnNpc("npc1", "Sprout", "A");
spawnNpc("npc2", "Pebble", "B");

const npcDialogue = {
  npc1: [
    "Hey! Welcome to the meadow.",
    "Open inventory (I) to equip weapons 🙂",
    "Equip a weapon to change attacks!"
  ],
  npc2: [
    "Second map! Nice.",
    "Pick up coins by walking over them.",
    "Loot can become items later 🙂"
  ],
};

function randomDir() {
  const dirs = [
    [ 1, 0], [-1, 0], [0, 1], [0,-1],
    [ 1, 1], [ 1,-1], [-1, 1], [-1,-1],
    [ 0, 0]
  ];
  const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

/* ======================
   MOBS
====================== */
const mobs = new Map();

function spawnMob(id, mapId, opts = {}) {
  // Allow explicit placement (tile coords or world coords) for curated spawns.
  let s;
  if (Number.isFinite(opts.x) && Number.isFinite(opts.y)) {
    s = { x: opts.x, y: opts.y };
  } else if (Number.isFinite(opts.tx) && Number.isFinite(opts.ty)) {
    s = { x: (opts.tx + 0.5) * TILE, y: (opts.ty + 0.5) * TILE };
  } else {
    s = findSpawn(mapId, MOB_RADIUS);
  }
  mobs.set(id, {
    id,
    mapId,
    x: s.x, y: s.y,
    hp: opts.hp ?? 30,
    maxHp: opts.maxHp ?? (opts.hp ?? 30),

    dirX: 0, dirY: 0,
    changeDirIn: 0,

    atkCd: 0,
    respawnIn: 0,
    lastHitBy: null,

    // type + behavior
    mobType: opts.mobType || "purple",  // "purple" or "orange"
    passiveUntilHit: !!opts.passiveUntilHit,
    aggroTargetId: null,
    aggroUntil: 0,
    speedMul: opts.speedMul ?? 0.65, // base tuning, per mob type later
  });
}

// Mobs only in A/B (C is safe)
// Map A: ONLY docile orange slimes, placed in curated positions.
const ORANGE_SPAWNS_A = [
  { tx: 6,  ty: 4 },
  { tx: 18, ty: 4 },
  { tx: 9,  ty: 8 },
  { tx: 15, ty: 8 },
  { tx: 6,  ty: 12 },
  { tx: 18, ty: 12 },
];
ORANGE_SPAWNS_A.forEach((s, i) => {
  spawnMob(`a_orange_${i + 1}`, "A", { mobType: "orange", passiveUntilHit: true, tx: s.tx, ty: s.ty });
});

// Map B: keep one purple slime as before (tune/expand later)
spawnMob("m3", "B", { mobType: "purple" });

function respawnMob(m) {
  const s = findSpawn(m.mapId, MOB_RADIUS);
  m.x = s.x; m.y = s.y;
  m.hp = m.maxHp;
  m.respawnIn = 0;
  m.lastHitBy = null;
  m.dirX = 0; m.dirY = 0;
  m.changeDirIn = 0;

  m.aggroTargetId = null;
  m.aggroUntil = 0;
}

/* ======================
   CONNECTIONS
====================== */
wss.on("connection", (ws) => {
  const id = newId();
  socketToId.set(ws, id);
  idToSocket.set(id, ws);

  // Start in sanctuary
  const mapId = "C";
  const spawn = findSpawn(mapId, PLAYER_FOOT_RADIUS);

  players.set(id, {
    id,
    name: "Player",
    mapId,
    x: spawn.x,
    y: spawn.y,
    inputs: { up: false, down: false, left: false, right: false },

    // facing for directional attacks
    facing: { x: 0, y: 1 },

    // weapons
    weapon: "sword",

    // leveling
    level: 1,
    xp: 0,
    xpNext: xpToNext(1),
    atk: 10,
    hp: 100,
    maxHp: 100,

    // loot
    gold: 0,

    
    // equipment (server authoritative)
    equipment: { weapon: null, armor: null, hat: null, accessory: null },

    // inventory (server authoritative)
    inventory: { size: 24, slots: [ { id: "training_sword", qty: 1 }, { id: "training_spear", qty: 1 }, { id: "candy_cane_spear", qty: 1 }, { id: "fang_spear", qty: 1 }, { id: "training_wand", qty: 1 }, { id: "cloth_armor", qty: 1 }, { id: "cloth_hat", qty: 1 }, { id: "lucky_charm", qty: 1 }, ...Array(19).fill(null) ] },
// combat timers
    atkAnim: 0,
    atkCd: 0,
    invuln: 0,

    // save + respawn
    save: null,     // {mapId,x,y}
    respawnIn: 0,   // seconds
  });

  const m = maps[mapId];
  send(ws, {
    type: "welcome",
    id,
    mapId,
    map: m.map,
    objMap: m.obj,
    tileSize: TILE,
    mapW: m.w,
    mapH: m.h,
    playerRadius: PLAYER_RADIUS,
    portalTile: PORTAL_TILE,
    statueTile: STATUE_TILE,
    weapons: WEAPONS,
  });

  ws.on("message", (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }

    const pid = socketToId.get(ws);
    const p = players.get(pid);
    if (!p) return;

    if (msg.type === "setName") {
      const raw = (msg.name ?? "").toString().trim();
      // letters only, 4-6 chars
      if (!/^[A-Za-z]{4,6}$/.test(raw)) {
        send(ws, { type: "nameRejected", reason: "Name must be letters only (4-6 chars)." });
        return;
      }
      p.name = raw;
      send(ws, { type: "nameAccepted", name: p.name });
      return;
    }

    if (msg.type === "input") {
      p.inputs.up = !!msg.up;
      p.inputs.down = !!msg.down;
      p.inputs.left = !!msg.left;
      p.inputs.right = !!msg.right;

      // update facing only when some direction is pressed
      const hasDir = p.inputs.up || p.inputs.down || p.inputs.left || p.inputs.right;
      if (hasDir) {
        // Don't let movement inputs overwrite the attack-facing while an attack animation is active.
        if (p.atkAnim <= 0) p.facing = facingFromInputs(p.inputs, p.facing);
      }

      return;
    }

    if (msg.type === "invClick") {
      if (p.hp <= 0 || p.respawnIn > 0) return;
      const slotIndex = Number(msg.slot);
      if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= p.inventory.slots.length) return;
      const stack = p.inventory.slots[slotIndex];
      if (!stack) return;

      const def = ITEMS[stack.id];
      if (!def) return;

      // Equip if the item is equippable
      if (def.slot === "weapon" || def.slot === "armor" || def.slot === "hat" || def.slot === "accessory") {
        // Only allow equipping single items (maxStack 1). If somehow stacked, equip one.
        const equipSlot = def.slot;

        // If slot already occupied, swap it back into inventory (if space)
        const currentlyEquippedId = p.equipment[equipSlot];
        if (currentlyEquippedId) {
          // find empty slot
          const empty = p.inventory.slots.findIndex(s => !s);
          if (empty === -1) return; // no room to swap
          p.inventory.slots[empty] = { id: currentlyEquippedId, qty: 1 };
        }

        // remove one from inventory slot
        if (stack.qty > 1) stack.qty -= 1;
        else p.inventory.slots[slotIndex] = null;

        p.equipment[equipSlot] = def.id;

        // Back-compat: set active weapon key for combat pipeline
        if (equipSlot === "weapon") {
          p.weapon = def.weaponKey || "sword";
        }
        return;
      }

      // Otherwise, consume if it has onUse
      if (typeof def.onUse === "function") {
        def.onUse(p);
        stack.qty -= 1;
        if (stack.qty <= 0) p.inventory.slots[slotIndex] = null;
      }
      return;
    }

    if (msg.type === "unequip") {
      if (p.hp <= 0 || p.respawnIn > 0) return;
      const slotName = String(msg.slot || "");
      if (slotName !== "weapon" && slotName !== "armor" && slotName !== "hat" && slotName !== "accessory") return;

      const equippedId = p.equipment[slotName];
      if (!equippedId) return;

      const empty = p.inventory.slots.findIndex(s => !s);
      if (empty === -1) return; // inventory full

      p.inventory.slots[empty] = { id: equippedId, qty: 1 };
      p.equipment[slotName] = null;

      if (slotName === "weapon") {
        p.weapon = "sword"; // default unarmed behavior uses sword logic for now
      }
      return;
    }

    if (msg.type === "editTile") {
      if (!ENABLE_MAP_EDITOR) return;

      // Only allow editing the map you're currently on.
      const m0 = maps[p.mapId];
      if (!m0) return;

      const layer = String(msg.layer || "");
      const tx = Number(msg.x);
      const ty = Number(msg.y);
      const tile = Number(msg.tile);

      if (!Number.isInteger(tx) || !Number.isInteger(ty) || !Number.isInteger(tile)) return;
      if (tx < 0 || ty < 0 || tx >= m0.w || ty >= m0.h) return;

      // Avoid breaking portals/statues accidentally (use code for those for now).
      const currGround = m0.map[ty][tx];
      if (layer === "ground") {
        let ok = true;
        let reason = "ok";
        if (currGround === PORTAL_TILE || currGround === STATUE_TILE) { ok = false; reason = "protected_tile"; }
        if (tile !== 0 && tile !== 1) { ok = false; reason = "invalid_ground_tile"; }

        if (MAP_EDITOR_DEBUG_LOG) {
          console.log(`[EDITOR] ${ok ? "ACCEPT" : "REJECT"} ground @${p.mapId} (${tx},${ty}) ${currGround} -> ${tile} (${reason})`);
        }

        if (!ok) {
          send(ws, { type: "editAck", ok: false, layer: "ground", x: tx, y: ty, tile, reason });
          return;
        }

        m0.map[ty][tx] = tile;
        broadcastToMap(p.mapId, { type: "mapPatch", mapId: p.mapId, layer: "ground", x: tx, y: ty, tile });
        send(ws, { type: "editAck", ok: true, layer: "ground", x: tx, y: ty, tile });
        return;
      }

      if (layer === "object") {
        if (!m0.obj) m0.obj = makeEmptyLayer(m0.w, m0.h, 0);
        // allow only known object tiles: 0 empty, 1 canopy, 2 rock, 6 stump
        let ok = true;
        let reason = "ok";
        if (![0,1,2,6].includes(tile)) { ok = false; reason = "invalid_object_tile"; }

        if (MAP_EDITOR_DEBUG_LOG) {
          console.log(`[EDITOR] ${ok ? "ACCEPT" : "REJECT"} object @${p.mapId} (${tx},${ty}) -> ${tile} (${reason})`);
        }

        if (!ok) {
          send(ws, { type: "editAck", ok: false, layer: "object", x: tx, y: ty, tile, reason });
          return;
        }

        m0.obj[ty][tx] = tile;
        broadcastToMap(p.mapId, { type: "mapPatch", mapId: p.mapId, layer: "object", x: tx, y: ty, tile });
        send(ws, { type: "editAck", ok: true, layer: "object", x: tx, y: ty, tile });
        return;
      }

      return;
    }


    if (msg.type === "swapWeapon") {
      // Weapon cycling is deprecated in favor of equipment slots.
      // Keep this as a no-op so older clients don’t break.
      return;
    }

    if (msg.type === "portal") {
      if (p.hp <= 0 || p.respawnIn > 0) return;

      const t = tileAt(p.mapId, p.x, p.y + PLAYER_FOOT_OFFSET_Y);
      if (t !== PORTAL_TILE) return;

      const m0 = maps[p.mapId];
      if (!m0) return;

      const { tx, ty } = playerFootTile(p);

      const portal = (m0.portals || []).find(pp => pp.x === tx && pp.y === ty);
      if (!portal) return;

      const to = portal.to;
      if (!to || !maps[to]) return;

      const sp = findPortalSpawn(to, p.mapId);
      p.mapId = to;
      p.x = sp.x;
      p.y = sp.y;
      return;
    }

    if (msg.type === "interact") {
      if (p.hp <= 0 || p.respawnIn > 0) return;

      const npcId = String(msg.npcId || "");
      const npc = npcs.get(npcId);
      if (!npc) return;
      if (npc.mapId !== p.mapId) return;

      const INTERACT_RANGE = 80;
      if (dist(p.x, p.y, npc.x, npc.y) > INTERACT_RANGE) return;

      const lines = npcDialogue[npcId] || ["..."];
      const text = lines[Math.floor(Math.random() * lines.length)];
      send(ws, { type: "dialogue", npcId, npcName: npc.name || npcId, text });
      return;
    }

    if (msg.type === "attack") {
      if (p.hp <= 0 || p.respawnIn > 0) return;
      if (p.atkCd > 0) return;

      // shared animation time (client uses this for sword/spear/wand “active”)
      p.atkAnim = 0.18;

      // weapon cooldowns (anti-spam)
      // NOTE: This is the *authoritative* lockout. The client should only animate when it sees atkAnim > 0 in snapshots.
      const weaponDelaySec = ({ sword: 0.30, spear: 0.30, wand: 0.30 })[p.weapon] ?? 0.30;
      p.atkCd = weaponDelaySec;

      // No fighting in sanctuary
      if (p.mapId === "C") return;

      // Optional aim from client.
// We prefer aimDirX/aimDirY when provided because they are derived from the player's
// on-screen position and are not affected by camera smoothing lag.
const aimDirX = Number(msg.aimDirX);
const aimDirY = Number(msg.aimDirY);
const hasAimDir = Number.isFinite(aimDirX) && Number.isFinite(aimDirY) && (Math.abs(aimDirX) + Math.abs(aimDirY) > 1e-6);

const aimX = Number(msg.aimX);
const aimY = Number(msg.aimY);
const hasAim = Number.isFinite(aimX) && Number.isFinite(aimY);

if (hasAimDir) {
  const dx = aimDirX;
  const dy = aimDirY;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  if (p.weapon === "wand") {
    const f = norm({ x: dx, y: dy });
    p.facing = f;
  } else {
    if (ax > ay) p.facing = { x: dx >= 0 ? 1 : -1, y: 0 };
    else if (ay > 0) p.facing = { x: 0, y: dy >= 0 ? 1 : -1 };
  }
} else if (hasAim) {
  const dx = aimX - p.x;
  const dy = aimY - p.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  if (p.weapon === "wand") {
    const f = norm({ x: dx, y: dy });
    if (Math.abs(f.x) + Math.abs(f.y) > 0) p.facing = f;
  } else {
    if (ax > ay) p.facing = { x: dx >= 0 ? 1 : -1, y: 0 };
    else if (ay > 0) p.facing = { x: 0, y: dy >= 0 ? 1 : -1 };
  }
}

            // Cache a discrete attack direction for clients (used for rendering during atkAnim).
      // This prevents the weapon sprite from snapping to the movement direction mid-swing.
      {
        const fx = p.facing?.x ?? 0;
        const fy = p.facing?.y ?? 0;
        const ax = Math.abs(fx);
        const ay = Math.abs(fy);
        if (ax > ay) p.atkDir = (fx >= 0 ? "right" : "left");
        else if (ay > 0) p.atkDir = (fy >= 0 ? "down" : "up");
        // else keep previous
      }

// SWORD: medium offset, medium radius
      if (p.weapon === "sword") {
        const OFFSET = 40;
        const RADIUS = 55;

        for (const m of mobs.values()) {
          if (m.mapId !== p.mapId) continue;
          if (m.respawnIn > 0) continue;
          if (m.hp <= 0) continue;

          if (meleeHitTest(p, m, OFFSET, RADIUS)) {
            m.hp -= p.atk;
            m.lastHitBy = p.id;

            // passive mobs become aggro when hit
            if (m.passiveUntilHit) {
              m.aggroTargetId = p.id;
              m.aggroUntil = Date.now() + 3000;
            }

            send(ws, {
              type: "hit",
              targetId: m.id,
              targetKind: "mob",
              srcX: p.x,
              srcY: p.y,
              amount: p.atk,
              fx: "slash",
            });

            if (m.hp <= 0) {
              awardXp(p, 12);
              const coins = 2 + Math.floor(Math.random() * 4);
              spawnCoins(m.mapId, m.x, m.y, coins);
              m.respawnIn = 1.2;
            }
          }
        }
        return;
      }

      // SPEAR: longer offset, tighter radius (feels like a poke)
      if (p.weapon === "spear") {
        const OFFSET = 70;
        const RADIUS = 45;

        for (const m of mobs.values()) {
          if (m.mapId !== p.mapId) continue;
          if (m.respawnIn > 0) continue;
          if (m.hp <= 0) continue;

          if (meleeHitTest(p, m, OFFSET, RADIUS)) {
            const dmg = Math.max(1, Math.floor(p.atk * 0.9)); // slightly less than sword
            m.hp -= dmg;
            m.lastHitBy = p.id;

            if (m.passiveUntilHit) {
              m.aggroTargetId = p.id;
              m.aggroUntil = Date.now() + 3000;
            }

            send(ws, {
              type: "hit",
              targetId: m.id,
              targetKind: "mob",
              srcX: p.x,
              srcY: p.y,
              amount: dmg,
              fx: "stab",
            });

            if (m.hp <= 0) {
              awardXp(p, 12);
              const coins = 2 + Math.floor(Math.random() * 4);
              spawnCoins(m.mapId, m.x, m.y, coins);
              m.respawnIn = 1.2;
            }
          }
        }
        return;
      }

      // WAND: spawn a projectile
      if (p.weapon === "wand") {
        const f = norm(p.facing || { x: 0, y: 1 });

        // range-tuned: not too far for starter wand (can be increased for stronger wands later)
        const speed = 480;          // px/s
        const maxRange = 360;       // px
        const lifeMs = Math.max(120, Math.floor((maxRange / speed) * 1000));

        // start slightly in front of player
        const startX = p.x + f.x * 26;
        const startY = p.y + f.y * 26;

        spawnProjectile({
          mapId: p.mapId,
          ownerId: p.id,
          x: startX,
          y: startY,
          vx: f.x * speed,
          vy: f.y * speed,
          rad: 10,
          damage: Math.max(1, Math.floor(p.atk * 0.75)),
          lifeMs
        });

        return;
      }
    }
  

if (msg.type === "useItem") {
  const slotIndex = (msg.slot|0);
  if (!p.inventory || !p.inventory.slots) return;
  if (slotIndex < 0 || slotIndex >= p.inventory.slots.length) return;

  const slot = p.inventory.slots[slotIndex];
  if (!slot) return;

  const def = ITEMS[slot.id];
  if (!def || !def.onUse) return;

  def.onUse(p);
  slot.qty -= 1;
  if (slot.qty <= 0) p.inventory.slots[slotIndex] = null;
  return;
}

});

  ws.on("close", () => {
    const pid = socketToId.get(ws);
    socketToId.delete(ws);
    if (pid) {
      players.delete(pid);
      idToSocket.delete(pid);
    }
  });
});

/* ======================
   TICK
====================== */
const TICK_HZ = 30;
setInterval(() => {
  const dt = 1 / TICK_HZ;

  // Players movement + timers + save + drop pickup + respawn
  const PLAYER_SPEED = 180;
  for (const p of players.values()) {
    p.atkAnim = Math.max(0, p.atkAnim - dt);
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);

    // Respawn countdown
    if (p.respawnIn > 0) {
      p.respawnIn -= dt;
      if (p.respawnIn <= 0) {
        if (p.save) {
          p.mapId = p.save.mapId;
          p.x = p.save.x;
          p.y = p.save.y;
        } else {
          const s = findSpawn("C", PLAYER_FOOT_RADIUS);
          p.mapId = "C";
          p.x = s.x;
          p.y = s.y;
        }
        p.hp = p.maxHp;
        p.invuln = 0.6;
        p.atkCd = 0;
        p.atkAnim = 0;
      }
      continue;
    }

    if (p.hp <= 0) continue;

    let dx = 0, dy = 0;
    if (p.inputs.left) dx -= 1;
    if (p.inputs.right) dx += 1;
    if (p.inputs.up) dy -= 1;
    if (p.inputs.down) dy += 1;

    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }

    const nx = p.x + dx * PLAYER_SPEED * dt;
    const ny = p.y + dy * PLAYER_SPEED * dt;

    if (!collidesPlayer(p.mapId, nx, p.y)) p.x = nx;
    if (!collidesPlayer(p.mapId, p.x, ny)) p.y = ny;

    clampToWorldPlayer(p.mapId, p);

    // Save statue: touching statue tile saves
    const t = tileAt(p.mapId, p.x, p.y + PLAYER_FOOT_OFFSET_Y);
    if (t === STATUE_TILE) {
      const { tx, ty } = playerFootTile(p);
      const c = centerOfTile(tx, ty);

      const same =
        p.save &&
        p.save.mapId === p.mapId &&
        Math.abs(p.save.x - c.x) < 0.01 &&
        Math.abs(p.save.y - c.y) < 0.01;

      if (!same) {
        p.save = { mapId: p.mapId, x: c.x, y: c.y };
        const ws = idToSocket.get(p.id);
        if (ws) send(ws, { type: "saved", mapId: p.save.mapId });
      }
    }

    maybePickupDropsForPlayer(p);
  }

  // NPC wander
  const NPC_SPEED = 120;
  for (const n of npcs.values()) {
    n.changeDirIn -= dt;
    if (n.changeDirIn <= 0) {
      const [dx, dy] = randomDir();
      n.dirX = dx; n.dirY = dy;
      n.changeDirIn = 0.8 + Math.random() * 1.2;
    }

    const nx = n.x + n.dirX * NPC_SPEED * dt;
    const ny = n.y + n.dirY * NPC_SPEED * dt;

    let moved = false;
    if (!collides(n.mapId, nx, n.y, NPC_RADIUS)) { n.x = nx; moved = true; }
    if (!collides(n.mapId, n.x, ny, NPC_RADIUS)) { n.y = ny; moved = true; }
    if (!moved) n.changeDirIn = 0;

    clampToWorld(n.mapId, n, NPC_RADIUS);
  }

  // Projectiles
  const nowMs = Date.now();
  for (const [pid, pr] of projectiles) {
    if (pr.expiresAtMs <= nowMs) { projectiles.delete(pid); continue; }

    // move
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;

    // hit wall -> delete
    if (collides(pr.mapId, pr.x, pr.y, pr.rad)) {
      projectiles.delete(pid);
      continue;
    }

    // hit mob
    for (const m of mobs.values()) {
      if (m.mapId !== pr.mapId) continue;
      if (m.respawnIn > 0) continue;
      if (m.hp <= 0) continue;

      if (dist(pr.x, pr.y, m.x, m.y) <= (pr.rad + MOB_RADIUS)) {
        m.hp -= pr.damage;
        m.lastHitBy = pr.ownerId;

        if (m.passiveUntilHit) {
          m.aggroTargetId = pr.ownerId;
          m.aggroUntil = Date.now() + 3000;
        }

        const ws = idToSocket.get(pr.ownerId);
        if (ws) {
          send(ws, {
            type: "hit",
            targetId: m.id,
            targetKind: "mob",
            srcX: pr.x,
            srcY: pr.y,
            amount: pr.damage,
            fx: "bolt",
          });
        }

        projectiles.delete(pid);

        if (m.hp <= 0) {
          // award xp to owner if still around
          const owner = players.get(pr.ownerId);
          if (owner) awardXp(owner, 12);

          const coins = 2 + Math.floor(Math.random() * 4);
          spawnCoins(m.mapId, m.x, m.y, coins);
          m.respawnIn = 1.2;
        }
        break;
      }
    }
  }

  // Mobs: wander + melee attack + respawn
  const BASE_MOB_SPEED = 120;
  const MOB_AGGRO = 110;
  const MOB_HIT = 36;
  const MOB_DMG = 10;
  const MOB_ATK_CD = 0.9;

  for (const m of mobs.values()) {
    if (m.respawnIn > 0) {
      m.respawnIn -= dt;
      if (m.respawnIn <= 0) respawnMob(m);
      continue;
    }
    if (m.hp <= 0) continue;

    m.atkCd = Math.max(0, m.atkCd - dt);

    // passive logic: only aggro after being hit (or while aggroUntil)
    let target = null;
    let bestD = Infinity;

    const aggroActive = (!m.passiveUntilHit) || (m.aggroUntil > Date.now());

    if (m.passiveUntilHit && m.aggroUntil <= Date.now()) {
      m.aggroTargetId = null;
    }

    for (const p of players.values()) {
      if (p.mapId !== m.mapId) continue;
      if (p.hp <= 0) continue;
      if (p.respawnIn > 0) continue;

      if (m.passiveUntilHit) {
        if (!aggroActive) continue;
        if (m.aggroTargetId && p.id !== m.aggroTargetId) continue;
      }

      const d = dist(p.x, p.y, m.x, m.y);
      if (d < bestD) { bestD = d; target = p; }
    }

    let dirX = 0, dirY = 0;

    if (target && bestD <= MOB_AGGRO) {
      const dx = target.x - m.x;
      const dy = target.y - m.y;
      const l = Math.hypot(dx, dy) || 1;
      dirX = dx / l;
      dirY = dy / l;

      if (bestD <= MOB_HIT && m.atkCd <= 0) {
        m.atkCd = MOB_ATK_CD;

        if (target.invuln <= 0) {
          target.hp = Math.max(0, target.hp - MOB_DMG);
          target.invuln = 0.35;

          if (target.hp <= 0 && target.respawnIn <= 0) {
            target.respawnIn = 2.0;
            const ws = idToSocket.get(target.id);
            if (ws) send(ws, { type: "dead" });
          }

          const kx = (dx / l) * 16;
          const ky = (dy / l) * 16;

          const nx = target.x + kx;
          const ny = target.y + ky;

          if (!collides(target.mapId, nx, target.y, PLAYER_RADIUS)) target.x = nx;
          if (!collides(target.mapId, target.x, ny, PLAYER_RADIUS)) target.y = ny;
          clampToWorld(target.mapId, target, PLAYER_RADIUS);

          const ws = idToSocket.get(target.id);
          if (ws) {
            send(ws, {
              type: "hit",
              targetId: target.id,
              targetKind: "player",
              srcX: m.x,
              srcY: m.y,
              amount: MOB_DMG,
              fx: "bite",
            });
          }
        }
      }
    } else {
      m.changeDirIn -= dt;
      if (m.changeDirIn <= 0) {
        const [dx, dy] = randomDir();
        m.dirX = dx; m.dirY = dy;
        m.changeDirIn = 0.7 + Math.random() * 1.2;
      }
      dirX = m.dirX;
      dirY = m.dirY;
    }

    const speed = BASE_MOB_SPEED * (m.speedMul ?? 0.65);

    const nx = m.x + dirX * speed * dt;
    const ny = m.y + dirY * speed * dt;

    let moved = false;
    if (!collides(m.mapId, nx, m.y, MOB_RADIUS)) { m.x = nx; moved = true; }
    if (!collides(m.mapId, m.x, ny, MOB_RADIUS)) { m.y = ny; moved = true; }
    if (!moved) m.changeDirIn = 0;

    clampToWorld(m.mapId, m, MOB_RADIUS);
  }

  // drop expiry cleanup
  for (const [did, d] of drops) {
    if (d.expiresAtMs <= nowMs) drops.delete(did);
  }

}, 1000 / TICK_HZ);

/* ======================
   SNAPSHOTS
====================== */
const SNAPSHOT_HZ = 15;
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState !== 1) continue;

    const pid = socketToId.get(ws);
    const me = pid ? players.get(pid) : null;
    if (!me) continue;

    const mapId = me.mapId;
    const m = maps[mapId];

    const ps = {};
    for (const [id, p] of players) {
      if (p.mapId !== mapId) continue;
      ps[id] = {
        name: p.name,
        x: p.x, y: p.y,
        hp: p.hp, maxHp: p.maxHp,
        level: p.level, xp: p.xp, xpNext: p.xpNext,
        atkAnim: p.atkAnim,
        atkDir: p.atkDir,
        facing: p.facing,
        gold: p.gold,
        weapon: p.weapon,
        equipment: p.equipment,
        ...(id === pid ? { inventory: p.inventory } : {})
      };
    }

    const ns = {};
    for (const [id, n] of npcs) {
      if (n.mapId !== mapId) continue;
      ns[id] = { x: n.x, y: n.y, name: n.name };
    }

    const ms = {};
    for (const [id, mob] of mobs) {
      if (mob.mapId !== mapId) continue;
      if (mob.respawnIn > 0) continue;
      ms[id] = {
        id,
        x: mob.x, y: mob.y,
        hp: mob.hp, maxHp: mob.maxHp,
        mobType: mob.mobType
      };
    }

    const ds = {};
    for (const [id, d] of drops) {
      if (d.mapId !== mapId) continue;
      ds[id] = { x: d.x, y: d.y, amount: d.amount };
    }

    const prs = {};
    for (const [id, pr] of projectiles) {
      if (pr.mapId !== mapId) continue;
      prs[id] = { x: pr.x, y: pr.y, ownerId: pr.ownerId };
    }

    send(ws, {
      type: "snapshot",
      mapId,
      map: m.map,
      objMap: m.obj,
      mapW: m.w,
      mapH: m.h,
      tileSize: TILE,
      portalTile: PORTAL_TILE,
      statueTile: STATUE_TILE,
      players: ps,
      npcs: ns,
      mobs: ms,
      drops: ds,
      projectiles: prs
    });
  }
}, 1000 / SNAPSHOT_HZ);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT} (TILE=${TILE}, PORTAL_TILE=${PORTAL_TILE}, STATUE_TILE=${STATUE_TILE})`);
  console.log(`Maps: A=${maps.A.w}x${maps.A.h}, B=${maps.B.w}x${maps.B.h}, C=${maps.C.w}x${maps.C.h}`);
});
