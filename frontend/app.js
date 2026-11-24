/* Project explorer: renders window.REPO_DATA (written by generate.py) into four views. */
(function () {
  "use strict";
  const D = window.REPO_DATA;
  const $ = (id) => document.getElementById(id);
  const PALETTE = ["--l1", "--l2", "--l3", "--l4", "--l5", "--l6", "--l7", "--l8"];
  const color = (i) => `var(${PALETTE[i % PALETTE.length]})`;
  const SVG = "http://www.w3.org/2000/svg";

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c != null) node.append(c);
    return node;
  }
  function svg(tag, attrs = {}, text) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  }
  const fmtSize = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${Math.round(b / 1e3)} KB` : `${b} B`);
  const fmtNum = (n) => n.toLocaleString("en-US");
  const allServices = () => D.compose.reduce((n, f) => n + f.services.length, 0);

  /* ------------------------------------------------------------ chrome */
  const display = D.readme.title || D.name;
  document.title = `${display} · Project explorer`;
  $("repoName").textContent = D.name;
  $("foot").textContent = D.upstream.url
    ? `Built from the contents of ${D.name}${D.upstream.commit ? ` (upstream commit ${D.upstream.commit})` : ""}.`
    : `Built from the contents of ${D.name}.`;

  /* ------------------------------------------------------------ overview */
  function renderOverview() {
    $("heroEyebrow").textContent = D.upstream.name ? `Based on ${D.upstream.name}` : D.name;
    $("heroTitle").textContent = display;
    $("heroSummary").textContent = D.readme.summary;
    const chips = $("heroChips");
    if (D.upstream.license) chips.append(el("span", { class: "chip chip--accent", text: D.upstream.license }));
    D.languages.slice(0, 4).forEach((l) => chips.append(el("span", { class: "chip", text: l.name })));
    if (D.compose.length) chips.append(el("span", { class: "chip", text: "Docker Compose" }));
    if (D.upstream.url) {
      const a = el("a", { class: "chip", href: D.upstream.url, text: "Upstream ↗" });
      chips.append(a);
    }
    const kpis = [
      ["Files", fmtNum(D.stats.files)],
      ["Size", fmtSize(D.stats.size)],
      ["Services", fmtNum(allServices())],
      ["Notebooks", fmtNum(D.stats.notebooks)],
    ];
    kpis.forEach(([k, v]) => $("heroKpis").append(el("div", {}, el("dt", { text: k }), el("dd", { text: v }))));

    $("readme").innerHTML = D.readme.html; // sanitised by generate.py; CSP blocks scripts regardless

    const mini = $("langMini");
    const bar = el("div", { class: "minibar" });
    const list = el("ul", { class: "minilist" });
    D.languages.forEach((l, i) => {
      const seg = el("span");
      seg.style.width = `${l.share}%`;
      seg.style.background = color(i);
      bar.append(seg);
      const dot = el("span", { class: "dot" });
      dot.style.background = color(i);
      list.append(el("li", {}, dot, el("span", { text: l.name }), el("span", { class: "pct", text: `${l.share}%` })));
    });
    if (D.languages.length) mini.append(bar, list);
    else mini.append(el("p", { class: "muted", text: "No source code detected." }));

    if (D.lab) {
      $("labCard").hidden = false;
      const ok = D.lab.build === "passing";
      const body = $("labBody");
      body.append(el("div", { class: "chips chips--wrap" },
        el("span", { class: `chip ${ok ? "chip--good" : "chip--warn"}`, text: `Build ${D.lab.build}` }),
        el("span", { class: "chip", text: `${D.lab.tests.reduce((n, t) => n + t.passing, 0)} smoke tests passing` })));
      if (D.lab.date) body.append(el("p", { class: "muted", text: `Checked ${D.lab.date}` }));
    }

    // Section links in the sidebar and inside the README scroll to README headings.
    const scrollToTarget = (e) => {
      const a = e.target.closest("a[data-target]");
      if (!a) return;
      e.preventDefault();
      document.getElementById(a.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    $("readme").addEventListener("click", scrollToTarget);
    if (D.readme.toc.length) {
      D.readme.toc.forEach((t) => $("toc").append(el("li", {}, el("a", { href: `#overview`, "data-target": t.id, text: t.label }))));
      $("toc").addEventListener("click", scrollToTarget);
    } else $("tocCard").hidden = true;
  }

  /* ------------------------------------------------------------ architecture */
  function layoutServices(services) {
    const byName = new Map(services.map((s) => [s.name, s]));
    const level = new Map();
    const visiting = new Set();
    function depth(name) {
      if (level.has(name)) return level.get(name);
      if (visiting.has(name)) return 0; // cycle guard
      visiting.add(name);
      const s = byName.get(name);
      const d = s && s.depends.length ? 1 + Math.max(...s.depends.map(depth)) : 0;
      visiting.delete(name);
      level.set(name, d);
      return d;
    }
    services.forEach((s) => depth(s.name));
    const columns = [];
    services.forEach((s) => (columns[level.get(s.name)] ||= []).push(s));
    return columns;
  }

  function drawCompose(file) {
    const box = $("diagram");
    box.textContent = "";
    const columns = layoutServices(file.services);
    const W = 230, H = 74, GX = 90, GY = 22, PAD = 24, LANE = 26;
    const rows = Math.max(...columns.map((c) => c.length));
    const width = PAD * 2 + columns.length * W + (columns.length - 1) * GX;
    const height = PAD * 2 + LANE + rows * H + (rows - 1) * GY;
    const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img",
      "aria-label": `Service dependency diagram for ${file.path}` });
    // Scales down to fit the card; never scales up past natural size. (CSSOM, not a
    // style attribute, so the page's Content-Security-Policy allows it.)
    root.style.width = "100%";
    root.style.maxWidth = `${width}px`;
    root.style.height = "auto";
    const defs = svg("defs");
    const marker = svg("marker", { id: "arrow", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto" });
    marker.append(svg("path", { d: "M0,0 L10,5 L0,10 z", fill: "currentColor", opacity: "0.55" }));
    defs.append(marker);
    root.append(defs);
    const edges = svg("g");
    const nodes = svg("g");
    root.append(edges, nodes);
    const pos = new Map();

    columns.forEach((col, ci) => {
      const x = PAD + ci * (W + GX);
      const colH = col.length * H + (col.length - 1) * GY;
      const y0 = PAD + LANE + (rows * H + (rows - 1) * GY - colH) / 2;
      root.append(svg("text", { class: "lane", x: x + 2, y: PAD + 10 },
        ci === 0 ? "No dependencies" : ci === columns.length - 1 && columns.length > 1 ? "Top level" : `Layer ${ci + 1}`));
      col.forEach((s, ri) => {
        const y = y0 + ri * (H + GY);
        pos.set(s.name, { x, y });
        const g = svg("g", { class: `node${s.build ? " node--build" : ""}${s.gpu ? " node--gpu" : ""}` });
        g.append(svg("rect", { x, y, width: W, height: H, rx: 10 }));
        const name = s.name.length > 26 ? `${s.name.slice(0, 25)}…` : s.name;
        g.append(svg("text", { x: x + 14, y: y + 24 }, name));
        let image = s.image ? s.image.split("/").pop() : s.build ? "built from source" : "image set at deploy time";
        if (image.length > 32) image = `${image.slice(0, 31)}…`;
        g.append(svg("text", { class: "sub", x: x + 14, y: y + 43 }, image));
        const tags = [];
        if (s.ports.length) tags.push(["sub", `:${s.ports.slice(0, 3).join(" :")}`]);
        if (s.build) tags.push(["tag tag--build", "build"]);
        if (s.gpu) tags.push(["tag tag--gpu", "GPU"]);
        if (s.profiles.length) tags.push(["tag tag--profile", s.profiles[0]]);
        // Lay tags out left to right and stop at the card edge rather than overflow it.
        let tx = x + 14;
        for (const [cls, text] of tags) {
          const w = text.length * (cls === "sub" ? 7 : 6.2) + 10;
          if (tx + w > x + W - 6) break;
          g.append(svg("text", { class: cls, x: tx, y: y + 62 }, text));
          tx += w;
        }
        nodes.append(g);
      });
    });
    file.services.forEach((s) => s.depends.forEach((dep) => {
      const a = pos.get(dep), b = pos.get(s.name);
      if (!a || !b) return;
      const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x - 2, y2 = b.y + H / 2;
      const mid = (x1 + x2) / 2;
      edges.append(svg("path", { class: "edge", d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`, "marker-end": "url(#arrow)", color: "currentColor" }));
    }));
    box.append(root);

    const details = $("archDetails");
    details.textContent = "";
    const builds = file.services.filter((s) => s.build).length;
    const exposed = file.services.filter((s) => s.ports.length).length;
    const external = file.services.filter((s) => s.image && !s.build);
    details.append(
      el("div", { class: "card comp" }, el("h3", { text: `${file.services.length} services` }),
        el("p", { text: `${columns.length} dependency layers; arrows point from a dependency to the service that needs it.` })),
      el("div", { class: "card comp" }, el("h3", { text: `${builds} built here` }),
        el("p", { text: `${builds} built from this repository's source, ${external.length} from published images` +
          `${file.services.length - builds - external.length ? `, ${file.services.length - builds - external.length} from images chosen at deploy time` : ""}.` })),
      el("div", { class: "card comp" }, el("h3", { text: `${exposed} ${exposed === 1 ? "exposes a port" : "expose ports"}` }),
        el("p", { text: exposed ? `Entry points: ${file.services.filter((s) => s.ports.length).slice(0, 4).map((s) => s.name).join(", ")}.` : "No service publishes a host port." })),
    );
  }

  function renderArchitecture() {
    if (D.compose.length) {
      $("archNote").textContent = `Services and their dependencies, read from ${D.compose.length === 1 ? D.compose[0].path : `${D.compose.length} Compose files`}.`;
      const select = $("composeSelect");
      D.compose.forEach((f, i) => select.append(el("option", { value: String(i), text: `${f.path} (${f.services.length})` })));
      $("composePick").hidden = D.compose.length < 2;
      select.addEventListener("change", () => drawCompose(D.compose[Number(select.value)]));
      drawCompose(D.compose[0]);
      return;
    }
    // No Compose stack: show how the repository is organised instead.
    $("archNote").textContent = D.notebooks.length
      ? "No container stack is defined; the project is organised as notebooks and folders."
      : "No container stack is defined; the project is organised as the folders below.";
    const box = $("diagram");
    if (D.notebooks.length) {
      const list = el("ol", { class: "pipeline" });
      D.notebooks.forEach((nb) => list.append(el("li", {}, el("div", {}, el("strong", { text: nb.title }), el("span", { text: `${nb.path} · ${nb.cells} cells` })))));
      box.append(el("h2", { class: "card__title", text: "Notebook walkthrough" }), list);
      box.classList.remove("diagram");
    } else {
      box.append(el("p", { class: "empty", text: "This repository has no container stack or notebooks." }));
    }
    const details = $("archDetails");
    D.components.slice(0, 6).forEach((c) => details.append(
      el("div", { class: "card comp" }, el("h3", { text: `${c.name}/` }),
        el("p", { text: `${fmtNum(c.files)} files${c.languages.length ? ` · ${c.languages.join(", ")}` : ""}` }))));
  }

  /* ------------------------------------------------------------ stack */
  function renderStack() {
    D.languages.forEach((l, i) => {
      const seg = el("span", { title: `${l.name} ${l.share}%` });
      seg.style.width = `${l.share}%`;
      seg.style.background = color(i);
      $("langBar").append(seg);
      const dot = el("span", { class: "dot" });
      dot.style.background = color(i);
      $("langLegend").append(el("li", {}, dot, el("span", { text: `${l.name} ${l.share}%` })));
    });
    const chipsFor = (id, deps, label) => {
      const box = $(id);
      if (!deps.length) return box.append(el("p", { class: "muted", text: `No ${label} dependencies declared.` }));
      deps.forEach((d) => box.append(el("span", { class: "chip", text: d })));
    };
    chipsFor("depsPython", D.dependencies.python, "Python");
    chipsFor("depsNode", D.dependencies.node, "JavaScript");

    const table = $("imagesTable");
    const rows = [];
    D.compose.forEach((f) => f.services.forEach((s) => rows.push([s.name, s.image || "(built from source)", f.path])));
    if (!rows.length) {
      table.replaceWith(el("p", { class: "muted", text: "No container images referenced." }));
      return;
    }
    table.append(el("thead", {}, el("tr", {}, el("th", { text: "Service" }), el("th", { text: "Image" }), el("th", { text: "Defined in" }))));
    const body = el("tbody");
    rows.slice(0, 40).forEach(([n, img, f]) => body.append(el("tr", {}, el("td", { text: n }), el("td", {}, el("code", { text: img })), el("td", {}, el("code", { text: f })))));
    table.append(body);
  }

  /* ------------------------------------------------------------ files */
  function countFiles(node) {
    return node.f.length + node.d.reduce((n, d) => n + countFiles(d), 0);
  }
  function renderTree(filter) {
    const box = $("tree");
    box.textContent = "";
    const q = filter.trim().toLowerCase();
    function build(node, path, depth) {
      const frag = document.createDocumentFragment();
      node.d.forEach((d) => {
        const childPath = `${path}${d.n}/`;
        const inner = build(d, childPath, depth + 1);
        if (q && !inner.childNodes.length && !childPath.toLowerCase().includes(q)) return;
        const det = el("details");
        if (q || depth === 0) det.open = true;
        det.append(el("summary", {}, `${d.n}/`, el("span", { class: "count", text: String(countFiles(d)) })), inner);
        frag.append(det);
      });
      node.f.forEach(([name, size]) => {
        if (q && !`${path}${name}`.toLowerCase().includes(q)) return;
        frag.append(el("div", { class: "file" }, el("span", { text: name }), el("span", { text: fmtSize(size) })));
      });
      return frag;
    }
    const content = build(D.tree, "", 0);
    if (!content.childNodes.length) box.append(el("p", { class: "muted", text: "No files match." }));
    else box.append(content);
  }
  function renderFiles() {
    const hidden = [];
    if (D.stats.build_files) hidden.push(`${fmtNum(D.stats.build_files)} build-output files (dist/, build/)`);
    if (D.stats.hidden_files) hidden.push(`${fmtNum(D.stats.hidden_files)} files in hidden config folders`);
    $("filesNote").textContent = `${fmtNum(D.stats.files)} files, ${fmtSize(D.stats.size)}.` +
      (hidden.length ? ` Not shown: ${hidden.join(" and ")}.` : "");
    renderTree("");
    $("fileSearch").addEventListener("input", (e) => renderTree(e.target.value));
    const max = Math.max(1, ...D.components.map((c) => c.files));
    const bars = el("div", { class: "bars" });
    D.components.forEach((c) => {
      const fill = el("div", { class: "bar__fill" });
      fill.style.width = `${(100 * c.files) / max}%`;
      bars.append(el("div", {},
        el("div", { class: "bar__label" }, el("span", { text: `${c.name}/` }), el("span", { text: fmtNum(c.files) })),
        el("div", { class: "bar__track" }, fill),
        c.languages.length ? el("div", { class: "bar__langs", text: c.languages.join(" · ") }) : null));
    });
    $("folderBars").append(D.components.length ? bars : el("p", { class: "muted", text: "All files are at the top level." }));
  }

  /* ------------------------------------------------------------ routing */
  const views = ["overview", "architecture", "stack", "files"];
  function show() {
    const view = views.includes(location.hash.slice(1)) ? location.hash.slice(1) : "overview";
    views.forEach((v) => { $(`view-${v}`).hidden = v !== view; });
    document.querySelectorAll(".tabs a").forEach((a) => {
      if (a.dataset.view === view) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
  }
  renderOverview();
  renderArchitecture();
  renderStack();
  renderFiles();
  addEventListener("hashchange", show);
  show();
  document.body.dataset.ready = "true";
})();
