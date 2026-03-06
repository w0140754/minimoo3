import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const MAPS_DIR = path.join(__dirname, "maps");

function normalizeMapTemplate(raw, fallbackId) {
  const map = Array.isArray(raw?.map) ? raw.map : [];
  const h = Number.isFinite(raw?.h) ? raw.h : map.length;
  const w = Number.isFinite(raw?.w) ? raw.w : (map[0]?.length || 0);

  return {
    id: String(raw?.id ?? fallbackId),
    w,
    h,
    map,
    obj: Array.isArray(raw?.obj) ? raw.obj : Array.from({ length: h }, () => Array(w).fill(0)),
    z: Array.isArray(raw?.z) ? raw.z : Array.from({ length: h }, () => Array(w).fill(0)),
    zGate: Array.isArray(raw?.zGate) ? raw.zGate : Array.from({ length: h }, () => Array(w).fill(0)),
    portals: Array.isArray(raw?.portals) ? raw.portals : [],
    npcs: Array.isArray(raw?.npcs) ? raw.npcs : [],
    mobSpawns: Array.isArray(raw?.mobSpawns)
      ? raw.mobSpawns
      : (Array.isArray(raw?.mobs) ? raw.mobs : []),
  };
}

export function loadMapTemplate(id) {
  const cleanId = String(id);
  const filePath = path.join(MAPS_DIR, `${cleanId}.json`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return normalizeMapTemplate(raw, cleanId);
}

export function getMapTemplates() {
  const out = {};
  if (!fs.existsSync(MAPS_DIR)) return out;

  const files = fs.readdirSync(MAPS_DIR)
    .filter(name => name.toLowerCase().endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const id = path.basename(file, '.json');
    out[id] = loadMapTemplate(id);
  }

  return out;
}
