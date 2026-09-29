# Upstream Velo PR Shortlist — Top 100

Source: https://github.com/avihaymenahem/velo/pulls (228 PRs total; 47 open, 181 closed).
Compiled 2026-09-29 for the NAI E-Mail fork. Dependabot/CI-release noise excluded.

Legend:
- **NEW** — not in this fork yet; prime port candidate.
- **FORK** — already present in this fork (per AGENTS.md / source).
- **PAR** — parallel work: upstream built it, this fork has its own equivalent.
- **IDEA** — small/independent change worth cherry-picking as-is.

## A. New features (highest value)

1. **#185 — Claude tool-use AI Agent Panel** (egouilliard-leyton, open) — NEW
   Autonomous agent in a floating chat panel: manages subscriptions, summarizes inbox, searches mail; Ctrl+Shift+I. Complements this fork's MCP endpoint.
2. **#176 / #179–#184 — AI expansion pack: proofread, urgency, digest, meetings, relationships, filter suggestions** (egouilliard-leyton, merged+open) — NEW
   Proofread-before-send panel, urgency badges on ThreadCard, InboxDigestPanel, meeting-intent banner, ContactSidebar relationship summary, filter-rule suggestions. 7 per-feature toggles.
3. **#47 — JMAP email provider (RFC 8620/8621)** (avihaymenahem, merged) — NEW
   Third provider beside Gmail API and IMAP: Fastmail, Stalwart, Cyrus 3.8+; pure TS, delta sync via Email/changes. Big new surface.
4. **#291 — metadata-first sync with lazy body loading** (heathweaver, open) — NEW (perf)
   Index headers only during sync; fetch bodies on thread open. Biggest sync-speed win available.
5. **#242 — "Custom (OpenAI Compatible)" AI provider** (wynn5a, open) — NEW
   Any OpenAI-compatible endpoint (Azure, Groq, Together); better error surfacing in Test Connection.
6. **#277 — Amazon Bedrock AI provider** (archie-yqshou, open) — NEW
   Claude via Bedrock InvokeModel; API-key auth + region, no SigV4 needed.
7. **#296 — import Google address book into recipient autocomplete** (glibt, WIP/open) — NEW
   People API saved + "Other contacts" imported daily, frequency-preserving upsert, conservative merge.
8. **#295 — populate recipient autocomplete from synced mail** (glibt, WIP/open) — NEW
   Background contact mining from messages table (senders + sent recipients), watermark-based, excludes noreply/bounce.
9. **#275 — "all time" sync period (entire mailbox)** (joshuacv, open) — NEW
   2y/5y/all-time options; also fixes `parseInt || 365` swallowing a legit 0.
10. **#202 — full i18n (EN/IT, 12 namespaces)** (f-liva, open) — PAR
    This fork already ships i18n (EN/CS/SK/VI) — upstream is a parallel implementation; nothing to port, but the completeness-test idea is worth stealing.
11. **#247 / #249 — Japanese localization with react-i18next** (atani, closed+open) — PAR/IDEA
    JA translation + Gmail setup UX; the easy/advanced Gmail flow (see #248) is the real takeaway.
12. **#248 — Gmail setup UX: easy (IMAP+App Password) vs fast (API) paths** (atani, open) — NEW
    Two-path wizard, inline App Password guide, Gmail added to IMAP auto-discovery.
13. **#231 — install.cat installer scripts** (insign, open) — NEW
    One-command install for macOS/Linux/Windows from the repo.
14. **#132 — COPR (RPM) + Flatpak build workflows** (camden-bock, merged) — NEW
    Tauri native RPM bundling, Flatpak sandbox fixes, `npm run flatpak`.
15. **#65 — Homebrew tap distribution** (avihaymenahem, merged) — NEW (if wanted)
16. **#90 — AI auto-draft replies + full task manager** (avihaymenahem, merged) — FORK
    Fork already has writing-style drafts and the task manager (incl. recurrence, AI extraction).
17. **#294 — Shift+U toggle read/unread (multi-select semantics)** (glibt, WIP/open) — NEW
    Uniform toggle over selection; fixes a dead Shift-binding bug in the recorder + unread-undo race.
18. **#270 — focused default sidebar for first launch** (iiwish, closed) — IDEA
    Hide advanced entries (Starred/Snoozed/Tasks/Calendar…) by default; users with saved prefs keep their layout.
19. **#129 — sidebar customization + attachment library** (avihaymenahem, merged) — FORK
20. **#169 — GitHub Copilot as 5th AI provider** (avihaymenahem, merged) — FORK
21. **#134 — AI smart labels** (avihaymenahem, merged) — FORK
22. **#117 — CalDAV calendar integration** (avihaymenahem, merged) — FORK
23. **#119 — local AI via Ollama / LMStudio** (avihaymenahem, merged) — FORK
24. **#172 — Move to Folder/Label shortcut (V)** (avihaymenahem, merged) — FORK
25. **#174 — auto-advance to next thread after actions** (knabe, merged) — NEW/check
    Fork removes rows optimistically; verify the reading pane advances to the next thread (drafts variant #217 too).
26. **#213 — auto-focus To field when composing** (edvintb, merged) — IDEA
27. **#214 — Cmd/Ctrl+Enter to send in main Composer** (edvintb, merged) — FORK (already bound)
28. **#215 — Tab advances focus in composer address fields** (edvintb, merged) — NEW
29. **#216 — Cmd+, opens settings** (edvintb, merged) — FORK (already bound)
30. **#298 — attachment save / Quick Look / sender avatars / search fixes** (ArneNostitz, merged) — FORK
    Fork adopted all of it (save_attachment, quicklook_attachment, SenderAvatar, whole-mailbox search).
31. **#299 — chat view, sender history, "me:" marker** (ArneNostitz, merged) — FORK
32. **#301 — folder tag on search hits + parallel bulk actions** (ArneNostitz, merged) — FORK
    (Fork has folder pill + per-account bulk; verify parallel 6-at-a-time provider calls.)
33. **#300 — Mac app icon scaled to Apple HIG** (heathweaver, merged) — IDEA
34. **#266 — "phases 5–16" mega-branch** (Zakarialabib, closed-unmerged) — IDEA
    322 files / +35k: PGP, campaigns/mail-merge, compliance engine, workflow engine, quick replies, attachment vault, contact intelligence docs. Closed but a roadmap goldmine.

## B. IMAP / sync reliability

35. **#262 — IMAP reliability (DavMail/Exchange) + DB perf** (M4lmostoso, merged) — NEW
    Raw-TCP fetch fallback when bodies come back empty; WAL; reentrant write mutex; chunk 100.
36. **#188 — chunked IMAP sync with lightweight UID search** (avihaymenahem, merged) — FORK
    Fork batches 50; upstream went 200-UID chunks + `imap_search_folder`. Worth aligning.
37. **#286 / #271 — parenthesise multi-item IMAP FETCH lists** (seemopz / avtotor, merged) — NEW/check
    Strict servers (Stalwart) return empty bodies without `(UID FLAGS … BODY.PEEK[])`. Fork's client.rs may already be correct; verify.
38. **#272 — fetch IMAP messages in smaller chunks + surface sync errors** (avtotor, merged) — NEW/check
39. **#77 — IMAP sync OOM on large mailboxes + surfaced sync errors** (avihaymenahem, merged) — FORK
40. **#164 — reduce IMAP sync connection storm** (avihaymenahem, merged) — FORK (IDLE instead of polling)
41. **#171 — server-side IMAP SINCE date filter** (avihaymenahem, merged) — FORK
42. **#149 — TCP timeouts + keepalive to IMAP client** (avihaymenahem, merged) — FORK
43. **#194 — SQLite transaction errors during IMAP initial sync** (avihaymenahem, merged) — FORK
44. **#196 — IMAP sync reliability: error handling, retry, cleanup** (avihaymenahem, merged) — FORK
45. **#64 — optimize IMAP delta sync (single-connection batch check)** (avihaymenahem, merged) — FORK
46. **#44 — decode modified UTF-7 folder names + real UIDs** (avihaymenahem, merged) — FORK
47. **#48 / #50 / #92 / #122 — IMAP store/display/sent fixes** (avihaymenahem, merged) — FORK
48. **#151 — accept self-signed certificates for IMAP/SMTP** (avihaymenahem, merged) — NEW/check
49. **#106 — per-folder sync via F5 + context menu** (avihaymenahem, merged) — FORK
50. **#66 — prioritize new-account sync (kill startup delay)** (avihaymenahem, merged) — FORK

## C. SQLite / DB concurrency (the "database is locked" saga)

51. **#282 — remove raw BEGIN/COMMIT so transactions don't strand a pooled connection** (heathweaver, merged) — NEW/check
    Root-caused: tauri-plugin-sql pool + BEGIN/COMMIT across pooled connections = 5s stalls. Fork's withTransaction must be audited against this.
52. **#274 — serialize DB writes and drop unsupported transactions** (joshuacv, open) — NEW (same family)
    Autocommit + one in-process mutex; batches IMAP writes and yields to the event loop (no typing lag).
53. **#287 — run transactions on a dedicated SQLite connection** (seemopz, merged) — NEW (same family)
54. **#273 — stop spanning transactions across pooled connections** (avtotor, merged) — NEW (same family)
55. **#210 — SQLite busy errors + pool deadlocks (WAL, busy_timeout 15s)** (vpsir, open) — NEW (same family)
56. **#207 — busy deadlocks + sync status UI** (vpsir, closed) — NEW (same family)
57. **#154 — smart folder unread count SQL error + sync progress** (avihaymenahem, merged) — FORK

## D. Security

58. **#245 / #244 — harden HTTP capabilities, SSRF, crypto, SQL** (atani, open+closed) — NEW
    Localhost-only plain HTTP for AI; `isSafeUrl()` for unsubscribe (blocks loopback/private/169.254.x.x, no redirects); parameterized compactQueue; decryptField throws on failure + allSettled; OAuth token_url whitelist; 38 multi-part ccTLDs in phishing domain parsing.
59. **#293 — encode/escape header values in outgoing builder** (martinezooo, merged) — NEW
    RFC 2047 encoded-words, RFC 2231 filenames, header-break stripping, Message-ID domain fix. Security-relevant for send paths.
60. **#201 — remote images blocked by CSP despite setting** (f-liva, open) — NEW/check
    CSP img-src must include https:/http: for the block-toggle to actually control loading.
61. **#259 — allow non-default ports in Tauri HTTP plugin scope** (DirkScharff, open) — NEW/check
    `http://*` matches port 80 only; needs `http://*:*` for LM Studio :1234 / Ollama :11434.
62. **#218 — bind OAuth server to 127.0.0.1** (edvintb, merged) — FORK
63. **#25 — client secret missing in OAuth token exchange** (avihaymenahem, merged) — FORK
64. **#79 — Microsoft OAuth2 for Outlook/Hotmail/Live** (avihaymenahem, merged) — NEW/check
    Fork has Outlook IMAP auto-discovery; full OAuth2 provider may not be present.

## E. UI/UX polish

65. **#211 — sync status bar improvements** (vpsir, open) — PAR
    Fork uses a sync ring on the avatar; this is the bottom-bar approach. Pick one.
66. **#224 — improve sync status bar UX** (edvintb, merged) — PAR (same)
67. **#229 — aggregate sync status across accounts** (edvintb, merged) — FORK (unified-inbox status)
68. **#284 — reload the view the user is on, not the previous one** (heathweaver, merged) — NEW
    Debounced reload captured stale activeLabel; reloads now use a ref. Check fork's `velo-sync-done` handler.
69. **#285 — scheduled send via the provider (IMAP delivers)** (heathweaver, merged) — NEW
    `checkScheduledEmails` reached for Gmail client directly → IMAP marks failed. Fork's scheduled sends must go through `getEmailProvider`.
70. **#219 — UTC methods in iCal all-day formatting** (edvintb, open) — NEW/check
    All-day events shifted a day; fork's icalHelper should be audited.
71. **#288 — route CalDAV through the Rust HTTP client** (seemopz, merged) — NEW/check
72. **#289 — attach CalDAV to an existing account (same address)** (seemopz, merged) — NEW/check
73. **#290 — probe mail server host during CalDAV discovery** (seemopz, merged) — NEW/check
74. **#230 — enable link clicks in email iframe on macOS** (edvintb, open) — NEW/check
    Fork already solved WebKit menus + opener scope; verify links open in sandboxed iframe.
75. **#203 — native text-editing shortcuts in focused inputs** (knabe, open) — NEW/check
    Ctrl/Cmd+A/C/X/V/Z must bypass the app shortcut handler when an input is focused.
76. **#190 — wire up `h` snooze shortcut** (knabe, open) — NEW
    Snooze dialog existed; shortcut never registered. Fork's shortcuts table has no `h` either.
77. **#191 — Escape closes inline reply editor** (knabe, merged) — FORK
78. **#177 — optional space after colon in search operators** (knabe, merged) — FORK
79. **#95 — arrow-key navigation between messages in thread view** (avihaymenahem, merged) — NEW/check
80. **#93 — dimmed red highlight for spam threads** (avihaymenahem, merged) — NEW/check
81. **#163 — animated background strobe fix on Windows** (avihaymenahem, merged) — FORK
82. **#168 — background-attachment duplication (dark mode)** (bzaman, merged) — FORK
83. **#87 — glass panel opacity + composer backdrop animation** (avihaymenahem, merged) — FORK
84. **#85 — consolidate settings tabs 14 → 9** (avihaymenahem, merged) — FORK
85. **#31 — unify thread action bars into one top bar** (avihaymenahem, merged) — FORK
86. **#8 — expandable composer: full-page + pop-out** (avihaymenahem, merged) — FORK
87. **#9 — ContactSidebar quick actions, notes, shared files** (avihaymenahem, merged) — FORK
88. **#63 — View Source in message context menu** (avihaymenahem, merged) — NEW/check
89. **#14 — AI provider badge overflow on mobile** (avihaymenahem, merged) — FORK
90. **#270-related — sidebar defaults** — see #18 above.

## F. General reliability / architecture

91. **#30 — React best practices refactor (memory leaks, async, render opt)** (avihaymenahem, merged) — FORK
92. **#29 — full offline mode with optimistic UI + queue** (avihaymenahem, merged) — FORK
93. **#138 — parallelize Gmail sync + 429 rate-limit retry** (avihaymenahem, merged) — FORK/check
94. **#137 — Tauri native fetch for local AI (CORS bypass)** (avihaymenahem, merged) — FORK
95. **#150 — resolve local AI connection failures** (avihaymenahem, merged) — FORK
96. **#159 — model selection dropdowns for AI providers** (avihaymenahem, merged) — FORK
97. **#261 — Ollama connection permissions + AI language setting** (M4lmostoso, merged) — NEW/check
98. **#254 / #255 — separate SMTP credentials (username + password)** (SaschaOnTour, merged+open) — NEW
    Fork has `imap_username`; separate SMTP creds are a distinct, useful addition.
99. **#27 — optional IMAP/SMTP username field** (avihaymenahem, merged) — FORK
100. **#17 — IMAP/SMTP support with multi-provider OAuth2** (avihaymenahem, merged) — FORK

## Also worth a look (backlog of this fork's existing features, upstream originals)

- #1 split inbox, #2 send-as aliases, #3 smart folders, #4 SPF/DKIM/DMARC, #5 mute,
  #6 phishing detection, #7 quick steps, #22 Ask Inbox shortcut, #23 auto-update,
  #28 IMAP diagnostics, #35/#37/#40/#42 FS scope fixes, #52 starred folder fix,
  #61 About page, #81 pop-out router context, #83 UI/perf fixes, #102 signature HTML editor,
  #104/#115/#125 attachment preview fixes, #105 Tauri OS platform detection,
  #131 context-menu bugs, #135/#34 test hygiene, #149/#162 docs, #246 NVIDIA Linux workaround,
  #279 Linux AppImage EGL/OAuth fixes (medoix, open), #206 migration-14 repair (guysoft, open).

## Top 10 quick wins to port first

1. **#282** SQLite BEGIN/COMMIT fix (audit fork's withTransaction) — unblocks everything.
2. **#285** scheduled send via provider (IMAP accounts).
3. **#284** reload-the-view-you're-on fix.
4. **#245** security hardening (SSRF guard, ccTLD list, token_url whitelist).
5. **#293** header encoding/escaping in outgoing builder.
6. **#291** metadata-first sync + lazy bodies.
7. **#185** AI Agent Panel (Claude tool-use).
8. **#176/#179–#184** AI proofread/urgency/digest/meetings/relationships.
9. **#275** all-time sync period.
10. **#242/#277** Custom OpenAI-compatible + Bedrock providers.