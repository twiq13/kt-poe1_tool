// =======================
// PoE1 Loot Calculator (KT_)
// =======================
//
// Local JSON per league:
//   ./data/prices-Standard.json
//   ./data/prices-Keepers.json
// Fallback (if missing):
//   ./data/prices.json
//
// Base unit: Chaos
// Display rule (market + loot): show Div if >= (1 Div in Chaos + 1 Chaos)
// Totals: toggle Chaos/Div (single unit)
// UI: main tabs + sub tabs + state

let allItems = [];
let byName = new Map();

// Tabs
let activeMain = "general";
let activeSection = "currency"; // sub tab id

// League
const LEAGUES = ["Standard", "Keepers"];
let activeLeague = "Standard";

// Icons & rate
let chaosIcon = "";
let divineIcon = "";
let divineChaosValue = null; // 1 Div = X Chaos

// Cost sync
let lastEditedCost = "chaos"; // "chaos" | "div"
let isSyncingCost = false;

// Totals display unit
let totalsUnit = "chaos"; // "chaos" | "div"

// ---------- DOM helpers ----------
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

// ---------- Sections mapping (4 main menus + sub menus) ----------
const MAIN_TABS = [
  { id:"general", label:"General Currency" },
  { id:"equip",   label:"Equipment & Gems" },
  { id:"atlas",   label:"Atlas" },
  { id:"craft",   label:"Crafting" },
];

// Must match your scraper output "section" ids
const SUB_TABS = {
  general: [
    { id:"currency",  label:"Currency" },
    { id:"fragments", label:"Fragments" },
    { id:"scarabs",   label:"Scarabs" },
    { id:"divcards",  label:"Div Cards" },
  ],
  equip: [
    { id:"skillgems", label:"Skill Gems" },
    { id:"basetypes", label:"Base Types" },
    { id:"uweapon",   label:"Unique Wpn" },
    { id:"uarmour",   label:"Unique Arm" },
    { id:"uacc",      label:"Unique Acc" },
    { id:"ujewel",    label:"Unique Jewel" },
    { id:"cluster",   label:"Cluster" },
    { id:"uflask",    label:"Unique Flask" },
  ],
  atlas: [
    { id:"maps",      label:"Maps" },
    { id:"umaps",     label:"Unique Maps" },
    { id:"invites",   label:"Invitations" },
    { id:"memories",  label:"Memories" },
    { id:"blighted",  label:"Blighted" },
    { id:"ravaged",   label:"Ravaged" },
  ],
  craft: [
    { id:"essence",   label:"Essences" },
    { id:"fossil",    label:"Fossils" },
    { id:"resonator", label:"Resonators" },
    { id:"oil",       label:"Oils" },
    { id:"deliorb",   label:"Deli Orbs" },
    { id:"incubator", label:"Incubators" },
    { id:"beast",     label:"Beasts" },
    { id:"vial",      label:"Vials" },
    { id:"omen",      label:"Omens" },
  ],
};

function isValidMain(id){
  return MAIN_TABS.some(t => t.id === id);
}
function isValidSub(mainId, subId){
  return (SUB_TABS[mainId] || []).some(s => s.id === subId);
}

// ---------- Display rule ----------
// market/loot display in Div if >= (1 Div + 1 Chaos)
function shouldShowDiv(chaosAmount){
  if (!divineChaosValue || divineChaosValue <= 0) return false;
  return Number(chaosAmount || 0) >= (divineChaosValue + 1);
}

function setDualPriceDisplay(valueEl, iconEl, chaosAmount){
  const c = Number(chaosAmount || 0);

  if (shouldShowDiv(c) && divineIcon && divineChaosValue){
    valueEl.textContent = fmtInt(c / divineChaosValue);
    if (iconEl) iconEl.src = divineIcon;
  } else {
    valueEl.textContent = fmtInt(c);
    if (iconEl) iconEl.src = chaosIcon || "";
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

// ---------- League helpers ----------
function pricesUrlForLeague(league){
  return `./data/prices-${league}.json?ts=${Date.now()}`;
}
function pricesUrlFallback(){
  return `./data/prices.json?ts=${Date.now()}`;
}

async function fetchPricesJson(){
  const primary = pricesUrlForLeague(activeLeague);

  try{
    setStatus(`Status: loading ${primary} ...`);
    const res = await fetch(primary, { cache:"no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { data: await res.json(), used: primary, fallback: false };
  }catch(err){
    const fb = pricesUrlFallback();
    setStatus(`Status: league file missing -> fallback ${fb} ...`);
    const res2 = await fetch(fb, { cache:"no-store" });
    if (!res2.ok) throw new Error(`Fallback failed HTTP ${res2.status}`);
    return { data: await res2.json(), used: fb, fallback: true };
  }
}

function initLeagueDropdown(){
  const sel = document.getElementById("leagueSelect");
  if (!sel) return;

  // restore from saved state if possible
  const raw = localStorage.getItem("poe1FarmState");
  if (raw){
    try{
      const s = JSON.parse(raw);
      if (s.league && LEAGUES.includes(s.league)) activeLeague = s.league;
    }catch{}
  }

  // ensure option exists
  if (![...sel.options].some(o => o.value === activeLeague)){
    activeLeague = "Standard";
  }
  sel.value = activeLeague;

  sel.addEventListener("change", async () => {
    const v = sel.value;
    activeLeague = LEAGUES.includes(v) ? v : "Standard";
    saveState();
    await loadData(); // reload market based on league
  });
}

// ---------- Load local data ----------
async function loadData(){
  try{
    const { data, used, fallback } = await fetchPricesJson();

    const lines = Array.isArray(data.lines) ? data.lines : [];

    // IMPORTANT: your design loads ONLY current sub-section items
    const selectedSectionId = activeSection;

    allItems = lines
      .filter(x => (x.section || "") === selectedSectionId)
      .map(x => ({
        section: x.section || selectedSectionId,
        name: cleanName(x.name),
        icon: x.icon || "",
        amount: Number(x.amount ?? 0), // ✅ amount in Chaos
        unit: x.unit || "Chaos Orb",
        unitIcon: x.unitIcon || data.baseIcon || "",
      }));

    byName = new Map(allItems.map(it => [it.name.toLowerCase(), it]));

    // base icon
    chaosIcon = data.baseIcon || "";

    // divine (support BOTH schemas just in case)
    // schema A: data.divine.chaosValue + data.divine.icon
    if (data?.divine?.chaosValue){
      divineIcon = data?.divine?.icon || "";
      divineChaosValue = Number(data?.divine?.chaosValue ?? 0) || null;
    } else {
      // schema B: divine row in lines (Divine Orb)
      const divRow = lines.find(x => String(x.name || "").trim().toLowerCase() === "divine orb");
      divineIcon = divRow?.icon || "";
      // if div row amount exists and it's in chaos, amount = chaos value for 1 div
      divineChaosValue = divRow ? Number(divRow.amount ?? 0) : null;
    }

    const updatedAt = data.updatedAt || "";
    const updatedStr = updatedAt ? ` | updated=${fmtDateTime(updatedAt)}` : "";
    const divStr = divineChaosValue ? ` | 1 Div=${fmtInt(divineChaosValue)} Chaos` : " | 1 Div=?";

    setStatus(
      `Status: OK ✅ league=${activeLeague} main=${activeMain} section=${activeSection} items=${allItems.length}` +
      `${divStr}${updatedStr} | file=${used}${fallback ? " (fallback)" : ""}`
    );

    fillDatalist();
    renderMarket();

    // refresh loot display (re-apply icons/prices)
    document.querySelectorAll("#lootBody tr").forEach(tr => {
      if (tr.classList.contains("manualRow")) return;
      const itemInput = tr.querySelector(".lootItem");
      if (itemInput) itemInput.dispatchEvent(new Event("input"));
    });

    syncCostFields();
    recalcAll();
  }catch(e){
    console.error(e);
    setStatus("Status: ERROR ❌ " + e.toString());
  }
}

// ---------- Tabs UI ----------
function buildMainTabs(){
  const wrap = document.getElementById("mainTabs");
  if (!wrap) return;

  wrap.innerHTML = "";
  MAIN_TABS.forEach(t => {
    const b = document.createElement("button");
    b.className = "tab" + (t.id === activeMain ? " active" : "");
    b.textContent = t.label;
    b.dataset.tab = t.id;

    b.addEventListener("click", () => {
      activeMain = t.id;
      // default sub
      activeSection = SUB_TABS[activeMain]?.[0]?.id || "currency";

      document.querySelectorAll("#mainTabs .tab").forEach(x =>
        x.classList.toggle("active", x.dataset.tab === activeMain)
      );

      buildSubTabs();
      saveState();
      loadData();
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
    b.className = "tab" + (sec.id === activeSection ? " active" : "");
    b.textContent = sec.label;
    b.dataset.tab = sec.id;

    b.addEventListener("click", () => {
      activeSection = sec.id;
      document.querySelectorAll("#subTabs .tab").forEach(x =>
        x.classList.toggle("active", x.dataset.tab === activeSection)
      );
      saveState();
      loadData();
    });

    wrap.appendChild(b);
  });
}

// ---------- Market list ----------
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

// ---------- Loot rows ----------
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

// ---------- Cost syncing ----------
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

// ---------- CSV ----------
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
  a.download = `poe1_loot_${activeLeague}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

// ---------- State ----------
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
    league: activeLeague,
    activeMain,
    activeSection,
    search: document.getElementById("marketSearch")?.value ?? "",
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

    if (s.league && LEAGUES.includes(s.league)) activeLeague = s.league;

    if (s.activeMain && isValidMain(s.activeMain)) activeMain = s.activeMain;
    if (s.activeSection && isValidSub(activeMain, s.activeSection)) activeSection = s.activeSection;

    if (document.getElementById("marketSearch")) document.getElementById("marketSearch").value = s.search ?? "";

    if (document.getElementById("maps")) document.getElementById("maps").value = s.maps ?? "10";
    if (document.getElementById("costPerMap")) document.getElementById("costPerMap").value = s.costPerMap ?? "0";
    if (document.getElementById("costPerMapDiv")) document.getElementById("costPerMapDiv").value = s.costPerMapDiv ?? "0";
    if (s.lastEditedCost) lastEditedCost = s.lastEditedCost;
    if (s.totalsUnit) totalsUnit = s.totalsUnit;

    const btn = document.getElementById("displayUnitBtn");
    if (btn) btn.textContent = (totalsUnit === "chaos") ? "Show Div" : "Show Chaos";

    // rebuild tabs to match restored state
    buildMainTabs();
    document.querySelectorAll("#mainTabs .tab").forEach(x => x.classList.toggle("active", x.dataset.tab === activeMain));
    buildSubTabs();
    document.querySelectorAll("#subTabs .tab").forEach(x => x.classList.toggle("active", x.dataset.tab === activeSection));

    // restore loot rows
    const body = document.getElementById("lootBody");
    if (body) body.innerHTML = "";

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
  activeSection = "currency";
  document.getElementById("marketSearch").value = "";

  buildMainTabs();
  buildSubTabs();

  saveState();
  recalcAll();
  setStatus("Status: reset ✅");
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  initLeagueDropdown();

  document.getElementById("marketSearch")?.addEventListener("input", () => { renderMarket(); saveState(); });

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

  buildMainTabs();
  buildSubTabs();
  loadState();

  // sync dropdown display after state load
  const sel = document.getElementById("leagueSelect");
  if (sel) sel.value = activeLeague;

  if (!document.querySelector("#lootBody tr")) addLootRow();

  loadData();
});

// expose
window.addLootRow = addLootRow;
window.addManualRow = addManualRow;
window.resetAll = resetAll;
