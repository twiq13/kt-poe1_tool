// =======================
// PoE1 Loot Calculator (KT_) - Multi-league
// =======================
// Loads local JSON: ./data/prices-<LEAGUE>.json (GitHub Actions)
// Base unit: Chaos
// Auto display: Div if chaos >= (divChaos + 1)
// Totals toggle: Chaos / Div
// Main/Sub menus are built from prices.json.sections (group = main, id = sub)

let rawData = null;

let allItems = [];
let byName = new Map();

// menu from JSON
let menu = {
  mains: [],
  subsByMain: {},
};

let activeMain = "";
let activeSection = "";

// league
let activeLeague = "Standard";

// icons & rate
let chaosIcon = "";
let divineIcon = "";
let divineChaosValue = null;

// cost sync
let lastEditedCost = "chaos";
let isSyncingCost = false;

// totals toggle
let totalsUnit = "chaos";

// ---------- Helpers ----------
function setStatus(msg){
  const el = document.getElementById("fetchStatus");
  if (el) el.textContent = msg;
  console.log(msg);
}

function cleanName(s){
  return String(s || "").replace(/\s*WIKI\s*$/i, "").trim();
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

function num(id){
  const el = document.getElementById(id);
  const v = el ? Number(el.value) : 0;
  return Number.isFinite(v) ? v : 0;
}

function safeFileLeagueName(s){
  return String(s || "Standard").trim().replace(/[^a-z0-9_-]+/gi, "_");
}

// ---------- Display logic ----------
function shouldShowDiv(chaosAmount){
  if (!divineChaosValue || divineChaosValue <= 0) return false;
  return Number(chaosAmount || 0) >= (divineChaosValue + 1);
}

function setDualPriceDisplay(valueEl, iconEl, chaosAmount){
  const c = Number(chaosAmount || 0);

  if (shouldShowDiv(c) && divineChaosValue){
    valueEl.textContent = fmtInt(c / divineChaosValue);
    if (iconEl) iconEl.src = divineIcon || "";
  } else {
    valueEl.textContent = fmtInt(c);
    if (iconEl) iconEl.src = chaosIcon || "";
  }

  if (iconEl){
    iconEl.style.display = iconEl.src ? "block" : "none";
  }
}

function formatTotalSingle(chaosVal){
  const c = Number(chaosVal || 0);

  if (totalsUnit === "div" && divineChaosValue && divineChaosValue > 0){
    const div = c / divineChaosValue;
    const icon = divineIcon ? `<img class="pIcon" src="${divineIcon}" alt="">` : "";
    return `<span>${fmtInt(div)}</span>${icon}`;
  }

  const icon = chaosIcon ? `<img class="pIcon" src="${chaosIcon}" alt="">` : "";
  return `<span>${fmtInt(c)}</span>${icon}`;
}

// ---------- Load local json per league ----------
async function loadPricesJsonForLeague(league){
  const lf = safeFileLeagueName(league);
  const url = `./data/prices-${lf}.json?ts=` + Date.now();
  setStatus("Status: loading " + url + " ...");

  const res = await fetch(url, { cache:"no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  return await res.json();
}

// ---------- Menu build from JSON.sections ----------
function buildMenuFromJson(data){
  const secs = Array.isArray(data.sections) ? data.sections : [];

  const groups = [];
  const subsByMain = {};

  for (const s of secs){
    const group = s.group || "Other";
    if (!groups.includes(group)) groups.push(group);
    subsByMain[group] = subsByMain[group] || [];
    subsByMain[group].push({ id: s.id, label: s.label || s.id });
  }

  // preferred order
  const preferred = ["General Currency", "Equipment & Gems", "Atlas", "Crafting"];
  const ordered = [
    ...preferred.filter(x => groups.includes(x)),
    ...groups.filter(x => !preferred.includes(x))
  ];

  menu.mains = ordered.map(g => ({ id: g, label: g }));
  menu.subsByMain = subsByMain;

  // validate current
  if (!activeMain || !menu.subsByMain[activeMain]) activeMain = menu.mains[0]?.id || preferred[0];
  const subs = menu.subsByMain[activeMain] || [];
  if (!activeSection || !subs.some(x => x.id === activeSection)){
    activeSection = subs[0]?.id || "currency";
  }
}

function renderMainTabs(){
  const wrap = document.getElementById("mainTabs");
  if (!wrap) return;

  wrap.innerHTML = "";
  menu.mains.forEach(t => {
    const b = document.createElement("button");
    b.className = "tab" + (t.id === activeMain ? " active" : "");
    b.textContent = t.label;
    b.dataset.tab = t.id;

    b.addEventListener("click", () => {
      activeMain = t.id;
      activeSection = (menu.subsByMain[activeMain]?.[0]?.id) || "currency";

      document.querySelectorAll("#mainTabs .tab")
        .forEach(x => x.classList.toggle("active", x.dataset.tab === activeMain));

      renderSubTabs();
      saveState();
      refreshItemsForSection();
    });

    wrap.appendChild(b);
  });
}

function renderSubTabs(){
  const wrap = document.getElementById("subTabs");
  if (!wrap) return;

  wrap.innerHTML = "";
  const subs = menu.subsByMain[activeMain] || [];

  subs.forEach(sec => {
    const b = document.createElement("button");
    b.className = "tab" + (sec.id === activeSection ? " active" : "");
    b.textContent = sec.label;
    b.dataset.tab = sec.id;

    b.addEventListener("click", () => {
      activeSection = sec.id;
      document.querySelectorAll("#subTabs .tab")
        .forEach(x => x.classList.toggle("active", x.dataset.tab === activeSection));
      saveState();
      refreshItemsForSection();
    });

    wrap.appendChild(b);
  });
}

// ---------- Items / Market ----------
function refreshItemsForSection(){
  if (!rawData){
    setStatus("Status: ERROR ❌ prices not loaded");
    return;
  }

  const lines = Array.isArray(rawData.lines) ? rawData.lines : [];

  allItems = lines
    .filter(x => (x.section || "") === activeSection)
    .map(x => ({
      section: x.section || activeSection,
      name: cleanName(x.name),
      icon: x.icon || "",
      amount: Number(x.amount ?? 0),
    }));

  byName = new Map(allItems.map(it => [it.name.toLowerCase(), it]));

  fillDatalist();
  renderMarket();

  // refresh existing loot rows (re-apply prices/icons)
  document.querySelectorAll("#lootBody tr").forEach(tr => {
    if (tr.classList.contains("manualRow")) return;
    const itemInput = tr.querySelector(".lootItem");
    if (itemInput) itemInput.dispatchEvent(new Event("input"));
  });

  recalcAll();

  // update league label if you have one
  const leagueLabel = document.getElementById("leagueLabel");
  if (leagueLabel) leagueLabel.textContent = `League: ${rawData.league || activeLeague}`;

  const updatedStr = rawData.updatedAt ? ` | updated=${fmtDateTime(rawData.updatedAt)}` : "";
  const divStr = divineChaosValue ? ` | 1 Div=${fmtInt(divineChaosValue)} Chaos` : "";
  setStatus(`Status: OK ✅ league=${rawData.league || activeLeague} main="${activeMain}" section="${activeSection}" items=${allItems.length}${divStr}${updatedStr}`);
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

function renderMarket(){
  const list = document.getElementById("marketList");
  if (!list) return;

  const q = (document.getElementById("marketSearch")?.value || "").trim().toLowerCase();

  const filtered = allItems
    .filter(it => it.name.toLowerCase().includes(q))
    .slice(0, 500);

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
        <img class="baseIcon" alt="">
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

  const baseImg = tr.querySelector(".baseIcon");
  if (baseImg){
    baseImg.src = chaosIcon || "";
    baseImg.style.display = baseImg.src ? "inline-block" : "none";
  }

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

    lines.push([esc(item), displayPrice, devise, fmtInt(qty), esc(toBoth(totalC))].join(","));
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
  if (!raw) return null;
  try{ return JSON.parse(raw); }catch{ return null; }
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

  document.getElementById("marketSearch").value = "";
  recalcAll();
  setStatus("Status: reset ✅");
}

// ---------- Boot / League switch ----------
async function loadLeague(league){
  activeLeague = league || "Standard";

  const sel = document.getElementById("leagueSelect");
  if (sel) sel.value = activeLeague;

  rawData = await loadPricesJsonForLeague(activeLeague);

  chaosIcon = rawData.baseIcon || "";
  divineIcon = rawData?.divine?.icon || "";
  divineChaosValue = Number(rawData?.divine?.chaosValue ?? 0) || null;

  buildMenuFromJson(rawData);
  renderMainTabs();
  renderSubTabs();

  // update label in panel title if present
  const leagueLabel = document.getElementById("leagueLabel");
  if (leagueLabel) leagueLabel.textContent = `League: ${rawData.league || activeLeague}`;

  refreshItemsForSection();
  syncCostFields();
  recalcAll();
  saveState();
}

async function boot(){
  try{
    const saved = loadState() || {};
    const initialLeague = saved.league || document.getElementById("leagueSelect")?.value || "Standard";
    activeMain = saved.activeMain || "";
    activeSection = saved.activeSection || "";

    // restore input fields
    if (document.getElementById("marketSearch")) document.getElementById("marketSearch").value = saved.search ?? "";
    if (document.getElementById("maps")) document.getElementById("maps").value = saved.maps ?? "10";
    if (document.getElementById("costPerMap")) document.getElementById("costPerMap").value = saved.costPerMap ?? "0";
    if (document.getElementById("costPerMapDiv")) document.getElementById("costPerMapDiv").value = saved.costPerMapDiv ?? "0";
    if (saved.lastEditedCost) lastEditedCost = saved.lastEditedCost;
    if (saved.totalsUnit) totalsUnit = saved.totalsUnit;

    const btn = document.getElementById("displayUnitBtn");
    if (btn) btn.textContent = (totalsUnit === "chaos") ? "Show Div" : "Show Chaos";

    // restore loot rows
    const body = document.getElementById("lootBody");
    if (body) body.innerHTML = "";
    if (Array.isArray(saved.rows) && saved.rows.length){
      saved.rows.forEach(r => {
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
    } else {
      addLootRow();
    }

    await loadLeague(initialLeague);
  }catch(e){
    console.error(e);
    setStatus("Status: ERROR ❌ " + e.toString());
  }
}

document.addEventListener("DOMContentLoaded", () => {
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

  document.getElementById("leagueSelect")?.addEventListener("change", async (e) => {
    try{
      await loadLeague(e.target.value || "Standard");
    }catch(err){
      setStatus("Status: ERROR ❌ " + err.toString());
    }
  });

  boot();
});

// expose
window.addLootRow = addLootRow;
window.addManualRow = addManualRow;
window.resetAll = resetAll;
