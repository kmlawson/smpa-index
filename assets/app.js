(function () {
  "use strict";
  const D = window.SMPA, S = D.sections, R = D.records;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase();
  const GROUPS = Object.keys(S.group_desc);
  const VOC = {};  // subject id -> {label, scope, parent}
  S.vocab.forEach((t) => { VOC[t.id] = { label: t.label, scope: t.scope }; t.c.forEach((c) => { VOC[c.id] = { label: c.label, scope: c.scope, parent: t.id }; }); });

  // same normalisation as build.py's canon(): 'D8/9', '163(c)' and '163C' compare equal
  function canon(s) {
    s = String(s || "").toUpperCase().replace(/\s/g, "").replace(/\.0$/, "");
    s = s.replace(/\//g, "-").replace(/\(O\)/g, "(0)").replace(/\(/g, "-").replace(/\)/g, "");
    s = s.replace(/-+/g, "-").replace(/^-|-$/g, "").replace(/-(?=[A-Z])/g, "").replace(/(\d[A-Z])(?=\d)/g, "$1-");
    return s;
  }

  // ------------------------------------------------------------ prepare records
  R.forEach((r, i) => {
    r.i = i;
    r.gi = GROUPS.indexOf(r.s);
    const rolls = new Set();
    String(r.roll).split(/[^0-9]+/).forEach((x) => { if (x) rolls.add(+x); });
    const m = String(r.roll).match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) for (let k = +m[1]; k <= +m[2]; k++) rolls.add(k);
    r.links.forEach((l) => { if (l.t === "roll") rolls.add(l.roll); });
    r.rolls = rolls;
    r.hasFile = r.links.some((l) => l.t === "file");
    r.hasRoll = r.links.some((l) => l.t === "roll");
    r.hasSmp = r.links.some((l) => l.smp);
    r.auto = /^auto/.test(r.lm || "");
    r.ft = fold(r.t);
    r.fn = fold([r.n, r.tags, r.ln].join(" "));
    r.ftags = fold(r.tags);
    r.sub = r.sub || [];
    r.fsub = fold(r.sub.map((t) => t + " " + (VOC[t] ? VOC[t].label : "")).join(" | "));
    r.fk = [fold(r.s + r.f).replace(/\s/g, ""), fold(r.f).replace(/\s/g, ""), fold(r.s + "-" + r.f).replace(/\s/g, "")];
    r.ck = canon(r.s + r.f);
    const nm = String(r.f).match(/\d+/);
    r.fnum = nm ? +nm[0] : 1e9;
    r.nlinks = r.links.length;
    // pages of the linked individual scan(s); several parts of one file are added together
    const fp = r.links.filter((l) => l.t === "file" && l.p).map((l) => l.p);
    r.np = fp.length ? fp.reduce((a, b) => a + b, 0) : null;
    r.minroll = rolls.size ? Math.min(...rolls) : 999;
  });

  // ------------------------------------------------------------ state <-> hash
  const ctl = {
    q: $("#q"), field: $("#field"), grp: $("#grp"), subj: $("#subj"), roll: $("#roll"), y1: $("#y1"), y2: $("#y2"),
    undated: $("#undated"), link: $("#link"), src: $("#src"), cited: $("#cited"), no1: $("#no1"), smp: $("#smp"), inl: $("#inl"), pp: $("#pp"),
  };
  let st = { sort: "", dir: 1, page: 1, open: [], show: "" };

  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    ctl.q.value = h.get("q") || "";
    ctl.field.value = h.get("f") || "all";
    ctl.grp.value = h.get("g") || "";
    ctl.subj.value = h.get("sub") || "";
    ctl.roll.value = h.get("r") || "";
    ctl.y1.value = h.get("y1") || "";
    ctl.y2.value = h.get("y2") || "";
    ctl.undated.checked = h.get("u") !== "0";
    ctl.link.value = h.get("l") || "";
    ctl.src.value = h.get("src") || "";
    ctl.cited.checked = h.get("c") === "1";
    ctl.no1.checked = h.get("x1") === "1";
    ctl.smp.checked = h.get("smp") === "1";
    ctl.inl.checked = h.get("nn") !== "0";
    ctl.pp.value = h.get("pp") || "100";
    st.sort = h.get("sort") || "";
    st.dir = h.get("dir") === "-1" ? -1 : 1;
    st.page = +(h.get("p") || 1);
    st.open = (h.get("open") || "").split(",").filter(Boolean);
    st.show = h.get("id") || "";
  }
  function writeHash() {
    const h = new URLSearchParams();
    const set = (k, v, d) => { if (v !== "" && v != null && v !== d) h.set(k, v); };
    set("q", ctl.q.value.trim()); set("f", ctl.field.value, "all"); set("g", ctl.grp.value); set("sub", ctl.subj.value); set("r", ctl.roll.value);
    set("y1", ctl.y1.value); set("y2", ctl.y2.value); if (!ctl.undated.checked) h.set("u", "0");
    set("l", ctl.link.value); set("src", ctl.src.value); if (ctl.cited.checked) h.set("c", "1"); if (ctl.no1.checked) h.set("x1", "1"); if (ctl.smp.checked) h.set("smp", "1"); if (!ctl.inl.checked) h.set("nn", "0");
    set("pp", ctl.pp.value, "100"); set("sort", st.sort); if (st.dir === -1) h.set("dir", "-1"); if (st.page > 1) h.set("p", st.page);
    if (st.open.length) h.set("open", st.open.join(",")); set("id", st.show);
    const s = h.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
    if (s !== location.hash.slice(1)) history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
  }

  // ------------------------------------------------------------ query parsing
  function parseQuery(q, field) {
    const terms = [];
    const re = /(-)?(?:(title|notes|tags|file|group|subject):)?(?:"([^"]*)"|(\S+))/gi;
    let m;
    while ((m = re.exec(q))) {
      const text = m[3] != null ? m[3] : m[4];
      if (!text) continue;
      let f = (m[2] || (field === "all" ? "" : field)).toLowerCase();
      terms.push({ neg: !!m[1], f, v: fold(text), raw: text, exact: f === "file" && text.startsWith("=") });
    }
    return terms;
  }
  function termHit(r, t) {
    if (t.f === "title") return r.ft.includes(t.v);
    if (t.f === "notes") return r.fn.includes(t.v);
    if (t.f === "tags") return r.ftags.includes(t.v);
    if (t.f === "subject") return r.fsub.includes(t.v);
    if (t.f === "group") return fold(r.s) === t.v;
    if (t.f === "file") {
      if (t.exact) { const k = canon(t.raw.slice(1)); return r.ck === k || r.ck === k + "C" || (k.endsWith("C") && r.ck === k.slice(0, -1)); }
      const v = t.v.replace(/\s/g, "");
      return r.fk.some((k) => k.startsWith(v));
    }
    return r.ft.includes(t.v) || r.fn.includes(t.v) || r.fk.some((k) => k.startsWith(t.v.replace(/\s/g, "")));
  }

  // ------------------------------------------------------------ filtering
  let results = [];
  function compute() {
    const terms = parseQuery(ctl.q.value, ctl.field.value);
    const g = ctl.grp.value, subj = ctl.subj.value, roll = +ctl.roll.value || 0;
    const y1 = +ctl.y1.value || 0, y2 = +ctl.y2.value || 0, und = ctl.undated.checked;
    const link = ctl.link.value, src = ctl.src.value, cited = ctl.cited.checked, smp = ctl.smp.checked, no1 = ctl.no1.checked;
    results = R.filter((r) => {
      if (g && r.s !== g) return false;
      if (subj && !r.sub.includes(subj)) return false;
      if (roll && !r.rolls.has(roll)) return false;
      if (y1 || y2) {
        if (r.y == null) { if (!und) return false; }
        else if ((y1 && r.y < y1) || (y2 && r.y > y2)) return false;
      }
      if (link === "file" && !r.hasFile) return false;
      if (link === "roll" && (r.hasFile || !r.hasRoll)) return false;
      if (link === "any" && !r.nlinks) return false;
      if (link === "none" && (r.hasFile || r.hasRoll)) return false;
      if (src === "wiki" && !(r.nlinks && !r.auto)) return false;
      if (src === "auto" && !r.auto) return false;
      if (cited && !r.cite) return false;
      if (no1 && (r.np === 1 || (r.np == null && r.pg === 1))) return false;
      if (smp && !r.hasSmp) return false;
      for (const t of terms) if (termHit(r, t) === t.neg) return false;
      return true;
    });
    const pos = terms.filter((t) => !t.neg && (t.f === "" || t.f === "title"));
    if (st.sort) {
      const k = st.sort, d = st.dir;
      const key = {
        file: (r) => [r.gi, r.fnum, r.f],
        title: (r) => [r.ft],
        year: (r) => [r.y == null ? (d > 0 ? 1e4 : -1) : r.y, r.gi, r.fnum],
        roll: (r) => [r.minroll, r.gi, r.fnum],
        pages: (r) => [r.np == null ? (d > 0 ? 1e6 : -1) : r.np, r.gi, r.fnum],
        links: (r) => [-(r.hasFile * 2 + r.hasRoll), r.gi, r.fnum],
      }[k];
      results.sort((a, b) => cmp(key(a), key(b)) * d);
    } else if (pos.length) {
      const phrase = fold(ctl.q.value.replace(/-\S+|\w+:/g, "").replace(/"/g, "").trim());
      results.forEach((r) => {
        let sc = 0;
        if (phrase && r.ft.includes(phrase)) sc += 100;
        pos.forEach((t) => { if (r.ft.includes(t.v)) sc += 10; if (r.ft.startsWith(t.v)) sc += 3; });
        r._sc = sc;
      });
      results.sort((a, b) => b._sc - a._sc || a.gi - b.gi || a.fnum - b.fnum || cmp([a.f], [b.f]));
    } else {
      results.sort((a, b) => a.gi - b.gi || a.fnum - b.fnum || a.i - b.i);
    }
    return terms;
  }
  function cmp(a, b) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  }

  // ------------------------------------------------------------ rendering
  function hl(s, terms, fields) {
    let out = esc(s);
    const vs = terms.filter((t) => !t.neg && fields.includes(t.f) && t.v.length > 1).map((t) => t.v);
    if (!vs.length) return out;
    const f = fold(out), marks = [];
    vs.forEach((v) => { let p = f.indexOf(v); while (p >= 0) { marks.push([p, p + v.length]); p = f.indexOf(v, p + 1); } });
    if (!marks.length) return out;
    marks.sort((a, b) => a[0] - b[0]);
    let res = "", last = 0;
    for (const [a, b] of marks) { if (a < last) continue; res += out.slice(last, a) + "<mark>" + out.slice(a, b) + "</mark>"; last = b; }
    return res + out.slice(last);
  }
  function pills(r) {
    const out = [];
    r.links.forEach((l) => {
      if (l.t === "file") out.push(`<a class="pill file" href="${esc(l.u)}" target="_blank" rel="noopener" title="Individual file on the Internet Archive (${esc(l.id)}${l.p ? ", " + l.p + (l.p === 1 ? " page" : " pages") : ""})">IA file</a>`);
      else if (l.t === "roll") out.push(`<a class="pill roll" href="${esc(l.u)}" target="_blank" rel="noopener" title="Microfilm roll on the Internet Archive">Roll ${l.roll}${l.page != null ? " p." + l.page : ""}</a>`);
      else out.push(`<a class="pill other" href="${esc(l.u)}" target="_blank" rel="noopener">link</a>`);
    });
    const smp = r.links.filter((l) => l.smp);
    smp.forEach((l) => out.push(`<a class="pill smp" href="${esc(l.smp)}" target="_blank" rel="noopener" title="Transcription and translation on smp-files">smp-files</a>`));
    if (!r.links.length && r.ln) out.push(`<span class="muted">${esc(r.ln)}</span>`);
    return out.join(" ");
  }
  const fileLabel = (r) => `<span class="g">${esc(r.s)}</span>${esc(r.f || "–")}`;

  function details(r) {
    const rows = [];
    const add = (k, v) => { if (v) rows.push(`<dt>${k}</dt><dd>${v}</dd>`); };
    add("Group", esc(r.s + " – " + (S.group_desc[r.s] || "")));
    add("File", esc((r.s === "D" || r.s === "N" || r.s === "U" || r.s === "IO" ? r.s : r.s + " ") + r.f));
    add("Box / Roll", esc([r.box && "Box " + r.box, r.roll && "Roll " + r.roll].filter(Boolean).join(", ")));
    add("Date", esc(r.d));
    add("Pages", r.pg ? String(r.pg) : "");
    add("Tags", esc(r.tags));
    if (!ctl.inl.checked) add("Notes", esc(r.n));
    const ls = r.links.map((l) => {
      if (l.t === "file") return `<a href="${esc(l.u)}" target="_blank" rel="noopener">Internet Archive: ${esc(l.id)}</a>${l.p ? ` <span class="muted">(${l.p} ${l.p === 1 ? "page" : "pages"})</span>` : ""}${l.m ? ` <span class="muted">– added later: ${esc(l.m)}</span>` : ""}` + (l.smp ? ` · <a href="${esc(l.smp)}" target="_blank" rel="noopener">smp-files transcription</a>` : "");
      if (l.t === "roll") {
        const ia = S.rolls.find((x) => x.n === l.roll);
        return `<a href="${esc(l.u)}" target="_blank" rel="noopener">Roll ${l.roll}${l.page != null ? ", image " + l.page : ""}</a>` + (ia ? ` <span class="muted">(${esc(ia.cov)})</span>` : "");
      }
      return `<a href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.u)}</a>`;
    });
    add("Scans", ls.join("<br>"));
    add("Link note", esc(r.ln));
    if (r.nlinks) {
      let how = r.auto ? esc(r.lm.replace(/^auto: /, "Automatically matched: ")) : "From the original wiki";
      if (r.chk === "match") how += " · file cover checked against the folder";
      if (r.chk === "unsure") how += " · cover check inconclusive";
      add("Link source", how);
    }
    if (r.td) add("D-number in transcription", esc(r.td) + (canon(r.td) === canon("D" + r.f) ? "" : ' <span class="muted">(differs from the index)</span>'));
    if (r.sub.length) {
      const top = r.sub.filter((t) => !t.includes("."));
      add("Subjects", top.map((t) => `<button class="pill subj top" data-subj="${t}" title="${esc(VOC[t] ? VOC[t].scope : "")}">${esc(VOC[t] ? VOC[t].label : t)}</button>` +
        r.sub.filter((c) => c.startsWith(t + ".")).map((c) => ` <button class="pill subj" data-subj="${c}" title="${esc(VOC[c] ? VOC[c].scope : "")}">${esc(VOC[c] ? VOC[c].label : c)}</button>`).join("")).join("<br>") +
        ' <span class="muted">(assigned automatically)</span>');
    }
    if (r.cite) {
      add("Cited in", r.cite.map((c) => `${S.cited.books[c.b] || esc(c.b)} p. ${esc(c.p)}${c.fn ? ", n. " + esc(c.fn) : ""}`).join("<br>"));
    }
    if (r.s === "N" && canon(r.f) === "1482") add("File notes", `<button class="linkish" data-open="s-filenotes">Detailed notes on this file</button>`);
    const rolls = [...r.rolls].filter((n) => !r.links.some((l) => l.t === "roll" && l.roll === n));
    if (!r.hasFile && rolls.length) {
      add("Browse roll", rolls.map((n) => { const ro = S.rolls.find((x) => x.n === n); return ro && ro.ia ? `<a href="https://archive.org/details/${ro.ia}" target="_blank" rel="noopener">Roll ${n}</a> <span class="muted">(${esc(ro.cov)})</span>` : `Roll ${n} <span class="muted">(not on the Internet Archive)</span>`; }).join("<br>"));
    }
    return `<tr class="detail" data-for="${r.i}"><td colspan="6"><dl>${rows.join("")}</dl></td></tr>`;
  }

  function render() {
    const terms = compute();
    const n = results.length, pp = ctl.pp.value === "all" ? n || 1 : +ctl.pp.value;
    const pages = Math.max(1, Math.ceil(n / pp));
    if (st.page > pages) st.page = pages;
    const slice = results.slice((st.page - 1) * pp, st.page * pp);
    const html = [];
    slice.forEach((r) => {
      html.push(`<tr class="r" data-i="${r.i}" tabindex="0">` +
        `<td class="c-file">${fileLabel(r)}</td>` +
        `<td class="c-title">${hl(r.t || "(no title)", terms, ["", "title"])}${r.cite ? ` <span class="pill cite" title="Cited in scholarship">cited</span>` : ""}${ctl.inl.checked && r.n ? `<div class="inote">${hl(r.n, terms, ["", "notes"])}</div>` : ""}</td>` +
        `<td class="c-year">${esc(r.d || (r.y || ""))}</td>` +
        `<td class="c-roll">${esc(r.roll)}</td>` +
        `<td class="c-pg">${r.np != null ? r.np : ""}</td>` +
        `<td class="c-links">${pills(r)}</td></tr>`);
      if (st.show === String(r.i)) html.push(details(r));
    });
    $("#rows").innerHTML = html.join("");
    $("#empty").hidden = n > 0;
    const withFile = results.filter((r) => r.hasFile).length;
    $("#count").textContent = `${n.toLocaleString()} of ${R.length.toLocaleString()} files · ${withFile.toLocaleString()} with an individual scan on the Internet Archive`;
    $("#pageinfo").textContent = `${st.page} / ${pages}`;
    $("#prev").disabled = st.page <= 1;
    $("#next").disabled = st.page >= pages;
    document.querySelectorAll("#search thead th").forEach((th) => {
      th.querySelector(".arrow").textContent = th.dataset.k === st.sort ? (st.dir > 0 ? "▲" : "▼") : "";
    });
    writeHash();
  }

  // ------------------------------------------------------------ sections
  function fillSections() {
    $("#about").innerHTML =
      S.about.map((p) => `<p>${p}</p>`).join("") +
      `<h3>How the file lists were made</h3><ol>${S.workflow.map((w) => `<li>${w}</li>`).join("")}</ol>` +
      `<h3>This site</h3><p>This index was built from the old SMPA wiki. The D-file list has since been extended with links to the individual files on the Internet Archive, matched automatically by folder title and D-number and, for uncertain cases, by checking the file covers. For every automatically added link, the "Link source" line in the file's details says how it was matched. Students in the University of St Andrews honours module <a href="https://www.spatialhistory.net/cities/" target="_blank" rel="noopener">MO4971 From City to Home: Spatial Histories of Modern East and Southeast Asia</a> contributed notes on individual files over the years. The whole index can be downloaded as <a href="downloads/smpa-files.csv">CSV</a> or <a href="downloads/smpa-files.json">JSON</a>.</p>`;

    const cnt = (n) => R.filter((r) => r.rolls.has(n)).length;
    $("#rolls").innerHTML =
      `<p>The rolls on the Internet Archive are mirrors of the scans in the <a href="https://www.bnasie.eu/BN/Archives" target="_blank" rel="noopener">Bibliothèque Numérique Asiatique</a> collection; read more about their digitisation in <a href="https://enepchina.hypotheses.org/3450" target="_blank" rel="noopener">this post by Christian Henriot</a>. The individual files, which are often clearer to read but sometimes miss pages, are <a href="https://archive.org/search?query=Subject%3A%28Police+Files%29+AND+Subject%3A%28SMPA%29+AND+Subject%3A%28Shanghai+Municipal+Police%29" target="_blank" rel="noopener">listed here</a>.</p>` +
      `<p class="muted">Do not assume that rolls follow a chronological order. Files with very few pages are sometimes filmed together with a neighbouring file, so if a file seems to be missing, check its vicinity.</p>` +
      `<table class="minitable"><thead><tr><th>Roll</th><th>Files and dates</th><th>Internet Archive</th><th>In this index</th></tr></thead><tbody>` +
      S.rolls.map((r) => `<tr><td class="num">${r.n}</td><td>${esc(r.cov)}</td><td>${r.ia ? `<a href="https://archive.org/details/${r.ia}" target="_blank" rel="noopener">${esc(r.ia)}</a>` : '<span class="muted">not online</span>'}</td><td>${cnt(r.n) ? `<a href="#r=${r.n}" data-roll="${r.n}">${cnt(r.n)} files</a>` : '<span class="muted">–</span>'}</td></tr>`).join("") +
      `</tbody></table>`;

    const info = Object.fromEntries(S.groups.map((g) => [g.g, g]));
    // groups whose individual files carry a "<group> Files" subject tag on the Internet Archive
    const IA_TAGGED = ["D", "IO", "N", "U", "CS", "W"];
    const OUT_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M9 2h5v5h-1.5V4.6L7.1 10 6 8.9l5.4-5.4H9V2zM3 4h4v1.5H4.5v6h6V9H12v4H3V4z"/></svg>`;
    $("#groups").innerHTML =
      `<p>The vast majority of the files are in four groups, D, IO, N and U, with D files by far the largest. Some individual files on the Internet Archive are not yet matched to any entry here: see the <a href="unlinked.html">list of unlinked files</a>.</p>` +
      `<table class="minitable"><thead><tr><th>Group</th><th>Description</th><th>Rolls</th><th>Files</th><th>Individual scan</th><th>Roll page only</th></tr></thead><tbody>` +
      GROUPS.map((g) => {
        const rs = R.filter((r) => r.s === g), f = rs.filter((r) => r.hasFile).length, ro = rs.filter((r) => !r.hasFile && r.hasRoll).length;
        return `<tr><td class="grp"><a href="#g=${g}" data-grp="${g}" title="Show all ${g} files in the index">${g}</a>${IA_TAGGED.includes(g) ? ` <a class="outlink" href="https://archive.org/search?query=${encodeURIComponent(`subject:"${g} Files" AND subject:SMPA`)}" target="_blank" rel="noopener" title="Individual ${g} files on the Internet Archive">${OUT_ICON}</a>` : ""}</td><td>${esc((info[g] && info[g].desc) || S.group_desc[g])}</td><td>${esc((info[g] && info[g].rolls) || "")}</td><td class="num">${rs.length}</td><td class="num">${f}</td><td class="num">${ro}</td></tr>`;
      }).join("") + `</tbody></table>` +
      GROUPS.filter((g) => S.group_intros[g] && S.group_intros[g].length).map((g) =>
        `<h3>${g} files</h3>` + S.group_intros[g].filter((p) => !/must be viewed with great care/.test(p)).map((p) => `<p>${p}</p>`).join("")).join("");

    const books = S.cited.books;
    $("#cited").innerHTML =
      S.cited.intro.map((p) => `<p>${p}</p>`).join("") +
      `<ul class="bib">${Object.entries(books).map(([k, v]) => `<li><b>${esc(k)}</b> ${v}</li>`).join("")}</ul>` +
      `<p><button class="linkish" data-cited="1">Show all cited files in the index</button></p>` +
      `<table class="minitable"><thead><tr><th>File</th><th>References</th><th>Citations</th></tr></thead><tbody>` +
      S.cited.files.slice().sort((a, b) => b.refs.length - a.refs.length).map((c) =>
        `<tr><td><button class="linkish" data-q="${esc(c.hit ? "file:=" + c.key : "file:" + c.key)}">${esc(c.key)}</button></td><td>${c.refs.map((x) => `<span title="${esc((books[x.b] || "").replace(/<[^>]+>/g, ""))}">${esc(x.b)}:${esc(x.p)}${x.fn ? "," + esc(x.fn) : ""}</span>`).join(" ")}</td><td class="num">${c.refs.length}</td></tr>`).join("") +
      `</tbody></table>`;

    $("#bib").innerHTML = S.bibliography.intro.map((p) => `<p>${p}</p>`).join("") + `<ul class="bib">${S.bibliography.items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
    $("#resources").innerHTML =
      `<p><b>Complementary resource:</b> <a href="https://ray-bot-ai.github.io/smp-files/" target="_blank" rel="noopener">SMP Files: full-text transcriptions and Chinese translations</a>, built by Rui Yang (杨睿). Every individual file on the Internet Archive has been re-transcribed page by page with a vision language model and translated into Chinese, in a searchable site that links back to the original scans. Files in this index that have a transcription there carry an <span class="pill smp">smp-files</span> link.</p>` +
      `<ul>${S.resources.map((i) => `<li>${i}</li>`).join("")}</ul>`;

    const fn = S.filenote;
    let open = false;
    const lines = fn.lines.map((l) => {
      const h = l.match(/^=+\s*(.+?)\s*=+$/);
      if (h) return (open ? "</ul>" : "") + `<h3>${h[1]}</h3>` + ((open = false), "");
      const li = l.match(/^\*\s*(.*)$/);
      if (li) { const s = (open ? "" : "<ul>") + `<li>${li[1]}</li>`; open = true; return s; }
      const s = (open ? "</ul>" : "") + `<p>${l}</p>`; open = false; return s;
    }).join("") + (open ? "</ul>" : "");
    $("#filenotes").innerHTML = `<p class="muted">Pages for individual files, with fuller notes contributed by students. <button class="linkish" data-q="file:=N1482">Find this file in the index</button></p><h3>${esc(fn.title)}</h3>${lines}`;
  }

  // ------------------------------------------------------------ section toggling
  const secs = [...document.querySelectorAll("section.md")];
  function syncSections() {
    secs.forEach((s) => { s.hidden = !st.open.includes(s.id); });
    document.querySelectorAll(".jump[data-target]").forEach((b) => {
      const t = b.dataset.target;
      if (t === "all") b.setAttribute("aria-expanded", st.open.length === secs.length);
      else if (t !== "search") b.setAttribute("aria-expanded", st.open.includes(t));
    });
    $(".openall").textContent = st.open.length === secs.length ? "Close All" : "Open All";
  }
  function toggle(id, force) {
    const on = force != null ? force : !st.open.includes(id);
    st.open = st.open.filter((x) => x !== id);
    if (on) st.open.push(id);
    syncSections(); writeHash();
    if (on) document.getElementById(id).scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.querySelector(".jumps").addEventListener("click", (e) => {
    const b = e.target.closest("button.jump");
    if (!b) return;
    const t = b.dataset.target;
    if (t === "all") { st.open = st.open.length === secs.length ? [] : secs.map((s) => s.id); syncSections(); writeHash(); }
    else if (t === "search") $("#search").scrollIntoView({ behavior: "smooth" });
    else toggle(t);
  });
  secs.forEach((s) => {
    const h = s.querySelector("h2");
    h.addEventListener("click", () => toggle(s.id, false));
    h.addEventListener("keydown", (e) => { if (e.key === "Enter") toggle(s.id, false); });
  });
  $("#home").addEventListener("click", () => { history.replaceState(null, "", location.pathname); readHash(); syncSections(); render(); window.scrollTo({ top: 0 }); });

  // links inside sections that drive the index
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-roll],[data-grp],[data-q],[data-cited],[data-open],[data-subj]");
    if (!b) return;
    e.preventDefault();
    if (b.dataset.open) { toggle(b.dataset.open, true); return; }
    resetControls();
    if (b.dataset.roll) ctl.roll.value = b.dataset.roll;
    if (b.dataset.grp) ctl.grp.value = b.dataset.grp;
    if (b.dataset.subj) ctl.subj.value = b.dataset.subj;
    if (b.dataset.q) ctl.q.value = b.dataset.q;
    if (b.dataset.cited) ctl.cited.checked = true;
    st.page = 1; st.show = ""; render();
    $("#search").scrollIntoView();  // jump straight to the results
  });

  // ------------------------------------------------------------ index controls
  function resetControls() {
    ctl.q.value = ""; ctl.field.value = "all"; ctl.grp.value = ""; ctl.subj.value = ""; ctl.roll.value = ""; ctl.y1.value = ""; ctl.y2.value = "";
    ctl.undated.checked = true; ctl.link.value = ""; ctl.src.value = ""; ctl.cited.checked = false; ctl.no1.checked = false; ctl.smp.checked = false; ctl.inl.checked = true;
    st.sort = ""; st.dir = 1; st.page = 1; st.show = "";
  }
  GROUPS.forEach((g) => {
    const n = R.filter((r) => r.s === g).length;
    ctl.grp.insertAdjacentHTML("beforeend", `<option value="${g}">${g} – ${esc(S.group_desc[g])} (${n})</option>`);
  });
  const scount = {};
  R.forEach((r) => r.sub.forEach((t) => { scount[t] = (scount[t] || 0) + 1; }));
  S.vocab.forEach((t) => {
    ctl.subj.insertAdjacentHTML("beforeend", `<optgroup label="${esc(t.label)}"><option value="${t.id}">${esc(t.label)} – all (${scount[t.id] || 0})</option>` +
      t.c.map((c) => `<option value="${c.id}">${esc(c.label)} (${scount[c.id] || 0})</option>`).join("") + `</optgroup>`);
  });
  $("#subjects").innerHTML =
    `<p>Each file with an individual scan has been given subject tags from a controlled vocabulary of ${S.vocab.length} broad subjects and ${S.vocab.reduce((n, t) => n + t.c.length, 0)} specific ones. Click a subject to list its files, or choose one from the <b>Subject</b> filter. Each heading is mapped to the closest <a href="https://www.oclc.org/research/areas/data-science/fast.html" target="_blank" rel="noopener">OCLC FAST</a> headings in the vocabulary file.</p>` +
    `<p class="warnnote">The tags were assigned automatically by large language models (Gemini and GPT) reading machine transcriptions of each file. Spot checks found roughly nine in ten tags correct; expect some wrong or missing tags, especially for short or badly scanned files. Files without an individual scan have no tags yet.</p>` +
    `<div class="subjgrid">` + S.vocab.map((t) => `<div class="subjtop"><h3><button class="linkish" data-subj="${t.id}" title="${esc(t.scope)}">${esc(t.label)}</button> <span class="muted">${scount[t.id] || 0}</span></h3><ul>` +
      t.c.map((c) => `<li><button class="linkish" data-subj="${c.id}" title="${esc(c.scope)}">${esc(c.label)}</button> <span class="muted">${scount[c.id] || 0}</span></li>`).join("") + `</ul></div>`).join("") + `</div>`;
  S.rolls.forEach((r) => ctl.roll.insertAdjacentHTML("beforeend", `<option value="${r.n}">${r.n}${r.ia ? "" : " (not online)"}</option>`));

  let timer;
  ctl.q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { st.page = 1; st.show = ""; render(); }, 150); });
  ["field", "grp", "subj", "roll", "y1", "y2", "undated", "link", "src", "cited", "no1", "smp", "pp"].forEach((k) =>
    ctl[k].addEventListener("change", () => { st.page = 1; st.show = ""; render(); }));
  ctl.inl.addEventListener("change", render);
  $("#reset").addEventListener("click", () => { resetControls(); render(); });
  $("#prev").addEventListener("click", () => { st.page--; render(); $("#search").scrollIntoView(); });
  $("#next").addEventListener("click", () => { st.page++; render(); $("#search").scrollIntoView(); });
  document.querySelectorAll("#search thead th").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.k;
    if (st.sort === k) { if (st.dir === 1) st.dir = -1; else { st.sort = ""; st.dir = 1; } }
    else { st.sort = k; st.dir = 1; }
    render();
  }));
  function toggleRow(tr) {
    st.show = st.show === tr.dataset.i ? "" : tr.dataset.i;
    render();
  }
  $("#rows").addEventListener("click", (e) => {
    if (e.target.closest("a,button")) return;
    const tr = e.target.closest("tr.r");
    if (tr) toggleRow(tr);
  });
  $("#rows").addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr.r");
    if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleRow(tr); }
  });
  // The page follows the system light/dark setting. The ◐ button stores an override only when it
  // differs from the system; choosing the system's own mode clears it, so the page follows the system again.
  const sysDark = matchMedia("(prefers-color-scheme: dark)");
  $("#theme").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : sysDark.matches;
    const want = dark ? "light" : "dark";
    try {
      if ((want === "dark") === sysDark.matches) { delete root.dataset.theme; localStorage.removeItem("smpa-theme"); }
      else { root.dataset.theme = want; localStorage.setItem("smpa-theme", want); }
    } catch (e) { root.dataset.theme = want; /* storage unavailable */ }
  });
  $("#csv").addEventListener("click", () => {
    const cols = ["group", "file", "title", "date", "year", "box", "roll", "pages", "scan_pages", "tags", "notes", "ia_file", "ia_roll", "smp_files", "link_source", "subjects"];
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lines = [cols.join(",")].concat(results.map((r) => [r.s, r.f, r.t, r.d, r.y, r.box, r.roll, r.pg, r.np, r.tags, r.n,
      r.links.filter((l) => l.t === "file").map((l) => l.u).join(" "), r.links.filter((l) => l.t === "roll").map((l) => l.u).join(" "),
      r.links.filter((l) => l.smp).map((l) => l.smp).join(" "), r.nlinks ? (r.lm || "wiki") : "", r.sub.join(" ")].map(q).join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
    a.download = "smpa-files-selection.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  window.addEventListener("hashchange", () => { readHash(); syncSections(); render(); });
  const totop = $("#totop");
  const showTop = () => { totop.hidden = window.scrollY < 1.5 * window.innerHeight; };
  window.addEventListener("scroll", showTop, { passive: true });
  totop.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  showTop();

  fillSections();
  readHash();
  syncSections();
  render();
})();
