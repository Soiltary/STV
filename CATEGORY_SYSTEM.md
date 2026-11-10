# CATEGORY_SYSTEM (1.3.x)

## Data (inside `solitary.settings.v3`, same storage as before: localStorage + SharedPreferences mirror)
| Key | Meaning |
|---|---|
| `categories` | ordered list `{id, name, key, icon, apps[], hidden, tab, row, sort}`; built-ins `live`, `movies`, `anime`, `music` (name = translation key until renamed) |
| `catsSeeded` | built-in categories were filled once with **installed** apps from a suggestion list (never fake shortcuts) |
| `homeRows` | Home row order: `favorites` + category ids |
| `homeRowsHidden` | only `favorites` can be listed here; a category's own `row` flag decides whether its row shows |
| `recent` | `{packageId: lastLaunchMs}` written only after a real launch succeeded (max 100) — used by "Recently used" sort |

Rules live in `assets/site/js/model.js` (pure functions) and are unit-tested in `web-tests/model.test.cjs`:
- an app is linked by its real package id and may be in several categories; never twice in one;
- removing/moving an app only touches the named categories; deleting a category removes only the grouping
  (apps, favorites, Home slots untouched); a confirmation is shown when the category still has apps;
- names: 1–40 chars, trimmed, no duplicates (case-insensitive, includes built-in labels), Arabic/English both fine;
- uninstalled ids stay stored but are not shown; "Most used" is not offered (no reliable usage data without extra permissions).

## UI (remote only)
- Top bar: Home · Apps · Favorites · [category tabs] · Store · Settings · screensaver · quick panel. It scrolls
  sideways inside itself (fade on the side that has more tabs); the active tab is kept near the centre.
- Home: the old first screen (clock, weather, prayer, 5 slots) is unchanged; below it horizontal rows
  (Favorites + categories), each with "Open · n".
- Long-press OK on an app: Open · Add/Remove Favorites · Add to Category (multi-select ✓) · Remove from “X” /
  Remove from Category · Move to Category · Reorder (manual sort) · Add/Remove Home · App info.
- Category page: Sort chip (Manual / Alphabetical / Recently used), Edit apps (✓ list), Manage (rename, tab on/off,
  Home row on/off, hide/show, move up/down, delete).
- Settings › Categories and Settings › Home screen (row order/visibility + the 5 slots).
