// scripts/scrape-poeninja-poe1.mjs
import fs from "fs";

const LEAGUE = (process.env.LEAGUE || "Standard").trim();
const BASE = "https://poe.ninja/api/data";

// 4 menus (main) + sous menus (sub)
const SECTIONS = [
  // General Currency
  { id:"currency",   label:"Currency",           group:"General Currency", kind:"currency", type:"Currency" },
  { id:"fragments",  label:"Fragments",          group:"General Currency", kind:"currency", type:"Fragment" },
  { id:"scarabs",    label:"Scarabs",            group:"General Currency", kind:"item",     type:"Scarab" },
  { id:"divcards",   label:"Divination Cards",   group:"General Currency", kind:"item",     type:"DivinationCard" },

  // Equipment & Gems
  { id:"skillgems",  label:"Skill Gems",         group:"Equipment & Gems", kind:"item", type:"SkillGem" },
  { id:"basetypes",  label:"Base Types",         group:"Equipment & Gems", kind:"item", type:"BaseType" },
  { id:"uweapon",    label:"Unique Weapons",     group:"Equipment & Gems", kind:"item", type:"UniqueWeapon" },
  { id:"uarmour",    label:"Unique Armours",     group:"Equipment & Gems", kind:"item", type:"UniqueArmour" },
  { id:"uacc",       label:"Unique Accessories", group:"Equipment & Gems", kind:"item", type:"UniqueAccessory" },
  { id:"ujewel",     label:"Unique Jewels",      group:"Equipment & Gems", kind:"item", type:"UniqueJewel" },
  { id:"cluster",    label:"Cluster Jewels",     group:"Equipment & Gems", kind:"item", type:"ClusterJewel" },
  { id:"uflask",     label:"Unique Flasks",      group:"Equipment & Gems", kind:"item", type:"UniqueFlask" },

  // Atlas
  { id:"maps",       label:"Maps",               group:"Atlas", kind:"item", type:"Map" },
  { id:"umaps",      label:"Unique Maps",        group:"Atlas", kind:"item", type:"UniqueMap" },
  { id:"invites",    label:"Invitations",        group:"Atlas", kind:"item", type:"Invitation" },
  { id:"memories",   label:"Memories",           group:"Atlas", kind:"item", type:"Memory" },
  { id:"blighted",   label:"Blighted Maps",      group:"Atlas", kind:"item", type:"BlightedMap" },
  { id:"ravaged",    label:"Ravaged Maps",       group:"Atlas", kind:"item", type:"BlightRavagedMap" },

  // Crafting
  { id:"essence",    label:"Essences",           group:"Crafting", kind:"item", type:"Essence" },
  { id:"fossil",     label:"Fossils",            group:"Crafting", kind:"item", type:"Fossil" },
  { id:"resonator",  label:"Resonators",         group:"Crafting", kind:"item", type:"Resonator" },
  { id:"oil",        label:"Oils",               group:"Crafting", kind:"item", type:"Oil" },
  { id:"deliorb",    label:"Delirium Orbs",      group:"Crafting", kind:"item", type:"DeliriumOrb" },
  { id:"incubator",  label:"Incubators",         group:"Crafting", kind:"item", type:"Incubator" },
  { id:"beast",      label:"Beasts",             group:"Crafting", kind:"item", type:"Beast" },
  { id:"vial",       label:"Vials",              group:"Crafting", kind:"item", type:"Vial" },
  { id:"omen",       label:"Omens",              group:"Crafting", kind:"item", type:"Omen" },
];

function cleanName(s){
  return String(s || "").replace(/\s*WIKI\s*$/i, "").trim();
}

function normalizeUrl(u){
  if (!u) return "";
  const s = String(u).trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("/")) return "https://poe.ninja" + s;
  return s;
}

function pickChaos(x){
  const v = x?.chaosEquivalent ?? x?.chaosValue ?? x?.value ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function apiUrl(kind, type){
  const league = encodeURIComponent(LEAGUE);
  const t = encodeURIComponent(type);
  if (kind === "currency") return `${BASE}/currencyoverview?league=${league}&type=${t}`;
  return `${BASE}/itemoverview?league=${league}&type=${t}`;
}

async function fetchJSON(url){
  const res = await fetch(url, {
    headers: {
      "User-Agent": "KT-PoE1-Loot-Calc (GitHub Actions)",
      "Accept": "application/json",
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.json();
}

// currencyoverview FIX: icons are in currencyDetails
function buildCurrencyIconMap(payload){
  const details = Array.isArray(payload?.currencyDetails) ? payload.currencyDetails : [];
  const map = new Map();
  for (const d of details){
    const name = cleanName(d?.name);
    const icon = normalizeUrl(d?.icon);
    if (name) map.set(name.toLowerCase(), icon);
  }
  return map;
}

function safeFileLeagueName(s){
  return String(s || "Standard").trim().replace(/[^a-z0-9_-]+/gi, "_");
}

(async () => {
  // 1) Currency overview for Chaos+Div icon/rate
  const curPayload = await fetchJSON(apiUrl("currency", "Currency"));
  const curLines = Array.isArray(curPayload?.lines) ? curPayload.lines : [];
  const curIconMap = buildCurrencyIconMap(curPayload);

  const chaosIcon = curIconMap.get("chaos orb") || "";
  const divineIcon = curIconMap.get("divine orb") || "";

  const divineLine = curLines.find(x => cleanName(x.currencyTypeName || x.name).toLowerCase() === "divine orb");
  const divineChaos = pickChaos(divineLine);

  // hard fail if base icons missing (you said mandatory)
  if (!chaosIcon){
    console.error("ERROR: Chaos Orb icon missing in currencyDetails (currencyoverview).");
    process.exit(1);
  }
  if (!divineIcon){
    console.error("ERROR: Divine Orb icon missing in currencyDetails (currencyoverview).");
    process.exit(1);
  }

  // 2) all sections
  let all = [];

  for (const sec of SECTIONS){
    const payload = await fetchJSON(apiUrl(sec.kind, sec.type));
    const lines = Array.isArray(payload?.lines) ? payload.lines : [];

    if (sec.kind === "currency"){
      const iconMap = buildCurrencyIconMap(payload);

      for (const x of lines){
        const name = cleanName(x.currencyTypeName || x.name || "Unknown");
        if (!name) continue;

        const icon = normalizeUrl(iconMap.get(name.toLowerCase()) || "");
        if (!icon){
          console.error(`ERROR: Missing icon for currency "${name}" in section ${sec.id} (${sec.type})`);
          process.exit(1);
        }

        all.push({
          section: sec.id,
          name,
          icon,
          amount: pickChaos(x),
          unit: "Chaos Orb",
          unitIcon: chaosIcon,
        });
      }
    } else {
      for (const x of lines){
        const name = cleanName(x.name || x.baseType || "Unknown");
        if (!name) continue;

        const icon = normalizeUrl(x.icon || "");
        if (!icon){
          console.error(`ERROR: Missing icon for item "${name}" in section ${sec.id} (${sec.type})`);
          process.exit(1);
        }

        all.push({
          section: sec.id,
          name,
          icon,
          amount: pickChaos(x),
          unit: "Chaos Orb",
          unitIcon: chaosIcon,
        });
      }
    }

    console.log(`Section ${sec.id} (${sec.type}) -> rows=${lines.length}`);
  }

  // 3) output
  const out = {
    updatedAt: new Date().toISOString(),
    league: LEAGUE,
    source: "https://poe.ninja/api/data",
    base: "Chaos Orb",
    baseIcon: chaosIcon,
    divine: {
      name: "Divine Orb",
      icon: divineIcon,
      chaosValue: divineChaos
    },
    sections: SECTIONS.map(s => ({
      id: s.id,
      label: s.label,
      group: s.group,
      kind: s.kind,
      type: s.type
    })),
    lines: all
  };

  const leagueFile = safeFileLeagueName(LEAGUE);
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(`data/prices-${leagueFile}.json`, JSON.stringify(out, null, 2), "utf8");

  console.log(`DONE ✅ wrote data/prices-${leagueFile}.json | lines=${all.length} | 1 Div=${divineChaos} Chaos`);
})();
