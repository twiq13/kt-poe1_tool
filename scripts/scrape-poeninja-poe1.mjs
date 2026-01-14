// scripts/scrape-poeninja-poe1.mjs
import fs from "fs";

const LEAGUE = (process.env.LEAGUE || "Standard").trim();
const BASE = "https://poe.ninja/api/data";

// 4 menus (main) + sous menus (sub)
// group = pour ton UI (si tu veux l'exploiter plus tard)
// kind: "currency" => currencyoverview, "item" => itemoverview
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

(async () => {
  // 1) Charger Currency pour récupérer icône Chaos + Divine rate
  const curPayload = await fetchJSON(apiUrl("currency", "Currency"));
  const curLines = Array.isArray(curPayload?.lines) ? curPayload.lines : [];

  const chaosLine = curLines.find(x => (x.currencyTypeName || x.name) === "Chaos Orb");
  const divineLine = curLines.find(x => (x.currencyTypeName || x.name) === "Divine Orb");

  const baseIcon = chaosLine?.icon || "";
  const divineIcon = divineLine?.icon || "";
  const divineChaos = pickChaos(divineLine);

  // 2) Récupérer toutes les sections
  let all = [];

  for (const sec of SECTIONS){
    const payload = await fetchJSON(apiUrl(sec.kind, sec.type));
    const lines = Array.isArray(payload?.lines) ? payload.lines : [];

    for (const x of lines){
      const name = cleanName(x.currencyTypeName || x.name || x.baseType || "Unknown");
      if (!name) continue;

      all.push({
        section: sec.id,
        name,
        icon: x.icon || "",
        amount: pickChaos(x),     // ✅ base = chaos
        unit: "Chaos Orb",
        unitIcon: baseIcon,
      });
    }

    console.log(`Section ${sec.id} (${sec.type}) -> ${lines.length} rows`);
  }

  // 3) Output au format proche de ton PoE2
  const out = {
    updatedAt: new Date().toISOString(),
    league: LEAGUE,
    source: "https://poe.ninja/api/data",
    base: "Chaos Orb",
    baseIcon,
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

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/prices.json", JSON.stringify(out, null, 2), "utf8");

  console.log(`DONE ✅ lines=${all.length} | 1 Div=${divineChaos} Chaos | baseIcon=${!!baseIcon}`);
})();
