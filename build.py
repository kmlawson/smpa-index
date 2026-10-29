#!/usr/bin/env python3
"""Build data/data.js and the downloads from the old DokuWiki pages in source/.

D files come from source/d_files.csv (the wiki's D-file table, extended with
Internet Archive links matched afterwards); every other file group is read
straight from its wiki page.  Run:  python3 build.py
"""
import csv, json, re, html
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "source"
WIKI = SRC / "wiki"

# ---------------------------------------------------------------- helpers

def canon(s):
    """Normalise a file number so 'D8/9', 'D 8-9', '163(c)' and '163C' compare equal."""
    s = str(s or "").upper().replace(" ", "")
    s = re.sub(r"\.0$", "", s)
    s = s.replace("/", "-").replace("(O)", "(0)").replace("(", "-").replace(")", "")
    s = re.sub(r"-+", "-", s).strip("-")
    s = re.sub(r"-(?=[A-Z])", "", s)
    s = re.sub(r"(?<=\d[A-Z])(?=\d)", "-", s)
    return s

LINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]")

def inline(text):
    """DokuWiki inline markup -> HTML."""
    out, pos = [], 0
    for m in LINK_RE.finditer(text):
        out.append(_fmt(html.escape(text[pos:m.start()])))
        target, label = m.group(1).strip(), (m.group(2) or "").strip()
        if re.match(r"https?://", target):
            out.append(f'<a href="{html.escape(target)}" target="_blank" rel="noopener">{_fmt(html.escape(label or target))}</a>')
        else:  # internal wiki link -> plain text (the pages become sections of this site)
            out.append(_fmt(html.escape(label or target)))
        pos = m.end()
    out.append(_fmt(html.escape(text[pos:])))
    s = "".join(out)
    s = re.sub(r"(?<![\"'>=])(https?://[^\s<]+[^\s<.,;:)])", r'<a href="\1" target="_blank" rel="noopener">\1</a>', s)
    return s

def _fmt(s):
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<!:)//(.+?)(?<!:)//", r"<i>\1</i>", s)
    s = re.sub(r";;;;(.+?);;;;", r"\1", s)
    s = re.sub(r";;;?(.+?);;;?", r"\1", s)
    return s.replace(" \\\\ ", "<br>")

def split_row(line):
    """Split a DokuWiki table row on '|' or '^', ignoring pipes inside [[...]]."""
    protected = LINK_RE.sub(lambda m: m.group(0).replace("|", "\x00"), line.strip())
    cells = re.split(r"[|^]", protected)[1:-1] if protected[-1] in "|^" else re.split(r"[|^]", protected)[1:]
    return [c.replace("\x00", "|").strip() for c in cells]

def tables(text):
    """Yield (header, rows) for every table on a page."""
    head, rows = None, []
    for line in text.splitlines():
        if line.startswith("^"):
            if head is not None:
                yield head, rows
            head, rows = [h.lower() for h in split_row(line)], []
        elif line.startswith("|") and head is not None:
            rows.append(split_row(line))
        elif head is not None and line.strip() and not line.startswith("<"):
            yield head, rows
            head, rows = None, []
    if head is not None:
        yield head, rows

def year_of(date):
    m = re.search(r"\b(18[89]\d|19[0-4]\d)\b", str(date))
    return int(m.group(1)) if m else None

def links_of(cell):
    """Classify every URL in a link cell."""
    urls = re.findall(r"https?://[^\s|\]]+", cell)
    rest = re.sub(r"https?://[^\s|\]]+", "", LINK_RE.sub(lambda m: m.group(2) or m.group(1), cell))
    rest = re.sub(r"\s*\\\\\s*|//|until|\s+", " ", rest).strip(" ,;")
    out = []
    for u in urls:
        u = u.rstrip(".,;")
        m = re.search(r"archive\.org/details/(smpa-files-\d+)", u)
        if m:
            out.append({"t": "file", "u": "https://archive.org/details/" + m.group(1), "id": m.group(1)})
            continue
        m = re.search(r"archive\.org/details/smpa-(\d+)(?:-\d+)?(?:/page/n(\d+))?", u)
        if m:
            out.append({"t": "roll", "u": u, "roll": int(m.group(1)), "page": int(m.group(2)) if m.group(2) else None})
            continue
        out.append({"t": "other", "u": u})
    seen, uniq = set(), []
    for l in out:
        if l["u"] not in seen:
            seen.add(l["u"]); uniq.append(l)
    return uniq, (rest if re.search(r"[A-Za-z]{3}", rest) else "")

def clean(s):
    s = re.sub(r";{2,4}", "", str(s or ""))
    s = LINK_RE.sub(lambda m: m.group(2) or m.group(1), str(s or ""))
    return re.sub(r"\s+", " ", s.replace(" \\\\ ", "; ")).strip(" -") if s.strip() not in ("-", "") else ""

def num(s):
    s = str(s or "").strip().rstrip(",")
    return int(s) if s.isdigit() else None

# ---------------------------------------------------------------- file groups

GROUPS = [  # key, page, short description
    ("D", "d_files", "Reports of Special Branch, 1929-1949"),
    ("IO", "io_files", "Reports made 1916-1929"),
    ("N", "n_files", "Reports made 1943-1945 during the Japanese Occupation"),
    ("U", "u_files", "Reports made 1940-1945 during the Japanese Occupation"),
    ("CS", "cs_files", "Crime and Special Branch"),
    ("W", "w_files", "Station W (Western area) files"),
    ("FMP", "fmp_files", "French Municipal Files"),
    ("BW", "bw_files", "Bubbling Well Station reports"),
    ("SMP", "smp_file", "SMP file"),
    ("F", "f_files", "French Political Police"),
    ("FC", "fc_files", "Film censorship"),
    ("H", "h_files", "Headquarters staff"),
    ("CID", "cid_files", "Criminal Intelligence Division"),
    ("MIS", "mis_files", "Miscellaneous"),
]

def page_intro(name):
    """The prose paragraphs of a wiki page (no nav bar, headings or tables)."""
    paras = []
    for line in (WIKI / f"{name}.txt").read_text().splitlines():
        if not line.strip() or line.startswith(("[[start", "=", "^", "|", "<")):
            continue
        if line.startswith("  * ") or line.startswith("Rolls 1-60"):
            continue
        if "is being checked through for OCR errors" in line:
            continue  # stale progress notes from the wiki
        line = line.replace(" This page will remain **Under Construction**.", "")
        paras.append(inline(line.strip()))
    return paras

smp_ids = set((SRC / "smp_files_ids.txt").read_text().split())
records = []

def add(series, box, roll, file, title, link_cell, pages, tags, date, notes, **extra):
    links, link_note = links_of(link_cell)
    for l in links:
        if l["t"] == "file" and l["id"].split("-")[-1] in smp_ids:
            l["smp"] = "https://ray-bot-ai.github.io/smp-files/file.html?id=" + l["id"].split("-")[-1]
    title = clean(title)
    rec = {
        "s": series, "box": clean(box), "roll": clean(roll), "f": clean(file),
        "t": title, "links": links, "ln": link_note, "pg": num(pages),
        "tags": clean(tags), "d": clean(date), "y": year_of(date) or year_of(title), "n": clean(notes),
    }
    rec.update({k: v for k, v in extra.items() if v})
    records.append(rec)

# D files: the extended spreadsheet export
for r in csv.DictReader(open(SRC / "d_files.csv", newline="")):
    add("D", r["box"], r["roll"], r["file"], r["title"], r["links"], r["pages"], r["tags"], r["date"], r["notes"],
        lm=r["link_method"], td=r["transcribed_d_number"], chk=r["image_check"])

# all other groups: straight from the wiki tables
for key, page, _ in GROUPS[1:]:
    for head, rows in tables((WIKI / f"{page}.txt").read_text()):
        if "folder title/contents" not in head:
            continue
        col = {h: i for i, h in enumerate(head)}
        for cells in rows:
            cells += [""] * (len(head) - len(cells))
            g = lambda h: cells[col[h]] if h in col else ""
            date = g("date")
            if "date" in col and head.count("date") > 1:  # CID page has two Date columns
                date = cells[len(head) - 1 - head[::-1].index("date")] or cells[col["date"]]
            add(key, g("box"), g("roll"), g("file"), g("folder title/contents"), g("link"), g("pages"), g("tags"), date, g("notes"),
                lm="wiki" if "smpa-files-" in g("link") else "")

# ---------------------------------------------------------------- citations

cite_page = (WIKI / "files_cited_in_scholarship.txt").read_text()
books = {}
for m in re.finditer(r"^  \* (\w+) (.+)$", cite_page, re.M):
    books[m.group(1)] = inline(m.group(2))
cites = []
for head, rows in tables(cite_page):
    if head and head[0] == "file":
        for cells in rows:
            key = cells[0].strip()
            refs = []
            for ref in cells[1].split():
                m = re.match(r"(\w+):([\w\-]+)(?:,(\w+))?", ref)
                if m:
                    refs.append({"b": m.group(1), "p": m.group(2), "fn": m.group(3)})
            m = re.match(r"([A-Z]+)?\s*(.*)", key)
            series = m.group(1) if m.group(1) in {g[0] for g in GROUPS} else "D"
            fileno = m.group(2) if m.group(1) in {g[0] for g in GROUPS} else key.lstrip("D")
            cites.append({"key": key, "s": series, "f": fileno, "refs": refs})

index = {}
for i, r in enumerate(records):
    index.setdefault((r["s"], canon(r["f"])), []).append(i)
unmatched_cites = 0
for c in cites:
    k = canon(c["f"])
    # the '(C)' suffix is often dropped or added between the index and the citing book
    hit = index.get((c["s"], k)) or index.get((c["s"], k + "C")) or (k.endswith("C") and index.get((c["s"], k[:-1])))
    c["hit"] = bool(hit)
    if hit:
        for i in hit:
            records[i].setdefault("cite", []).extend(c["refs"])
    else:
        unmatched_cites += 1

# ---------------------------------------------------------------- rolls

ia_rolls = {int(k): v for k, v in json.loads((SRC / "ia_rolls.json").read_text()).items()}
rolls = []
for head, rows in tables((WIKI / "roll_list.txt").read_text()):
    if head and head[0] == "roll":
        for cells in rows:
            n = num(cells[0])
            if n:
                rolls.append({"n": n, "cov": clean(cells[1]), "ia": ia_rolls.get(n)})

# ---------------------------------------------------------------- page sections

def bullet_list(text):
    items = [inline(m.group(1)) for m in re.finditer(r"^  \* (.+)$", text, re.M)]
    return items

start = (WIKI / "start.txt").read_text()
about = []
for line in start.splitlines():
    if line.startswith(("[[start", "=", "^", "|", "  ")) or not line.strip():
        continue
    if "managed by" in line or "Rolls and Files" in line or re.match(r"\[\[https://archive.org/details/smpa-1-3", line):
        continue  # contact/credit line and the roll link bar are handled elsewhere
    about.append(inline(line.strip()))
workflow = [inline(m.group(1)) for m in re.finditer(r"^  - (.+)$", start, re.M)]

group_info = []
for head, rows in tables(start):
    if head and head[0] == "file group":
        for cells in rows:
            name = clean(cells[0]).replace(" Files", "").replace(" File", "")
            group_info.append({"g": name, "rolls": clean(cells[1]), "desc": clean(cells[2]), "listed": clean(cells[3]), "status": clean(cells[4])})

n1482 = (WIKI / "n1482.txt").read_text()
filenote = {
    "title": re.search(r"^====== (.+?) ======", n1482, re.M).group(1),
    "lines": [inline(l.strip()) for l in n1482.splitlines() if l.strip() and not l.startswith(("[[start", "======"))],
}

sections = {
    "about": about,
    "workflow": workflow,
    "groups": group_info,
    "group_intros": {k: page_intro(p) for k, p, _ in GROUPS},
    "group_desc": {k: d for k, _, d in GROUPS},
    "bibliography": {"intro": page_intro("bibliography"), "items": bullet_list((WIKI / "bibliography.txt").read_text())},
    "resources": bullet_list((WIKI / "resources.txt").read_text()),
    "cited": {"intro": [p for p in page_intro("files_cited_in_scholarship")], "books": books, "files": cites},
    "rolls": rolls,
    "filenote": filenote,
}

data = {"records": records, "sections": sections}
(ROOT / "data").mkdir(exist_ok=True)
(ROOT / "data" / "data.js").write_text("window.SMPA=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")

# ---------------------------------------------------------------- downloads

(ROOT / "downloads").mkdir(exist_ok=True)
with open(ROOT / "downloads" / "smpa-files.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["group", "box", "roll", "file", "title", "date", "year", "pages", "tags", "notes",
                "ia_file_links", "ia_roll_links", "other_links", "smp_files_links", "link_note", "link_method", "cited_in"])
    for r in records:
        L = r["links"]
        w.writerow([r["s"], r["box"], r["roll"], r["f"], r["t"], r["d"], r["y"] or "", r["pg"] or "", r["tags"], r["n"],
                    " ".join(l["u"] for l in L if l["t"] == "file"), " ".join(l["u"] for l in L if l["t"] == "roll"),
                    " ".join(l["u"] for l in L if l["t"] == "other"), " ".join(l["smp"] for l in L if l.get("smp")),
                    r["ln"], r.get("lm", ""),
                    " ".join(f'{c["b"]}:{c["p"]}' + (f',{c["fn"]}' if c["fn"] else "") for c in r.get("cite", []))])
(ROOT / "downloads" / "smpa-files.json").write_text(json.dumps(records, ensure_ascii=False, indent=1))

by = {}
for r in records:
    by[r["s"]] = by.get(r["s"], 0) + 1
print(len(records), "records", by)
print("with individual IA file link:", sum(any(l["t"] == "file" for l in r["links"]) for r in records))
print("with roll link only:", sum(not any(l["t"] == "file" for l in r["links"]) and any(l["t"] == "roll" for l in r["links"]) for r in records))
print("citations:", len(cites), "unmatched:", unmatched_cites, "| rolls:", len(rolls))
