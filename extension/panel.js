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

  // Twitch: wait for authorization so the extension is fully initialised, but
  // the data is public so we load it straight away either way.
  if (window.Twitch && Twitch.ext) {
    Twitch.ext.onContext(() => {});
    Twitch.ext.onError((e) => console.error("twitch ext error", e));
  }
  loadList();
})();
