/* =========================================================
   KT PoE1 Market (poe.ninja API)
   - Uses poe.ninja currencyoverview/itemoverview endpoints :contentReference[oaicite:2]{index=2}
   - Base currency = Chaos
   - Display switch Chaos/Divine + auto-divine if >= 1 divine
   ========================================================= */

const $ = (id) => document.getElementById(id);

const state = {
  league: localStorage.getItem("poe1_league") || "Standard",
  displayMode: localStorage.getItem("poe1_display_mode") || "chaos", // "chaos" | "divine"
  activeKey: null, // selected submenu key
  divineChaos: null,
  currentItems: [],
};

/** 4 main menus + sub menus */
const MENU = [
  {
    group: "General Currency",
    items: [
      { key: "cur_currency", label: "Currency", endpoint: { kind: "currency", type: "Currency" } },
      { key: "cur_fragment", label: "Fragments", endpoint: { kind: "currency", type: "Fragment" } },
      { key: "it_scarab", label: "Scarabs", endpoint: { kind: "item", type: "Scarab" } },
      { key: "it_divcard", label: "Divination Cards", endpoint: { kind: "item", type: "DivinationCard" } },
    ],
  },
  {
    group: "Equipment & Gems",
    items: [
      { key: "it_skillgem", label: "Skill Gems", endpoint: { kind: "item", type: "SkillGem" } },
      { key: "it_basetype", label: "Base Types", endpoint: { kind: "item", type: "BaseType" } },
      { key: "it_uweapon", label: "Unique Weapons", endpoint: { kind: "item", type: "UniqueWeapon" } },
      { key: "it_uarmour", label: "Unique Armours", endpoint: { kind: "item", type: "UniqueArmour" } },
      { key: "it_uaccess", label: "Unique Accessories", endpoint: { kind: "item", type: "UniqueAccessory" } },
      { key: "it_ujewel", label: "Unique Jewels", endpoint: { kind: "item", type: "UniqueJewel" } },
      { key: "it_cluster", label: "Cluster Jewels", endpoint: { kind: "item", type: "ClusterJewel" } },
      { key: "it_uflask", label: "Unique Flasks", endpoint: { kind: "item", type: "UniqueFlask" } },
    ],
  },
  {
    group: "Atlas",
    items: [
      { key: "it_map", label: "Maps", endpoint: { kind: "item", type: "Map" } },
      { key: "it_umap", label: "Unique Maps", endpoint: { kind: "item", type: "UniqueMap" } },
      { key: "it_memory", label: "Memories", endpoint: { kind: "item", type: "Memory" } },
      { key: "it_invite", label: "Invitations", endpoint: { kind: "item", type: "Invitation" } },
      { key: "it_blight", label: "Blighted Maps", endpoint: { kind: "item", type: "BlightedMap" } },
      { key: "it_brav", label: "Blight Ravaged Maps", endpoint: { kind: "item", type: "BlightRavagedMap" } },
    ],
  },
  {
    group: "Crafting",
    items: [
      { key: "it_essence", label: "Essences", endpoint: { kind: "item", type: "Essence" } },
      { key: "it_fossil", label: "Fossils", endpoint: { kind: "item", type: "Fossil" } },
      { key: "it_resonator", label: "Resonators", endpoint: { kind: "item", type: "Resonator" } },
      { key: "it_oil", label: "Oils", endpoint: { kind: "item", type: "Oil" } },
      { key: "it_deliorb", label: "Delirium Orbs", endpoint: { kind: "item", type: "DeliriumOrb" } },
      { key: "it_incubator", label: "Incubators", endpoint: { kind: "item", type: "Incubator" } },
      { key: "it_beast", label: "Beasts", endpoint: { kind: "item", type: "Beast" } },
      { key: "it_vial", label: "Vials", endpoint: { kind: "item", type: "Vial" } },
      { key: "it_omen", label: "Omens", endpoint: { kind: "item", type: "Omen" } },
    ],
  },
];

function setStatus(msg) {
  $("statusLabel").textContent = msg;
}

function setSelectedLabel(txt) {
  $("selectedLabel").textContent = txt || "—";
}

function normalizeLeagueName(input) {
  const v = (input || "").trim();
  return v.length ? v : "Standard";
}

/** poe.ninja endpoints: currencyoverview & itemoverview :contentReference[oaicite:3]{index=3} */
function makePoeNinjaUrl(league, endpoint) {
  const base = "https://poe.ninja/api/data";
  const l = encodeURIComponent(league);
  const t = encodeURIComponent(endpoint.type);

  if (endpoint.kind === "currency") {
    return `${base}/currencyoverview?league=${l}&type=${t}`;
  }
  return `${base}/itemoverview?league=${l}&type=${t}`;
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return await res.json();
}

/** Get Divine Orb chaosEquivalent from Currency overview payload */
async function updateDivineRate() {
  const league = state.league;
  const url = makePoeNinjaUrl(league, { kind: "currency", type: "Currency" });

  const payload = await fetchJSON(url);
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];

  // poe.ninja uses currencyTypeName often; chaosEquivalent is common in many clients :contentReference[oaicite:4]{index=4}
  const divineLine = lines.find(x => (x.currencyTypeName || x.name) === "Divine Orb");
  const divineChaos =
    divineLine?.chaosEquivalent ??
    divineLine?.chaosValue ??
    divineLine?.receive?.value ?? // fallback (some formats vary)
    null;

  state.divineChaos = (typeof divineChaos === "number" && isFinite(divineChaos)) ? divineChaos : null;

  $("divineRateLabel").textContent = state.divineChaos
    ? `${roundSmart(state.divineChaos)} c / 1 div`
    : "—";
}

function roundSmart(n) {
  if (!isFinite(n)) return "—";
  if (n >= 100) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

/** Price formatting with auto-divine if >= 1 divine */
function formatPrice(priceChaos) {
  const divineChaos = state.divineChaos;
  const userMode = state.displayMode; // chaos|divine

  if (!divineChaos || !isFinite(divineChaos)) {
    return { value: Math.round(priceChaos || 0), unit: "c" };
  }

  const shouldAutoDivine = (priceChaos >= divineChaos);

  if (userMode === "divine" || shouldAutoDivine) {
    const div = priceChaos / divineChaos;
    const shown = (div >= 10) ? Math.round(div) : (Math.round(div * 10) / 10);
    return { value: shown, unit: "div" };
  }

  return { value: Math.round(priceChaos), unit: "c" };
}

/** Convert poe.ninja payload to a unified list */
function parseToItems(payload, endpointType) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];

  // Currency overview lines often have currencyTypeName + chaosEquivalent :contentReference[oaicite:5]{index=5}
  // Item overview lines often have name + chaosValue
  return lines.map(x => {
    const name = x.currencyTypeName || x.name || x.baseType || "Unknown";
    const chaos =
      x.chaosEquivalent ??
      x.chaosValue ??
      x.value ?? // fallback
      0;

    const typeLabel =
      endpointType ||
      x.itemType ||
      (x.currencyTypeName ? "Currency" : "Item");

    return {
      name,
      type: typeLabel,
      chaos: (typeof chaos === "number" && isFinite(chaos)) ? chaos : 0,
    };
  });
}

function buildMenu() {
  const root = $("menuRoot");
  root.innerHTML = "";

  for (const group of MENU) {
    const groupEl = document.createElement("div");
    groupEl.className = "menuGroup";

    const header = document.createElement("div");
    header.className = "menuGroup__header";
    header.innerHTML = `
      <div class="menuGroup__title">${escapeHTML(group.group)}</div>
      <div class="menuGroup__chev">▼</div>
    `;

    const itemsWrap = document.createElement("div");
    itemsWrap.className = "menuGroup__items";

    // simple collapse
    let open = true;
    header.addEventListener("click", () => {
      open = !open;
      itemsWrap.style.display = open ? "flex" : "none";
      header.querySelector(".menuGroup__chev").textContent = open ? "▼" : "▶";
    });

    for (const it of group.items) {
      const itemEl = document.createElement("div");
      itemEl.className = "menuItem";
      itemEl.dataset.key = it.key;
      itemEl.innerHTML = `
        <div class="menuItem__label">${escapeHTML(it.label)}</div>
        <div class="menuItem__meta">${escapeHTML(it.endpoint.type)}</div>
      `;
      itemEl.addEventListener("click", () => selectCategory(it));
      itemsWrap.appendChild(itemEl);
    }

    groupEl.appendChild(header);
    groupEl.appendChild(itemsWrap);
    root.appendChild(groupEl);
  }
}

function setActiveMenuItem(key) {
  document.querySelectorAll(".menuItem").forEach(el => {
    el.classList.toggle("is-active", el.dataset.key === key);
  });
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

async function selectCategory(menuItem) {
  state.activeKey = menuItem.key;
  setActiveMenuItem(menuItem.key);

  $("contentTitle").textContent = menuItem.label;
  $("contentSubtitle").textContent = `Type: ${menuItem.endpoint.type} • League: ${state.league}`;
  setSelectedLabel(`${menuItem.label}`);

  await loadCategory(menuItem);
}

async function loadCategory(menuItem) {
  const league = state.league;
  const endpoint = menuItem.endpoint;

  setStatus("Loading...");
  $("rows").innerHTML = "";
  $("countLabel").textContent = "0";

  try {
    // update divine first (for correct rendering)
    await updateDivineRate();

    const url = makePoeNinjaUrl(league, endpoint);
    const payload = await fetchJSON(url);
    const list = parseToItems(payload, endpoint.type);

    state.currentItems = list;
    render();
    setStatus("OK");
  } catch (e) {
    console.error(e);
    setStatus("ERROR");
    $("rows").innerHTML = `
      <tr><td colspan="3">
        <span class="badge">Fetch error</span>
        <div class="muted small" style="margin-top:8px;">${escapeHTML(e.message || String(e))}</div>
      </td></tr>
    `;
  }
}

function render() {
  const q = ($("searchInput").value || "").trim().toLowerCase();
  let rows = state.currentItems;

  if (q.length) {
    rows = rows.filter(x => (x.name || "").toLowerCase().includes(q));
  }

  // sort by chaos desc
  rows = rows.slice().sort((a,b) => (b.chaos||0) - (a.chaos||0));

  $("countLabel").textContent = String(rows.length);

  const tbody = $("rows");
  tbody.innerHTML = "";

  for (const it of rows) {
    const p = formatPrice(it.chaos);
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHTML(it.name)}</td>
      <td><span class="badge">${escapeHTML(it.type)}</span></td>
      <td class="col-price">
        <div class="price">
          <span class="price__value">${escapeHTML(p.value)}</span>
          <span class="price__unit">${escapeHTML(p.unit)}</span>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  }

  // update toggle button text
  $("toggleCurrencyBtn").textContent =
    `Display: ${state.displayMode === "divine" ? "Divine" : "Chaos"}`;
}

function wireUI() {
  $("leagueInput").value = state.league;

  $("leagueInput").addEventListener("change", async () => {
    state.league = normalizeLeagueName($("leagueInput").value);
    localStorage.setItem("poe1_league", state.league);

    // refresh current category if selected
    if (state.activeKey) {
      const found = findMenuItemByKey(state.activeKey);
      if (found) await loadCategory(found);
    } else {
      await updateDivineRate();
      setStatus("OK");
    }
  });

  $("searchInput").addEventListener("input", () => render());

  $("toggleCurrencyBtn").addEventListener("click", () => {
    state.displayMode = (state.displayMode === "chaos") ? "divine" : "chaos";
    localStorage.setItem("poe1_display_mode", state.displayMode);
    render();
  });

  $("refreshBtn").addEventListener("click", async () => {
    if (!state.activeKey) return;
    const found = findMenuItemByKey(state.activeKey);
    if (found) await loadCategory(found);
  });
}

function findMenuItemByKey(key) {
  for (const g of MENU) {
    const found = g.items.find(i => i.key === key);
    if (found) return found;
  }
  return null;
}

async function init() {
  buildMenu();
  wireUI();

  setStatus("Init...");
  try {
    await updateDivineRate();
    setStatus("OK");
  } catch (e) {
    console.error(e);
    setStatus("ERROR");
  }
}

init();
