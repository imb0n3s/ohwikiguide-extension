(function () {
  // >>> Extension backend URL (no trailing slash) <<<
  const API = "https://ohwikiguide-extension-production.up.railway.app";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CREDIT = `<div class="credit">Data from the OHWikiGuide community wiki</div>`;

  // Video component / mobile views get a slightly tighter layout
  if (/component|mobile/.test(location.pathname)) document.body.classList.add("compact");

  // ----- tabs -----
  const onTabOpen = {};
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll("body > section.view").forEach((v) => v.classList.toggle("active", v.id === "tab-" + btn.dataset.tab));
      if (onTabOpen[btn.dataset.tab]) onTabOpen[btn.dataset.tab]();
    });
  });

  async function getJSON(path) {
    const r = await fetch(`${API}${path}`);
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }

  // =====================================================================
  // Deviation tab
  // =====================================================================
  (function deviationTab() {
    let all = [], query = "", cat = "";
    const detailCache = new Map();
    const listEl = $("#dev-list"), listView = $("#dev-list-view"), detailView = $("#dev-detail-view"), detailEl = $("#dev-detail");
    const showList = () => { detailView.classList.remove("active"); listView.classList.add("active"); };
    const showDetail = () => { listView.classList.remove("active"); detailView.classList.add("active"); detailEl.scrollTop = 0; };

    function renderList() {
      const q = query.trim().toLowerCase();
      const rows = all.filter((d) => (!cat || d.categories.includes(cat)) && (!q || d.name.toLowerCase().includes(q) || (d.function || "").toLowerCase().includes(q)));
      if (!rows.length) { listEl.innerHTML = `<div class="status">No deviations match “${esc(query)}”.</div>`; return; }
      listEl.innerHTML = rows.map((d) => `
        <button class="row" data-id="${esc(d.id)}">
          ${d.image ? `<img class="thumb" src="${esc(d.image)}" alt="" loading="lazy">` : `<div class="thumb"></div>`}
          <div class="txt">
            <div class="name">${esc(d.name)}${d.categories[0] ? `<span class="cat">${esc(d.categories[0])}</span>` : ""}</div>
            <div class="sub">${esc(d.function)}</div>
          </div>
          <span class="chev">&rsaquo;</span>
        </button>`).join("");
    }

    function renderDetail(d) {
      const fields = d.fields.map((f) => `<div class="dv-field">${f.label ? `<span class="k">${esc(f.label)}:</span> ` : ""}${esc(f.value)}</div>`).join("");
      const sections = d.sections.map((s) => `
        <div class="dv-section">
          <div class="dv-sec-title">${esc(s.label)}</div>
          ${s.rows.map((r) => r.k != null ? `<div class="dv-row"><span class="k">${esc(r.k)}:</span> ${esc(r.v)}</div>` : `<div class="dv-row">${esc(r.text)}</div>`).join("")}
        </div>`).join("");
      detailEl.innerHTML = `
        <div class="dv-card">
          <div class="dv-top">
            ${d.image ? `<div class="dv-imgbox"><img src="${esc(d.image)}" alt="${esc(d.name)}"></div>` : ""}
            <div class="dv-head">
              <span class="dv-tag">${esc((d.categories || []).join(" · ") || "DEVIATION")}</span>
              <div class="dv-title">${esc(d.name)}</div>
              ${d.function ? `<div class="dv-func">${esc(d.function)}</div>` : ""}
            </div>
          </div>
          ${fields ? `<div class="dv-fields">${fields}</div>` : ""}
          ${sections}
          ${CREDIT}
        </div>`;
    }

    async function openDetail(id) {
      showDetail();
      if (detailCache.has(id)) return renderDetail(detailCache.get(id));
      detailEl.innerHTML = `<div class="status">Loading…</div>`;
      try { const d = await getJSON(`/api/deviations/${encodeURIComponent(id)}`); detailCache.set(id, d); renderDetail(d); }
      catch (e) { detailEl.innerHTML = `<div class="status">Couldn't load this deviation.<br><button data-retry="${esc(id)}">Retry</button></div>`; }
    }
    async function loadList() {
      listEl.innerHTML = `<div class="status">Loading deviations…</div>`;
      try { all = (await getJSON("/api/deviations")).items || []; renderList(); }
      catch (e) { listEl.innerHTML = `<div class="status">Couldn't reach the wiki right now.<br><button data-retry="">Retry</button></div>`; }
    }

    $("#dev-search").addEventListener("input", (e) => { query = e.target.value; renderList(); });
    $("#dev-chips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      cat = b.dataset.cat;
      document.querySelectorAll("#dev-chips .chip").forEach((c) => c.classList.toggle("active", c === b));
      renderList();
    });
    listEl.addEventListener("click", (e) => {
      const retry = e.target.closest("[data-retry]"); if (retry) return loadList();
      const row = e.target.closest(".row"); if (row) openDetail(row.dataset.id);
    });
    detailEl.addEventListener("click", (e) => { const retry = e.target.closest("[data-retry]"); if (retry) openDetail(retry.dataset.retry); });
    $("#dev-back").addEventListener("click", showList);
    loadList();
  })();

  // =====================================================================
  // Card tabs: Settlements / Silos / Monolith (scenario chips -> list -> card)
  // =====================================================================
  document.querySelectorAll("section[data-cards]").forEach((section) => {
    const key = section.dataset.cards;       // API path + tab name
    const label = section.dataset.label;     // "settlements" / "silos" / "monoliths"
    const wide = section.dataset.thumb === "wide";
    section.innerHTML = `
      <div class="view active" data-role="list-view">
        <div class="toolbar">
          <div class="chips" data-role="chips">
            <button class="chip active" data-scenario="Manibus">Manibus</button>
            <button class="chip" data-scenario="Way of Winter">Way of Winter</button>
            <button class="chip" data-scenario="Isles of Abyss">Isles of Abyss</button>
          </div>
        </div>
        <div class="scroll" data-role="list"><div class="status">Loading ${esc(label)}…</div></div>
      </div>
      <div class="view" data-role="detail-view">
        <button class="back" data-role="back">&larr; All ${esc(label)}</button>
        <div class="scroll" data-role="detail"></div>
      </div>`;
    const listView = $('[data-role="list-view"]', section), detailView = $('[data-role="detail-view"]', section);
    const listEl = $('[data-role="list"]', section), detailEl = $('[data-role="detail"]', section), chips = $('[data-role="chips"]', section);
    let scenarios = null, scenario = "Manibus";
    const cache = new Map();
    const showList = () => { detailView.classList.remove("active"); listView.classList.add("active"); };
    const showDetail = () => { listView.classList.remove("active"); detailView.classList.add("active"); detailEl.scrollTop = 0; };

    function renderList() {
      if (!scenarios) return;
      const sc = scenarios.find((s) => s.name === scenario);
      if (!sc || !sc.items.length) { listEl.innerHTML = `<div class="status">${esc((sc && sc.note) || "Nothing added yet.")}</div>`; return; }
      listEl.innerHTML = sc.items.map((s) => `
        <button class="row" data-id="${esc(s.id)}">
          ${s.thumb ? `<img class="thumb${wide ? " wide" : ""}" src="${esc(s.thumb)}" alt="" loading="lazy">` : `<div class="thumb${wide ? " wide" : ""}"></div>`}
          <div class="txt">
            <div class="name">${esc(s.name)}</div>
            <div class="sub">${esc(s.sub || [s.zone, s.location].filter(Boolean).join(" · "))}</div>
          </div>
          <span class="chev">&rsaquo;</span>
        </button>`).join("");
    }

    function renderDetail(d) {
      const fields = (d.fields || []).map((f) => `<div class="dv-field"><span class="k">${esc(f.label)}:</span> ${esc(f.value)}</div>`).join("");
      const sections = (d.sections || []).map((s) => `
        <div class="dv-section">
          <div class="dv-sec-title">${esc(s.label)}</div>
          ${s.items.map((t) => `<div class="dv-row"><span class="dot"></span>${esc(t)}</div>`).join("")}
        </div>`).join("");
      const head = wide
        ? `${d.image ? `<img class="dv-map" src="${esc(d.image)}" alt="${esc(d.name)} map">` : ""}<span class="dv-tag">${esc(d.scenario || "")}</span><div class="dv-title">${esc(d.name)}</div>`
        : `<div class="dv-top">${d.image ? `<div class="dv-imgbox"><img src="${esc(d.image)}" alt="${esc(d.name)}"></div>` : ""}<div class="dv-head"><span class="dv-tag">${esc(d.scenario || "")}</span><div class="dv-title">${esc(d.name)}</div></div></div>`;
      detailEl.innerHTML = `<div class="dv-card">${head}${fields ? `<div class="dv-fields">${fields}</div>` : ""}${sections || `<div class="dv-section"><div class="dv-row">No details recorded yet.</div></div>`}${CREDIT}</div>`;
    }

    async function openDetail(id) {
      showDetail();
      if (cache.has(id)) return renderDetail(cache.get(id));
      detailEl.innerHTML = `<div class="status">Loading…</div>`;
      try { const d = await getJSON(`/api/${key}/${encodeURIComponent(id)}`); cache.set(id, d); renderDetail(d); }
      catch (e) { detailEl.innerHTML = `<div class="status">Couldn't load this.<br><button data-retry="${esc(id)}">Retry</button></div>`; }
    }
    async function load() {
      listEl.innerHTML = `<div class="status">Loading ${esc(label)}…</div>`;
      try { scenarios = (await getJSON(`/api/${key}`)).scenarios || []; renderList(); }
      catch (e) { scenarios = null; listEl.innerHTML = `<div class="status">Couldn't reach the wiki right now.<br><button data-retry="">Retry</button></div>`; }
    }

    chips.addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      scenario = b.dataset.scenario;
      chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === b));
      renderList();
    });
    listEl.addEventListener("click", (e) => {
      const retry = e.target.closest("[data-retry]"); if (retry) return load();
      const row = e.target.closest(".row"); if (row) openDetail(row.dataset.id);
    });
    detailEl.addEventListener("click", (e) => { const retry = e.target.closest("[data-retry]"); if (retry) openDetail(retry.dataset.retry); });
    $('[data-role="back"]', section).addEventListener("click", showList);
    onTabOpen[key] = () => { if (!scenarios) load(); };
  });

  // =====================================================================
  // Tech Bench tab (search + category -> item -> materials per Tech Level)
  // =====================================================================
  (function techBenchTab() {
    let all = null, query = "", cat = "";
    const cache = new Map();
    const listEl = $("#tb-list"), listView = $("#tb-list-view"), detailView = $("#tb-detail-view"), detailEl = $("#tb-detail");
    const showList = () => { detailView.classList.remove("active"); listView.classList.add("active"); };
    const showDetail = () => { listView.classList.remove("active"); detailView.classList.add("active"); detailEl.scrollTop = 0; };

    function renderList() {
      if (!all) return;
      const q = query.trim().toLowerCase();
      const rows = all.filter((d) => (!cat || d.category === cat) && (!q || d.name.toLowerCase().includes(q)));
      if (!rows.length) { listEl.innerHTML = `<div class="status">No items match “${esc(query)}”.</div>`; return; }
      listEl.innerHTML = rows.map((d) => `
        <button class="row" data-id="${esc(d.id)}">
          <div class="txt">
            <div class="name">${esc(d.name)}<span class="cat">${esc(d.category)}</span></div>
            <div class="sub">${d.levels} tech level${d.levels === 1 ? "" : "s"}${d.first ? ` · from ${esc(d.first)}` : ""}</div>
          </div>
          <span class="chev">&rsaquo;</span>
        </button>`).join("");
    }
    function renderDetail(d) {
      const levels = (d.levels || []).map((l) => `
        <div class="dv-section">
          <div class="dv-sec-title">${esc(l.label || "Materials")}</div>
          ${l.materials.map((m) => `<div class="dv-row"><span class="dot"></span>${esc(m)}</div>`).join("")}
        </div>`).join("");
      detailEl.innerHTML = `<div class="dv-card"><span class="dv-tag">${esc(d.category)} · Technological Bench</span><div class="dv-title">${esc(d.name)}</div>${levels || `<div class="dv-section"><div class="dv-row">No materials listed.</div></div>`}${CREDIT}</div>`;
    }
    async function openDetail(id) {
      showDetail();
      if (cache.has(id)) return renderDetail(cache.get(id));
      detailEl.innerHTML = `<div class="status">Loading…</div>`;
      try { const d = await getJSON(`/api/techbench/${encodeURIComponent(id)}`); cache.set(id, d); renderDetail(d); }
      catch (e) { detailEl.innerHTML = `<div class="status">Couldn't load this item.<br><button data-retry="${esc(id)}">Retry</button></div>`; }
    }
    async function load() {
      listEl.innerHTML = `<div class="status">Loading Tech Bench…</div>`;
      try { all = (await getJSON("/api/techbench")).items || []; renderList(); }
      catch (e) { all = null; listEl.innerHTML = `<div class="status">Couldn't reach the wiki right now.<br><button data-retry="">Retry</button></div>`; }
    }
    $("#tb-search").addEventListener("input", (e) => { query = e.target.value; renderList(); });
    $("#tb-chips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      cat = b.dataset.cat;
      document.querySelectorAll("#tb-chips .chip").forEach((c) => c.classList.toggle("active", c === b));
      renderList();
    });
    listEl.addEventListener("click", (e) => {
      const retry = e.target.closest("[data-retry]"); if (retry) return load();
      const row = e.target.closest(".row"); if (row) openDetail(row.dataset.id);
    });
    detailEl.addEventListener("click", (e) => { const retry = e.target.closest("[data-retry]"); if (retry) openDetail(retry.dataset.retry); });
    $("#tb-back").addEventListener("click", showList);
    onTabOpen.techbench = () => { if (!all) load(); };
  })();

  if (window.Twitch && Twitch.ext) {
    Twitch.ext.onContext(() => {});
    Twitch.ext.onError((e) => console.error("twitch ext error", e));
  }
})();
