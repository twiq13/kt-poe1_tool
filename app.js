/* =========================================================
   PoE1 Loot Calculator - League selector in sidebar
   - data/prices-Standard.json
   - data/prices-Keepers.json
   ========================================================= */

const LEAGUES = ["Standard", "Keepers"];
const DEFAULT_LEAGUE = "Standard";

let state = {
  league: DEFAULT_LEAGUE,
  tab: "Maps",
  search: "",
  showDiv: false, // false = chaos display, true = divine display
  divChaosRate: 200, // fallback if JSON doesn't contain divine rate
  marketItems: [], // normalized items
  lootRows: [] // rows objects
};

function $(id){ return document.getElementById(id); }

function setStatus(msg){
  const el = $("status");
  if (el) el.textContent = msg || "";
  console.log("[KT]", msg);
}

/* -----------------------------
   JSON NORMALIZATION
   We try to support multiple possible schemas.
-------------------------------- */

function normalizeItemsFromJson(json){
  // We aim for: { name, category, chaos, div }
  // Attempt multiple patterns.

  // Pattern A: { items: [...] }
  if (json && Array.isArray(json.items)) {
    return json.items.map(it => ({
      name: it.name ?? it.item ?? "Unknown",
      category: it.category ?? it.group ?? it.tab ?? "Misc",
      chaos: Number(it.chaos ?? it.chaosValue ?? it.priceChaos ?? 0),
      div: Number(it.div ?? it.divine ?? it.divineValue ?? it.priceDiv ?? 0),
    }));
  }

  // Pattern B: { categories: { "Maps": [...], ... } }
  if (json && json.categories && typeof json.categories === "object") {
    const out = [];
    for (const [cat, arr] of Object.entries(json.categories)) {
      if (!Array.isArray(arr)) continue;
      for (const it of arr) {
        out.push({
          name: it.name ?? it.item ?? "Unknown",
          category: cat,
          chaos: Number(it.chaos ?? it.chaosValue ?? it.priceChaos ?? 0),
          div: Number(it.div ?? it.divine ?? it.divineValue ?? it.priceDiv ?? 0),
        });
      }
    }
    return out;
  }

  // Pattern C: poe.ninja-like { lines: [...] } (common)
  if (json && Array.isArray(json.lines)) {
    return json.lines.map(it => ({
      name: it.name ?? it.baseType ?? it.currencyTypeName ?? "Unknown",
      category: it.category ?? it.group ?? it.itemType ?? it.mapTier ? "Maps" : "Misc",
      chaos: Number(it.chaosValue ?? it.chaosEquivalent ?? it.chaos ?? 0),
      div: Number(it.divineValue ?? it.divine ?? 0),
    }));
  }

  // Pattern D: unknown object with arrays
  // best effort: flatten arrays found at top-level keys
  if (json && typeof json === "object") {
    const out = [];
    for (const [k, v] of Object.entries(json)) {
      if (!Array.isArray(v)) continue;
      for (const it of v) {
        if (!it || typeof it !== "object") continue;
        out.push({
          name: it.name ?? it.baseType ?? it.currencyTypeName ?? it.item ?? "Unknown",
          category: it.category ?? k,
          chaos: Number(it.chaosValue ?? it.chaosEquivalent ?? it.chaos ?? it.priceChaos ?? 0),
          div: Number(it.divineValue ?? it.divine ?? it.priceDiv ?? 0),
        });
      }
    }
    if (out.length) return out;
  }

  return [];
}

function tryExtractDivRate(json){
  // If your JSON includes divine rate, catch it here.
  // Examples:
  // { divChaosRate: 210 } or { rates: { divine: 210 } }
  const a = Number(json?.divChaosRate);
  if (Number.isFinite(a) && a > 0) return a;

  const b = Number(json?.rates?.divine);
  if (Number.isFinite(b) && b > 0) return b;

  return null;
}

/* -----------------------------
   Data loading
-------------------------------- */

async function loadLeagueData(league){
  const file = `data/prices-${league}.json`;
  setStatus(`Loading ${file} …`);

  const res = await fetch(file, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${file} (${res.status})`);

  const json = await res.json();

  const divRate = tryExtractDivRate(json);
  if (divRate) state.divChaosRate = divRate;

  const items = normalizeItemsFromJson(json);

  // if category is too messy, keep it but we’ll filter by tabs best-effort
  state.marketItems = items;

  setStatus(`Loaded ${items.length} items for ${league}`);
}

/* -----------------------------
   Tabs / Categories
-------------------------------- */

function setActiveTab(tab){
  state.tab = tab;
  $$(".tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  renderMarketList();
}

function $$(sel){ return Array.from(document.querySelectorAll(sel)); }

function categoryMatchesTab(itemCategory, tab){
  const c = (itemCategory || "").toLowerCase();
  const t = (tab || "").toLowerCase();

  // basic mapping
  if (t.includes("maps")) return c.includes("map") || c.includes("atlas") || c.includes("invitation") || c.includes("memory");
  if (t.includes("currency")) return c.includes("currency") || c.includes("fragment") || c.includes("scarab") || c.includes("essence");
  if (t.includes("equipment")) return c.includes("equipment") || c.includes("gem") || c.includes("unique") || c.includes("armour") || c.includes("weapon");
  if (t.includes("atlas")) return c.includes("atlas") || c.includes("sextant") || c.includes("compass");
  if (t.includes("crafting")) return c.includes("craft") || c.includes("essence") || c.includes("fossil");

  // fallback: allow everything
  return true;
}

/* -----------------------------
   Market rendering
-------------------------------- */

function formatPrice(it){
  if (state.showDiv) {
    const div = it.div && it.div > 0 ? it.div : (it.chaos / state.divChaosRate);
    return `${round2(div)} div`;
  }
  return `${round0(it.chaos)} c`;
}

function round0(x){ return Math.round(Number(x) || 0); }
function round2(x){ return Math.round((Number(x) || 0) * 100) / 100; }

function renderMarketList(){
  const list = $("marketList");
  if (!list) return;

  const q = (state.search || "").trim().toLowerCase();
  const tab = state.tab;

  const filtered = state.marketItems
    .filter(it => categoryMatchesTab(it.category, tab))
    .filter(it => !q || (it.name || "").toLowerCase().includes(q))
    .slice(0, 500); // safety

  list.innerHTML = "";

  if (!filtered.length) {
    list.innerHTML = `<div class="hint">No items.</div>`;
    return;
  }

  for (const it of filtered) {
    const row = document.createElement("div");
    row.className = "marketItem";
    row.title = it.name;

    const name = document.createElement("div");
    name.className = "marketItemName";
    name.textContent = it.name;

    const price = document.createElement("div");
    price.className = "marketItemPrice";
    price.textContent = formatPrice(it);

    row.appendChild(name);
    row.appendChild(price);

    row.addEventListener("click", () => addLootRowFromMarket(it));

    list.appendChild(row);
  }
}

/* -----------------------------
   Loot rows
-------------------------------- */

function addLootRowFromMarket(it){
  state.lootRows.push({
    type: "market",
    name: it.name,
    chaos: Number(it.chaos || 0),
    div: Number(it.div || 0),
    qty: 1
  });
  renderLootRows();
  recalcTotals();
}

function addManualRow(){
  state.lootRows.push({
    type: "manual",
    name: "",
    chaos: 0,
    div: 0,
    qty: 1
  });
  renderLootRows();
  recalcTotals();
}

function renderLootRows(){
  const host = $("lootRows");
  if (!host) return;

  host.innerHTML = "";

  state.lootRows.forEach((r, idx) => {
    const row = document.createElement("div");
    row.className = "lootRow";

    // Item
    const itemInput = document.createElement("input");
    itemInput.type = "text";
    itemInput.value = r.name;
    itemInput.placeholder = "Item";
    itemInput.addEventListener("input", () => {
      r.name = itemInput.value;
    });

    // Price (readonly display if market row, editable if manual)
    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.min = "0";

    if (r.type === "market") {
      priceInput.value = state.showDiv
        ? round2((r.div && r.div > 0) ? r.div : (r.chaos / state.divChaosRate))
        : round0(r.chaos);
      priceInput.disabled = true;
    } else {
      // manual: edit in current display currency, but store both
      priceInput.disabled = false;
      priceInput.value = state.showDiv ? round2(r.div || 0) : round0(r.chaos || 0);
      priceInput.addEventListener("input", () => {
        const v = Number(priceInput.value || 0);
        if (state.showDiv) {
          r.div = v;
          r.chaos = v * state.divChaosRate;
        } else {
          r.chaos = v;
          r.div = v / state.divChaosRate;
        }
        recalcTotals();
        renderLootRows(); // refresh totals + per-row total label
      });
    }

    // Qty controls
    const qtyWrap = document.createElement("div");
    qtyWrap.className = "qtyWrap";

    const minus = document.createElement("button");
    minus.className = "qtyBtn";
    minus.textContent = "–";
    minus.addEventListener("click", () => {
      r.qty = Math.max(0, (r.qty || 0) - 1);
      renderLootRows();
      recalcTotals();
    });

    const qty = document.createElement("input");
    qty.type = "number";
    qty.min = "0";
    qty.value = r.qty ?? 0;
    qty.style.width = "70px";
    qty.style.textAlign = "center";
    qty.addEventListener("input", () => {
      r.qty = Math.max(0, Number(qty.value || 0));
      recalcTotals();
      renderLootRows();
    });

    const plus = document.createElement("button");
    plus.className = "qtyBtn";
    plus.textContent = "+";
    plus.addEventListener("click", () => {
      r.qty = (r.qty || 0) + 1;
      renderLootRows();
      recalcTotals();
    });

    qtyWrap.appendChild(minus);
    qtyWrap.appendChild(qty);
    qtyWrap.appendChild(plus);

    // Row total
    const total = document.createElement("div");
    total.className = "right";
    total.textContent = formatRowTotal(r);

    // Delete
    const del = document.createElement("button");
    del.className = "killBtn";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      state.lootRows.splice(idx, 1);
      renderLootRows();
      recalcTotals();
    });

    row.appendChild(itemInput);
    row.appendChild(wrapRight(priceInput));
    row.appendChild(wrapCenter(qtyWrap));
    row.appendChild(total);
    row.appendChild(wrapRight(del));

    host.appendChild(row);
  });
}

function wrapRight(el){
  const d = document.createElement("div");
  d.className = "right";
  d.appendChild(el);
  return d;
}
function wrapCenter(el){
  const d = document.createElement("div");
  d.className = "center";
  d.appendChild(el);
  return d;
}

function formatRowTotal(r){
  const qty = Number(r.qty || 0);
  if (state.showDiv) {
    const div = (r.div && r.div > 0) ? r.div : (r.chaos / state.divChaosRate);
    return `${round2(div * qty)} div`;
  }
  return `${round0((r.chaos || 0) * qty)} c`;
}

/* -----------------------------
   Totals
-------------------------------- */

function recalcTotals(){
  const maps = Number($("totalMaps")?.value || 0);
  const costC = Number($("costPerMapChaos")?.value || 0);
  const costD = Number($("costPerMapDiv")?.value || 0);

  // Invest in chaos baseline
  const investChaos = (maps * costC) + (maps * costD * state.divChaosRate);

  // Loot in chaos baseline
  const lootChaos = state.lootRows.reduce((sum, r) => {
    const qty = Number(r.qty || 0);
    return sum + (Number(r.chaos || 0) * qty);
  }, 0);

  const gainsChaos = lootChaos - investChaos;

  // Display
  if (state.showDiv) {
    $("totalInvest").textContent = `${round2(investChaos / state.divChaosRate)} div`;
    $("totalLoot").textContent = `${round2(lootChaos / state.divChaosRate)} div`;
    $("totalGains").textContent = `${round2(gainsChaos / state.divChaosRate)} div`;
  } else {
    $("totalInvest").textContent = `${round0(investChaos)} c`;
    $("totalLoot").textContent = `${round0(lootChaos)} c`;
    $("totalGains").textContent = `${round0(gainsChaos)} c`;
  }
}

/* -----------------------------
   CSV Export
-------------------------------- */

function exportCSV(){
  // Format requested earlier in your other messages was:
  // Item,Price,Devise,Qty,Total price exalt/divine
  // Invest,Loot,Gains
  // Here we keep simple and consistent with Chaos/Div display.
  const rows = [];
  rows.push(["Item","Price","Currency","Qty","Total"].join(","));

  for (const r of state.lootRows) {
    const qty = Number(r.qty || 0);
    const price = state.showDiv
      ? round2((r.div && r.div > 0) ? r.div : (r.chaos / state.divChaosRate))
      : round0(r.chaos);

    const cur = state.showDiv ? "div" : "chaos";
    const total = state.showDiv ? round2(price * qty) : round0(price * qty);

    rows.push([escapeCSV(r.name), price, cur, qty, total].join(","));
  }

  rows.push("");
  rows.push(["Invest", $("totalInvest").textContent].join(","));
  rows.push(["Loot", $("totalLoot").textContent].join(","));
  rows.push(["Gains", $("totalGains").textContent].join(","));

  const csv = rows.join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `poe1-loot-${state.league}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function escapeCSV(s){
  const v = String(s ?? "");
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replaceAll('"','""')}"`;
  }
  return v;
}

/* -----------------------------
   League switch
-------------------------------- */

async function setLeague(league){
  if (!LEAGUES.includes(league)) league = DEFAULT_LEAGUE;

  state.league = league;
  $("leagueName").textContent = league;

  try {
    await loadLeagueData(league);
    renderMarketList();
  } catch (e) {
    console.error(e);
    setStatus(`ERROR loading league data: ${e.message}`);
    $("marketList").innerHTML = `<div class="hint">Failed to load data/prices-${league}.json</div>`;
  }
}

/* -----------------------------
   Init
-------------------------------- */

function initUI(){
  // tabs
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  // search
  $("marketSearch").addEventListener("input", (e) => {
    state.search = e.target.value || "";
    renderMarketList();
  });

  // league
  const sel = $("leagueSelect");
  sel.value = state.league;
  sel.addEventListener("change", async () => {
    await setLeague(sel.value);
  });

  // actions
  $("addRow").addEventListener("click", () => {
    // add empty row (manual item name), you can also make it add from first search result if you want
    addManualRow();
  });

  $("manualRow").addEventListener("click", () => addManualRow());

  $("exportCsv").addEventListener("click", () => exportCSV());

  $("toggleCurrency").addEventListener("click", () => {
    state.showDiv = !state.showDiv;
    $("toggleCurrency").textContent = state.showDiv ? "Show Chaos" : "Show Div";
    renderMarketList();
    renderLootRows();
    recalcTotals();
  });

  $("resetAll").addEventListener("click", () => {
    state.lootRows = [];
    $("totalMaps").value = 10;
    $("costPerMapChaos").value = 0;
    $("costPerMapDiv").value = 0;
    renderLootRows();
    recalcTotals();
    setStatus("Reset.");
  });

  // invest recalculation
  ["totalMaps","costPerMapChaos","costPerMapDiv"].forEach(id => {
    $(id).addEventListener("input", () => recalcTotals());
  });

  // default tab
  setActiveTab("Maps");
}

(async function boot(){
  initUI();
  recalcTotals();
  await setLeague(state.league);
})();
