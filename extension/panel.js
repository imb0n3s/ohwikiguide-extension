(function () {
  // >>> Set this to your extension backend URL once it is deployed (no trailing slash) <<<
  const API = "https://ohwikiguide-extension-production.up.railway.app";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ----- tabs -----
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll("body > section.view").forEach((v) => v.classList.toggle("active", v.id === "tab-" + btn.dataset.tab));
    });
  });

  // ----- Deviation tab -----
  let all = [];
  let query = "";
  let cat = "";
  const detailCache = new Map();

  const listEl = $("#dev-list");
  const listView = $("#dev-list-view");
  const detailView = $("#dev-detail-view");
  const detailEl = $("#dev-detail");

  function showList() { detailView.classList.remove("active"); listView.classList.add("active"); }
  function showDetail() { listView.classList.remove("active"); detailView.classList.add("active"); detailEl.scrollTop = 0; }

  function renderList() {
    const q = query.trim().toLowerCase();
    const rows = all.filter((d) =>
      (!cat || d.categories.includes(cat)) &&
      (!q || d.name.toLowerCase().includes(q) || (d.function || "").toLowerCase().includes(q))
    );
    if (!rows.length) {
      listEl.innerHTML = `<div class="status">No deviations match “${esc(query)}”.</div>`;
      return;
    }
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
        ${s.rows.map((r) => r.k != null
          ? `<div class="dv-row"><span class="k">${esc(r.k)}:</span> ${esc(r.v)}</div>`
          : `<div class="dv-row">${esc(r.text)}</div>`).join("")}
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
        <a class="dv-link" href="${esc(d.url)}" target="_blank" rel="noopener">Open on ohwikiguide.com &nearr;</a>
      </div>`;
  }

  async function openDetail(id) {
    showDetail();
    if (detailCache.has(id)) return renderDetail(detailCache.get(id));
    detailEl.innerHTML = `<div class="status">Loading…</div>`;
    try {
      const r = await fetch(`${API}/api/deviations/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      detailCache.set(id, d);
      renderDetail(d);
    } catch (e) {
      detailEl.innerHTML = `<div class="status">Couldn't load this deviation.<br><button data-retry="${esc(id)}">Retry</button></div>`;
    }
  }

  async function loadList() {
    listEl.innerHTML = `<div class="status">Loading deviations…</div>`;
    try {
      const r = await fetch(`${API}/api/deviations`);
      if (!r.ok) throw new Error(r.status);
      all = (await r.json()).items || [];
      renderList();
    } catch (e) {
      listEl.innerHTML = `<div class="status">Couldn't reach the wiki right now.<br><button data-retry="">Retry</button></div>`;
    }
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
  detailEl.addEventListener("click", (e) => {
    const retry = e.target.closest("[data-retry]"); if (retry) openDetail(retry.dataset.retry);
  });
  $("#dev-back").addEventListener("click", showList);

  // ----- Settlements tab -----
  let scenarios = null;          // [{ name, items:[...], note }]
  let scenario = "Manibus";
  const setDetailCache = new Map();
  const setListEl = $("#set-list");
  const setListView = $("#set-list-view");
  const setDetailView = $("#set-detail-view");
  const setDetailEl = $("#set-detail");

  function setShowList() { setDetailView.classList.remove("active"); setListView.classList.add("active"); }
  function setShowDetail() { setListView.classList.remove("active"); setDetailView.classList.add("active"); setDetailEl.scrollTop = 0; }

  function renderSettlements() {
    if (!scenarios) return;
    const sc = scenarios.find((s) => s.name === scenario);
    if (!sc || !sc.items.length) {
      setListEl.innerHTML = `<div class="status">${esc((sc && sc.note) || "No settlements added yet.")}</div>`;
      return;
    }
    setListEl.innerHTML = sc.items.map((s) => `
      <button class="row" data-id="${esc(s.id)}">
        ${s.thumb ? `<img class="thumb wide" src="${esc(s.thumb)}" alt="" loading="lazy">` : `<div class="thumb wide"></div>`}
        <div class="txt">
          <div class="name">${esc(s.name)}</div>
          <div class="sub">${esc([s.zone, s.location].filter(Boolean).join(" · "))}</div>
        </div>
        <span class="chev">&rsaquo;</span>
      </button>`).join("");
  }

  function renderSettlement(d) {
    const fields = (d.fields || []).map((f) => `<div class="dv-field"><span class="k">${esc(f.label)}:</span> ${esc(f.value)}</div>`).join("");
    const sections = (d.sections || []).map((s) => `
      <div class="dv-section">
        <div class="dv-sec-title">${esc(s.label)}</div>
        ${s.items.map((t) => `<div class="dv-row"><span class="dot"></span>${esc(t)}</div>`).join("")}
      </div>`).join("");
    setDetailEl.innerHTML = `
      <div class="dv-card">
        ${d.image ? `<img class="dv-map" src="${esc(d.image)}" alt="${esc(d.name)} map">` : ""}
        <span class="dv-tag">${esc(d.scenario || "")}</span>
        <div class="dv-title">${esc(d.name)}</div>
        ${fields ? `<div class="dv-fields">${fields}</div>` : ""}
        ${sections || `<div class="dv-section"><div class="dv-row">No facility drops recorded yet.</div></div>`}
        <a class="dv-link" href="${esc(d.url)}" target="_blank" rel="noopener">Open on ohwikiguide.com &nearr;</a>
      </div>`;
  }

  async function openSettlement(id) {
    setShowDetail();
    if (setDetailCache.has(id)) return renderSettlement(setDetailCache.get(id));
    setDetailEl.innerHTML = `<div class="status">Loading…</div>`;
    try {
      const r = await fetch(`${API}/api/settlements/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      setDetailCache.set(id, d);
      renderSettlement(d);
    } catch (e) {
      setDetailEl.innerHTML = `<div class="status">Couldn't load this settlement.<br><button data-retry="${esc(id)}">Retry</button></div>`;
    }
  }

  async function loadSettlements() {
    setListEl.innerHTML = `<div class="status">Loading settlements…</div>`;
    try {
      const r = await fetch(`${API}/api/settlements`);
      if (!r.ok) throw new Error(r.status);
      scenarios = (await r.json()).scenarios || [];
      renderSettlements();
    } catch (e) {
      setListEl.innerHTML = `<div class="status">Couldn't reach the wiki right now.<br><button data-retry="">Retry</button></div>`;
    }
  }

  $("#set-chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    scenario = b.dataset.scenario;
    document.querySelectorAll("#set-chips .chip").forEach((c) => c.classList.toggle("active", c === b));
    renderSettlements();
  });
  setListEl.addEventListener("click", (e) => {
    const retry = e.target.closest("[data-retry]"); if (retry) return loadSettlements();
    const row = e.target.closest(".row"); if (row) openSettlement(row.dataset.id);
  });
  setDetailEl.addEventListener("click", (e) => {
    const retry = e.target.closest("[data-retry]"); if (retry) openSettlement(retry.dataset.retry);
  });
  $("#set-back").addEventListener("click", setShowList);

  // Load settlements the first time the tab is opened.
  document.querySelector('.tab[data-tab="settlements"]').addEventListener("click", () => { if (!scenarios) loadSettlements(); });

  // Twitch: wait for authorization so the extension is fully initialised, but
  // the data is public so we load it straight away either way.
  if (window.Twitch && Twitch.ext) {
    Twitch.ext.onContext(() => {});
    Twitch.ext.onError((e) => console.error("twitch ext error", e));
  }
  loadList();
})();
