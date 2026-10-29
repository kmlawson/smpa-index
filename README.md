# Shanghai Municipal Police Files

A browsable, filterable and searchable index of the files in the Shanghai Municipal Police archive microfilm (NARA M1750, 67 rolls), with links to the scans on the Internet Archive.

**Site:** https://kmlawson.github.io/smpa-index/

It replaces the old SMPA DokuWiki. The wiki's pages are now collapsible sections of one page:
- About
- Microfilm Rolls
- File Groups
- Files Cited in Scholarship
- Bibliography
- Other Resources
- File Notes

Every file group in the wiki (D, IO, N, U, CS, W, FMP, BW, SMP, F, FC, H, CID, MIS) is in a single file index. The index has:
- full-text search, with phrases, exclusions and field prefixes
- filters by group, roll, year, kind of scan link, link source, citation in scholarship and availability of a transcription
- sortable columns and expandable details
- CSV export of the current selection

The search and filters are kept in the URL, so a view can be bookmarked.

## Data

- `source/wiki/` — the pages of the old wiki, in DokuWiki markup.
- `source/d_files.csv` — the wiki's D-file table, extended with links to the individual files on the Internet Archive. Most of those links were matched automatically. The match method is recorded in `link_method`:
  - D-number in the IA title
  - folder-title match
  - D-number in the smp-files transcription plus title
  - D-number read from the file cover

  `transcribed_d_number` is the D-number shown in the smp-files transcription. `image_check` records links whose file cover was checked against the folder.
- `source/ia_rolls.json` — the microfilm rolls available on the Internet Archive.
- `source/smp_files_ids.txt` — the Internet Archive items with a transcription on [smp-files](https://ray-bot-ai.github.io/smp-files/).

`python3 build.py` turns these into `data/data.js` (loaded by the page) and the downloads in `downloads/` (`smpa-files.csv`, `smpa-files.json`). The site is static and needs no build step on GitHub Pages; `index.html` also works opened straight from disk.

A database is not needed: the index has about 3,900 records (1.3 MB) and is searched in the browser.

Keep in mind that claims in these documents must be read with great care. SMP police records are full of stereotypes, rumour, gossip, slander and unsubstantiated claims about the people they report on.
