// =======================
// PoE1 Loot Calculator (poe.ninja)
// Base internal unit: Chaos
// Display: auto Div if chaos >= (divineChaos + 1)  // "+1 minimum" rule
// Totals toggle: Chaos / Div
// =======================

// -----------------------
// State
// -----------------------
let allItems = [];
let byName = new Map();

let activeMain = "general";
let activeSub = "currency";

let chaosIcon = "";     // fallback icon (optional)
let divineIcon = "";    // Divine Orb icon
let divineChaosValue = null; // 1 Div = X Chaos

let lastEditedCost = "chaos";   // "chaos" | "div"
let isSyncingCost = false;

let totalsUnit = "chaos";       // "chaos" | "div"

// -----------------------
// Menu config (4 main + sub menus)
// type/kind are poe.ninja API types
// -----------------------
const MAIN_TABS = [
  { id:"general", label:"General Currency" },
  { id:"equip",   label:"Equipment & Gems" },
  { id:"atlas",   label:"Atlas" },
  { id:"craft",   label:"Crafting" },
];

const SUB_TABS = {
  general: [
    { id:"currency",  label:"Currency",     kind:"currency", type:"Currency" },
    { id:"fragment",  label:"Fragments",    kind:"currency", type:"Fragment" },
    { id:"scarab",    label:"Scarabs",      kind:"item",     type:"Scarab" },
    { id:"divcard",   label:"Div Cards",    kind:"item",     type:"DivinationCard" },
  ],
  equip: [
    { id:"skillgem",  label:"Skill Gems",   kind:"item", type:"SkillGem" },
    { id:"basetype",  label:"Base Types",   kind:"item", type:"BaseType" },
    { id:"uweapon",   label:"Unique Wpn",   kind:"item", type:"UniqueWeapon" },
    { id:"uarmour",   label:"Unique Arm",   kind:"item", type:"UniqueArmour" },
    { id:"uacc",      label:"Unique Acc",   kind:"item", type:"UniqueAccessory" },
    { id:"ujewel",    label:"Unique Jewel", kind:"item", type:"UniqueJewel" },
    { id:"cluster",   label:"Cluster",      kind:"item", type:"ClusterJewel" },
    { id:"uflask",    label:"Unique Flask", kind:"item", type:"UniqueFlask" },
  ],
  atlas: [
    { id:"map",       label:"Maps",         kind:"item", type:"Map" },
    { id:"umap",      label:"Unique Maps",  kind:"item", type:"UniqueMap" },
    { id:"invite",    label:"Invitations",  kind:"item", type:"Invitation" },
    { id:"memory",    label:"Memories",     kind:"item", type:"Memory" },
    { id:"blight",    label:"Blighted",     kind:"item", type:"BlightedMap" },
    { id:"brav",      label:"Ravaged",      kind:"item", type:"BlightRavagedMap" },
  ],
  craft: [
    { id:"essence",   label:"Essences",     kind:"item", type:"Essence" },
    { id:"fossil",    label:"Fossils",      kind:"item", type:"Fossil" },
    { id:"resonator", label:"Resonators",   kind:"item", type:"Resonator" },
    { id:"oil",       label:"Oils",         kind:"item", type:"Oil" },
    { id:"deliorb",   label:"Deli Orbs",    kind:"item", type:"DeliriumOrb" },
    { id:"incubator", label:"Incubators",   kind:"item", type:"Incubator" },
    { id:"beast",     label:"Beasts",       kind:"item", type:"Beast" },
    { id:"vial",      label:"Vials",        kind:"item", type:"Vial" },
    { id:"omen",      label:"Omens",        kind:"item", type:"Omen" },
  ]
};

// -----------------------
// Helpers
// -----------------------
function setStatus(msg){
  const el = document.getElementById("fetchStatus");
  if (el) el.textContent = msg;
  console.log(msg);
}

function cleanName(s){
  return String(s || "").replace(/\s*WIKI\s*$/i, "").trim();
}

function num(id){
  const el = document.getElementById(id);
  const v = el ? Number(el.value) : 0;
  return Number.isFinite(v) ? v : 0;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}

// integer display everywhere (same as your PoE2)
function fmtInt(n){
  const x = Number(n || 0);
  return String(Math.round(x));
}

function fmtDateTime(iso){
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const pad = (x)=> String(x).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getLeague(){
  const v = (document.getElementById("leagueInput")?.value || "").trim();
  return v.length ? v : "Standard";
}

// poe.ninja API
function makePoeNinjaUrl(league, kind, type){
  const base = "https://poe.ninja/api/data";
  const l = encodeURIComponent(league);
  const t = encodeURIComponent(type);
  if (kind === "currency") return `${base}/currencyoverview?league=${l}&type=${t}`;
  return `${base}/itemoverview?league=${l}&type=${t}`;
}

async function fetchJSON(url){
  const res = await fetch(url, { cache:"no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return await res.json();
}

// -----------------------
// Currency logic: auto Div if >= (1div in chaos + 1 chaos)
// -----------------------
function shouldShowDiv(chaosAmount){
  if (!divineChaosValue || divineChaosValue <= 0) return false;
  return Number(chaosAmount || 0) >= (divineChaosValue + 1);
}

// market + loot price display (auto div)
function setDualPriceDisplay(valueEl, iconEl, chaosAmount){
  const c = Number(chaosAmount || 0);

  if (shouldShowDiv(c) && divineIcon && divineChaosValue){
    valueEl.textContent = fmtInt(c / divineChaosValue);
    if (iconEl) iconEl.src = divineIcon;
  } else {
    valueEl.textContent = fmtInt(c);
    if (iconEl) iconEl.src = chaosIcon || ""; // optional
  }
}

// Totals: single currency with toggle
function formatTotalSingle(chaosVal){
  const c = Number(chaosVal || 0);
  if (totalsUnit === "div" && divineChaosValue && divineChaosValue > 0){
    const div = c / divineChaosValue;
    return `
      <span>${fmtInt(div)}</span>
      ${divineIcon ? `<img class="pIcon" src="${divineIcon}" alt="">` : ""}
    `;
  }
  return `
    <span>${fmtInt(c)}</span>
    ${chaosIcon ? `<img class="pIcon" src="${chaosIcon}" alt="">` : ""}
  `;
}

// -----------------------
// Fetch & parse
// -----------------------
async function loadDivineRateAndIcons(league){
  // Load Currency overview to find Divine Orb value and icons
  const url = makePoeNinjaUrl(league, "currency", "Currency");
  const data = await fetchJSON(url);

  const lines = Array.isArray(data?.lines) ? data.lines : [];
  const divine = lines.find(x => (x.currencyTypeName || x.name) === "Divine Orb");
  const chaos  = lines.find(x => (x.currencyTypeName || x.name) === "Chaos Orb");

  divineIcon = divine?.icon || "";
  chaosIcon  = chaos?.icon || "";

  const val = divine?.chaosEquivalent ?? divine?.chaosValue ?? null;
  divineChaosValue = (typeof val === "number" && isFinite(val)) ? val : null;

  return { updatedAt: data?.updated ?? data?.updatedAt ?? "" };
}

function parsePoeNinjaLines(payload, fallbackSectionId){
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  const items = lines.map(x => {
    const name = cleanName(x.currencyTypeName || x.name || x.baseType || "Unknown");
    const icon = x.icon || "";
    const chaos = Number(
      x.chaosEquivalent ??
      x.chaosValue ??
      x.value ??
      0
    ) || 0;

    // keep same object shape as PoE2 (amount in base unit)
    return {
      section: fallbackSectionId,
      name,
      icon,
      amount: chaos,     // base = chaos
      unit: "chaos",
      unitIcon: chaosIcon || "",
    };
  });

  return items;
}

async function loadMarketForActive(){
  const league = getLeague();
  const sub = (SUB_TABS[activeMain] || []).find(s => s.id === activeSub) || (SUB_TABS.general[0]);

  const url = makePoeNinjaUrl(league, sub.kind, sub.type);

  setStatus(`Status: loading poe.ninja... league=${league} type=${sub.type}`);

  const payload = await fetchJSON(url);
  const items = parsePoeNinjaLines(payload, `${activeMain}:${activeSub}`);

  // update global list
  allItems = items;
  byName = new Map(allItems.map(it => [it.name.toLowerCase(), it]));

  fillDatalist();
  renderMarket();

  const updatedAt = payload?.updated ?? payload?.updatedAt ?? "";
  const updatedStr = updatedAt ? ` | last update=${fmtDateTime(updatedAt)}` : "";
  const divStr = divineChaosValue ? ` | 1 Div=${fmtInt(divineChaosValue)} Chaos` : "";

  setStatus(`Status: OK ✅ items=${allItems.length}${divStr}${updatedStr}`);
}

// -----------------------
// UI: tabs
// -----------------------
function buildMainTabs(){
  const wrap = document.getElementById("mainTabs");
  if (!wrap) return;

  wrap.innerHTML = "";
  MAIN_TABS.forEach(t => {
    const b = document.createElement("button");
    b.className = "tab" + (t.id === activeMain ? " active" : "");
    b.textContent = t.label;
    b.dataset.tab = t.id;

    b.addEventListener("click", async () => {
      activeMain = t.id;
      // default sub to first
      activeSub = (SUB_TABS[activeMain]?.[0]?.id) || "currency";

      document.querySelectorAll("#mainTabs .tab")
        .forEach(x => x.classList.toggle("active", x.dataset.tab === activeMain));

      buildSubTabs();
      await reloadAll();
      saveState();
    });

    wrap.appendChild(b);
  });
}

function buildSubTabs(){
  const wrap = document.getElementById("subTabs");
  if (!wrap) return;

  wrap.innerHTML = "";

  const subs = SUB_TABS[activeMain] || [];
  subs.forEach(sec => {
    const b = document.createElement("button");
    b.className = "tab" + (sec.id === activeSub ? " active" : "");
    b.textContent = sec.label;
    b.dataset.tab = sec.id;

    b.addEventListener("click", async () => {
      activeSub = sec.id;
      document.querySelectorAll("#subTabs .tab")
        .forEach(x => x.classList.toggle("active", x.dataset.tab === activeSub));

      await reloadAll();
      saveState();
    });

    wrap.appendChild(b);
  });
}

// -----------------------
// Market list render (same as PoE2)
// -----------------------
function renderMarket(){
  const list = document.getElementById("marketList");
  if (!list) return;

  const q = (document.getElementById("marketSearch")?.value || "").trim().toLowerCase();

  const filtered = allItems
    .filter(it => it.name.toLowerCase().includes(q))
    .slice(0, 400);

  list.innerHTML = "";

  if (!filtered.length){
    list.innerHTML = `<div style="color:#bbb;padding:10px;">No items.</div>`;
    return;
  }

  filtered.forEach(it => {
    const row = document.createElement("div");
    row.className = "market-row";

    row.innerHTML = `
      <div class="mLeft">
        ${it.icon ? `<img class="cIcon" src="${it.icon}" alt="">` : ""}
        <span class="mName">${escapeHtml(it.name)}</span>
      </div>

      <div class="mArrow">⇄</div>

      <div class="mRight">
        <span class="mPriceVal">0</span>
        <img class="unitIcon" alt="">
      </div>
    `;

    const valEl = row.querySelector(".mPriceVal");
    const icoEl = row.querySelector(".unitIcon");
    setDualPriceDisplay(valEl, icoEl, it.amount);

    row.addEventListener("click", () => addLootRow(it.name));
    list.appendChild(row);
  });
}

function fillDatalist(){
  const dl = document.getElementById("itemDatalist");
  if (!dl) return;
  dl.innerHTML = "";
  allItems.forEach(it => {
    const opt = document.createElement("option");
    opt.value = it.name;
    dl.appendChild(opt);
  });
}

// -----------------------
// Loot rows (same structure, but base=chaos)
// -----------------------
function addLootRow(prefillName = ""){
  if (prefillName && typeof prefillName === "object") prefillName = "";
  prefillName = String(prefillName || "");

  const body = document.getElementById("lootBody");
  if (!body) return;

  const tr = document.createElement("tr");
  tr.className = "lootRow";

  tr.innerHTML = `
    <td>
      <div class="lootItemWrap">
        <img class="lootIcon" alt="">
        <input class="lootItem" list="itemDatalist" placeholder="Item">
      </div>
    </td>

    <td>
      <div class="priceCell">
        <span class="lootPrice" data-chaos="0">0</span>
        <img class="baseIcon" alt="">
      </div>
    </td>

    <td>
      <div class="qtyWrap">
        <button type="button" class="qtyBtn qtyMinus" aria-label="Minus">−</button>
        <input class="lootQty" type="number" value="0" min="0">
        <button type="button" class="qtyBtn qtyPlus" aria-label="Plus">+</button>
      </div>
    </td>

    <td><button type="button" class="deleteBtn" title="Delete">✖</button></td>
  `;

  body.appendChild(tr);

  const itemInput = tr.querySelector(".lootItem");
  const qtyInput  = tr.querySelector(".lootQty");
  const iconImg   = tr.querySelector(".lootIcon");
  const priceSpan = tr.querySelector(".lootPrice");
  const unitImg   = tr.querySelector(".baseIcon");

  itemInput.value = prefillName;

  function applyPrice(){
    const name = (itemInput.value || "").trim().toLowerCase();
    const found = byName.get(name);

    if (found?.icon){
      iconImg.src = found.icon;
      iconImg.style.display = "block";
    } else {
      iconImg.style.display = "none";
    }

    const chaos = Number(found ? found.amount : 0);
    priceSpan.dataset.chaos = String(chaos);

    setDualPriceDisplay(priceSpan, unitImg, chaos);
  }

  applyPrice();
  recalcAll();
  saveState();

  itemInput.addEventListener("input", () => {
    applyPrice();
    recalcAll();
    saveState();
  });

  qtyInput.addEventListener("input", () => {
    recalcAll();
    saveState();
  });

  tr.querySelector(".qtyMinus").addEventListener("click", () => {
    qtyInput.value = Math.max(0, (Number(qtyInput.value) || 0) - 1);
    recalcAll();
    saveState();
  });

  tr.querySelector(".qtyPlus").addEventListener("click", () => {
    qtyInput.value = (Number(qtyInput.value) || 0) + 1;
    recalcAll();
    saveState();
  });

  tr.querySelector(".deleteBtn").addEventListener("click", () => {
    tr.remove();
    recalcAll();
    saveState();
  });
}

function addManualRow(){
  const body = document.getElementById("lootBody");
  if (!body) return;

  const tr = document.createElement("tr");
  tr.className = "lootRow manualRow";

  tr.innerHTML = `
    <td>
      <div class="lootItemWrap">
        <img class="lootIcon" style="display:none" alt="">
        <input class="lootItem" placeholder="Custom item">
      </div>
    </td>

    <td>
      <div class="priceCell">
        <input class="manualPrice" type="number" value="0" min="0" step="0.01">
        ${chaosIcon ? `<img class="baseIcon" src="${chaosIcon}" alt="">` : `<img class="baseIcon" alt="">`}
      </div>
    </td>

    <td>
      <div class="qtyWrap">
        <button type="button" class="qtyBtn qtyMinus">−</button>
        <input class="lootQty" type="number" value="0" min="0">
        <button type="button" class="qtyBtn qtyPlus">+</button>
      </div>
    </td>

    <td><button type="button" class="deleteBtn" title="Delete">✖</button></td>
  `;

  body.appendChild(tr);

  const qtyInput = tr.querySelector(".lootQty");
  const priceInput = tr.querySelector(".manualPrice");
  const update = () => { recalcAll(); saveState(); };

  qtyInput.addEventListener("input", update);
  priceInput.addEventListener("input", update);

  tr.querySelector(".qtyMinus").addEventListener("click", () => {
    qtyInput.value = Math.max(0, (Number(qtyInput.value) || 0) - 1);
    update();
  });

  tr.querySelector(".qtyPlus").addEventListener("click", () => {
    qtyInput.value = (Number(qtyInput.value) || 0) + 1;
    update();
  });

  tr.querySelector(".deleteBtn").addEventListener("click", () => {
    tr.remove();
    update();
  });

  update();
}

// -----------------------
// Cost per map syncing (chaos <-> div)
// -----------------------
function syncCostFields(){
  const cEl = document.getElementById("costPerMap");
  const dEl = document.getElementById("costPerMapDiv");
  if (!cEl || !dEl) return;
  if (!divineChaosValue || divineChaosValue <= 0) return;

  isSyncingCost = true;
  if (lastEditedCost === "div"){
    const div = Number(dEl.value || 0);
    cEl.value = String(div * divineChaosValue);
  } else {
    const chaos = Number(cEl.value || 0);
    dEl.value = String(chaos / divineChaosValue);
  }
  isSyncingCost = false;
}

function calcInvestChaos(){
  const maps = num("maps");
  const cEl = document.getElementById("costPerMap");
  const dEl = document.getElementById("costPerMapDiv");

  const chaosCost = cEl ? Number(cEl.value || 0) : 0;
  const divCost = dEl ? Number(dEl.value || 0) : 0;

  let costChaos = chaosCost;
  if (lastEditedCost === "div" && divineChaosValue && divineChaosValue > 0){
    costChaos = divCost * divineChaosValue;
  }
  return maps * (Number(costChaos) || 0);
}

function calcLootChaos(){
  let total = 0;
  document.querySelectorAll("#lootBody tr").forEach(tr => {
    const qty = Number(tr.querySelector(".lootQty")?.value || 0);

    if (tr.classList.contains("manualRow")){
      const p = Number(tr.querySelector(".manualPrice")?.value || 0);
      total += p * qty;
    } else {
      const chaos = Number(tr.querySelector(".lootPrice")?.dataset?.chaos || 0);
      total += chaos * qty;
    }
  });
  return total;
}

function recalcAll(){
  const invest = calcInvestChaos();
  const loot = calcLootChaos();
  const gain = loot - invest;

  document.getElementById("totalInvest").innerHTML = formatTotalSingle(invest);
  document.getElementById("totalLoot").innerHTML = formatTotalSingle(loot);
  document.getElementById("gain").innerHTML = formatTotalSingle(gain);
}

// -----------------------
// CSV export (same structure as PoE2, but chaos/div)
// -----------------------
function exportLootCSV(){
  const lines = [];
  lines.push("Item,Price,Devise,Qty,Total price chaos/divine");

  const investC = calcInvestChaos();
  const lootC = calcLootChaos();
  const gainC = lootC - investC;

  const toBoth = (chaos) => {
    const cInt = fmtInt(chaos);
    const dInt = (divineChaosValue && divineChaosValue > 0) ? fmtInt(chaos / divineChaosValue) : "0";
    return `${cInt} Chaos / ${dInt} Div`;
  };

  document.querySelectorAll("#lootBody tr").forEach(tr => {
    const item = (tr.querySelector(".lootItem")?.value || "").trim();
    const qty = Number(tr.querySelector(".lootQty")?.value || 0);

    let priceC = 0;
    let devise = "Chaos";

    if (tr.classList.contains("manualRow")){
      priceC = Number(tr.querySelector(".manualPrice")?.value || 0);
      devise = "Chaos";
    } else {
      priceC = Number(tr.querySelector(".lootPrice")?.dataset?.chaos || 0);
      devise = shouldShowDiv(priceC) ? "Div" : "Chaos";
    }

    if (!item && qty === 0 && priceC === 0) return;

    const displayPrice = (devise === "Div" && divineChaosValue)
      ? fmtInt(priceC / divineChaosValue)
      : fmtInt(priceC);

    const totalC = priceC * qty;

    const esc = (s) => {
      const str = String(s ?? "");
      return /[",\n"]/.test(str) ? `"${str.replace(/"/g,'""')}"` : str;
    };

    lines.push([
      esc(item),
      displayPrice,
      devise,
      fmtInt(qty),
      esc(toBoth(totalC))
    ].join(","));
  });

  lines.push("");
  lines.push("Invest,Loot,Gains");
  lines.push([toBoth(investC), toBoth(lootC), toBoth(gainC)].join(","));

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `poe1_loot_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

// -----------------------
// Persistence
// -----------------------
function saveState(){
  const rows = [...document.querySelectorAll("#lootBody tr")].map(tr => {
    const manual = tr.classList.contains("manualRow");
    return {
      manual,
      item: tr.querySelector(".lootItem")?.value || "",
      qty: tr.querySelector(".lootQty")?.value ?? "0",
      price: manual ? (tr.querySelector(".manualPrice")?.value ?? "0") : null
    };
  });

  const state = {
    activeMain,
    activeSub,
    search: document.getElementById("marketSearch")?.value ?? "",
    league: document.getElementById("leagueInput")?.value ?? "Standard",
    maps: document.getElementById("maps")?.value ?? "10",
    costPerMap: document.getElementById("costPerMap")?.value ?? "0",
    costPerMapDiv: document.getElementById("costPerMapDiv")?.value ?? "0",
    lastEditedCost,
    totalsUnit,
    rows
  };

  localStorage.setItem("poe1FarmState", JSON.stringify(state));
}

function loadState(){
  const raw = localStorage.getItem("poe1FarmState");
  if (!raw) return;

  try{
    const s = JSON.parse(raw);

    if (s.activeMain) activeMain = s.activeMain;
    if (s.activeSub) activeSub = s.activeSub;

    if (document.getElementById("marketSearch")) document.getElementById("marketSearch").value = s.search ?? "";
    if (document.getElementById("leagueInput")) document.getElementById("leagueInput").value = s.league ?? "Standard";

    if (document.getElementById("maps")) document.getElementById("maps").value = s.maps ?? "10";
    if (document.getElementById("costPerMap")) document.getElementById("costPerMap").value = s.costPerMap ?? "0";
    if (document.getElementById("costPerMapDiv")) document.getElementById("costPerMapDiv").value = s.costPerMapDiv ?? "0";

    if (s.lastEditedCost) lastEditedCost = s.lastEditedCost;
    if (s.totalsUnit) totalsUnit = s.totalsUnit;

    const btn = document.getElementById("displayUnitBtn");
    if (btn) btn.textContent = (totalsUnit === "chaos") ? "Show Div" : "Show Chaos";

    // build tabs UI state
    buildMainTabs();
    document.querySelectorAll("#mainTabs .tab").forEach(x => x.classList.toggle("active", x.dataset.tab === activeMain));

    buildSubTabs();
    document.querySelectorAll("#subTabs .tab").forEach(x => x.classList.toggle("active", x.dataset.tab === activeSub));

    const body = document.getElementById("lootBody");
    body.innerHTML = "";

    if (Array.isArray(s.rows) && s.rows.length){
      s.rows.forEach(r => {
        if (r.manual){
          addManualRow();
          const last = body.lastElementChild;
          last.querySelector(".lootItem").value = r.item || "";
          last.querySelector(".lootQty").value = r.qty ?? "0";
          last.querySelector(".manualPrice").value = r.price ?? "0";
        } else {
          addLootRow(r.item || "");
          const last = body.lastElementChild;
          last.querySelector(".lootQty").value = r.qty ?? "0";
        }
      });
    }
  }catch{}
}

function resetAll(){
  localStorage.removeItem("poe1FarmState");

  document.getElementById("maps").value = "10";
  document.getElementById("costPerMap").value = "0";
  document.getElementById("costPerMapDiv").value = "0";
  lastEditedCost = "chaos";

  totalsUnit = "chaos";
  const btn = document.getElementById("displayUnitBtn");
  if (btn) btn.textContent = "Show Div";

  document.getElementById("lootBody").innerHTML = "";
  addLootRow();

  activeMain = "general";
  activeSub = "currency";
  document.getElementById("marketSearch").value = "";

  buildMainTabs();
  buildSubTabs();

  recalcAll();
  setStatus("Status: reset ✅");
}

// -----------------------
// Reload all (league change, tab change, etc.)
// -----------------------
async function reloadAll(){
  const league = getLeague();
  document.getElementById("leagueTitle").textContent = `League: ${league}`;

  try{
    // always refresh divine rate (needed for conversion)
    const meta = await loadDivineRateAndIcons(league);

    const divStr = divineChaosValue ? `1 Div=${fmtInt(divineChaosValue)} Chaos` : "Div rate: N/A";
    const updatedStr = meta?.updatedAt ? ` | rates updated=${fmtDateTime(meta.updatedAt)}` : "";

    setStatus(`Status: rates OK ✅ ${divStr}${updatedStr}`);

    // sync cost inputs now that we have divineChaosValue
    syncCostFields();

    // now load active market
    await loadMarketForActive();

    // re-render existing loot rows (icons/prices)
    document.querySelectorAll("#lootBody tr").forEach(tr => {
      if (tr.classList.contains("manualRow")) return;
      const itemInput = tr.querySelector(".lootItem");
      if (!itemInput) return;
      itemInput.dispatchEvent(new Event("input"));
    });

    recalcAll();
  }catch(e){
    console.error(e);
    setStatus("Status: ERROR ❌ " + e.toString());
  }
}

// -----------------------
// Init
// -----------------------
document.addEventListener("DOMContentLoaded", () => {
  // defaults
  buildMainTabs();
  buildSubTabs();

  // restore
  loadState();

  // wire events
  document.getElementById("marketSearch")?.addEventListener("input", () => { renderMarket(); saveState(); });

  document.getElementById("leagueInput")?.addEventListener("change", async () => {
    await reloadAll();
    saveState();
  });

  document.getElementById("maps")?.addEventListener("input", () => { recalcAll(); saveState(); });

  document.getElementById("costPerMap")?.addEventListener("input", () => {
    if (isSyncingCost) return;
    lastEditedCost = "chaos";
    syncCostFields();
    recalcAll();
    saveState();
  });

  document.getElementById("costPerMapDiv")?.addEventListener("input", () => {
    if (isSyncingCost) return;
    lastEditedCost = "div";
    syncCostFields();
    recalcAll();
    saveState();
  });

  document.getElementById("displayUnitBtn")?.addEventListener("click", () => {
    totalsUnit = (totalsUnit === "chaos") ? "div" : "chaos";
    const btn = document.getElementById("displayUnitBtn");
    if (btn) btn.textContent = (totalsUnit === "chaos") ? "Show Div" : "Show Chaos";
    recalcAll();
    saveState();
  });

  document.getElementById("resetBtn")?.addEventListener("click", resetAll);
  document.getElementById("exportCsvBtn")?.addEventListener("click", exportLootCSV);

  // ensure at least one row
  if (!document.querySelector("#lootBody tr")) addLootRow();

  // initial load
  reloadAll();
});

// expose (same as your PoE2)
window.addLootRow = addLootRow;
window.addManualRow = addManualRow;
window.resetAll = resetAll;
