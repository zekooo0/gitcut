# Capturing a feature

This file is the single source of truth for writing `capture.json`: what the robot opens,
clicks and measures in the live web app. The brief script sends it to the LLM as-is, so a rule
written here is a rule the model follows.

You decide only WHAT is filmed, not how the film tells it: a separate creative agent writes the
film from your screenshots. So capture generously and precisely.

## What to capture

- The feature, as the user sees it in the app: every screen and state it adds or changes.
- 2 to 6 shots. Include the states a click produces (an open menu, a picked option, an opened
  drawer, a switched tab), so the film can show the change, not only the result.
- Name every part worth pointing at in `elements` (the new button, the new column, the tile,
  the field): the film can only highlight what you measured.
- Never submit a destructive or persistent change on a shared staging environment: avoid Save,
  Delete, Send or Rebuild clicks in a capture. Show the edit state and the open menu; the film
  ends before the save.
- Stay in the demo workspace/account only. Never open a tenant/account switcher or anything that
  exposes another customer's data.

## capture.json (what the browser does)

```json
{
  "baseUrl": "https://staging.example.com",
  "viewport": { "width": 1440, "height": 900, "dpr": 2 },
  "login": {
    "url": "/login",
    "fields": { "input[name=email]": "DEMO_EMAIL", "input[name=password]": "DEMO_PASSWORD" },
    "submit": "role=button[name=/sign in|log in/i]",
    "waitFor": "text=Dashboard"
  },
  "panel": "auto",
  "hide": ["#hubspot-messages-iframe-container"],
  "shots": [
    { "name": "00-window", "kind": "window", "url": "/reports/overview", "waitFor": "text=Revenue" },
    { "name": "01-overview", "kind": "panel",
      "elements": { "kpi-revenue": { "text": "Revenue", "card": true }, "date-range": "role=combobox >> nth=0" } },
    { "name": "02-range-open", "kind": "panel", "full": false,
      "actions": [ { "click": "role=combobox >> nth=0" }, { "waitFor": "role=option >> nth=0" } ],
      "elements": { "this-year": "role=option[name=/^this year$/i]" } },
    { "name": "03-overview-year", "kind": "panel",
      "actions": [ { "click": "role=option[name=/^this year$/i]" }, { "wait": 1500 } ],
      "elements": { "kpi-revenue": { "text": "Revenue", "card": true } } }
  ]
}
```

Rules:

1. The FIRST shot is `kind: "window"` with a `url`: it is the full-window establishing shot.
2. Shots run in order in ONE browser tab. A shot without `url` continues from the state the
   previous shot left (an open menu, a picked date).
3. `kind`:
   - `window` = the whole viewport.
   - `panel` = the page's scroll container, stitched top to bottom. `"full": false` keeps only
     the visible part (use it for a state with an open menu or popover).
   - `element` = one element (`"element": "<selector>"`), for a drawer or a modal.
4. `actions`: `click`, `fill` + `value`, `select` + `value`, `press`, `hover`, `waitFor`,
   `wait` (ms), `goto` (path).
5. Selectors are Playwright selectors. Labels are often styled with CSS `text-transform`, so the
   DOM text can differ in case from what you see: ALWAYS match case-insensitively:
   `role=link[name=/sales & margin/i]`, `role=button[name=/save/i]`, `text=/weekly email/i`.
   Never use `text="..."` (quoted = exact case). Point at a field's LABEL, never at its
   placeholder or an example value from the code ("Select environment", "e.g. 30 days"):
   on staging the field is often already filled, so the placeholder is not on screen. Never use a bare CSS tag or class (`table`,
   `.MuiDataGrid-root`): tables, lists and cards are often drawn with divs. A whole table is
   `role=grid >> nth=0` or `role=table >> nth=0`; prefer naming one column header instead.
   A role selector's `name` is the ACCESSIBLE name. The discovery lists it as `name "..."` when it
   differs from the visible text (an aria-label): use that name in `role=...[name=...]`, or use
   `text=/<visible text>/i` instead. Do not anchor a name pattern with `^...$` around counts
   such as "(1)": counts change between runs.
6. `elements` names the parts the film points at. Each value is a selector, or
   `{ "text": "<exact visible label>", "card": true }` which finds the label inside the panel and
   walks up to its card. Use `card: true` for KPI tiles, chart cards and table cards, and
   `{ "text": "<label>", "field": true }` for one form row (its label plus its value or input). Names are
   kebab-case and unique within a shot.
7. `waitFor` waits for CONTENT (a heading or a number label), never only for the page to load.
8. Use only labels that appear in the page discovery you were given. Do not invent labels.
