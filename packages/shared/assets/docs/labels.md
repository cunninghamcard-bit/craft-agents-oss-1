# Label Configuration

Labels are additive tags that can be applied to sessions. Unlike statuses (which are exclusive — one per session), labels are multi-select (many per session). They support hierarchical organization via nested JSON trees.

## Storage Locations

- Config: `~/.craft-agent/workspaces/{id}/labels/config.json`
- Icons: `~/.craft-agent/workspaces/{id}/labels/icons/{labelId}.{svg,png,jpg,jpeg}`

## No Defaults

Unlike statuses, labels start empty. Users create whatever labels they need. There are no built-in or required labels.

## Hierarchical Labels (Nested Tree)

Labels form a nested JSON tree. Hierarchy is the structure itself — parent/child relationships are expressed via the `children` array. Array position determines display order (no `order` field needed).

**Example:**
```json
{
  "version": 1,
  "labels": [
    {
      "id": "eng",
      "name": "Engineering",
      "color": "info",
      "children": [
        {
          "id": "frontend",
          "name": "Frontend",
          "children": [
            { "id": "react", "name": "React", "icon": "⚛️" }
          ]
        },
        { "id": "backend", "name": "Backend" }
      ]
    },
    { "id": "bug", "name": "Bug", "icon": "🐛", "color": "error" }
  ]
}
```

This renders as a tree in the sidebar:
```
Engineering
  ├─ Frontend
  │    └─ React
  └─ Backend
Bug
```

**Rules:**
- IDs are simple slugs (lowercase alphanumeric + hyphens)
- IDs must be globally unique across the entire tree
- Maximum nesting depth: 5 levels
- Array position = display order (no `order` field)
- Filtering by a parent includes all descendants

## config.json Schema

```json
{
  "version": 1,
  "labels": [
    {
      "id": "bug",
      "name": "Bug",
      "color": "destructive",
      "icon": "🐛"
    },
    {
      "id": "feature",
      "name": "Feature",
      "color": "accent",
      "children": [
        { "id": "ui", "name": "UI" },
        { "id": "api", "name": "API" }
      ]
    }
  ]
}
```

## Label Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique slug, globally unique across tree (e.g., `"bug"`, `"frontend"`). Lowercase alphanumeric + hyphens. |
| `name` | string | Display name |
| `color` | EntityColor? | Optional color. System color string (e.g., `"accent"`, `"info/80"`) or custom object (`{ "light": "#hex", "dark": "#hex" }`). Cascades into colorable SVGs via `currentColor`. |
| `icon` | string? | Optional emoji (e.g., `"🐛"`), URL (auto-downloaded), or explicit local file path. Omit for no icon. |
| `valueType` | `'string' \| 'number' \| 'date'`? | Optional value type hint. Tells UI what input widget to show and agents what format to write. Omit for boolean (presence-only) labels. |
| `children` | LabelConfig[]? | Optional nested child labels. Array position = display order. |

## Color Format

Same as statuses — see [statuses documentation](./statuses.md#color-format) for full details on supported formats and common mistakes.

**System colors:** `"accent"`, `"info"`, `"success"`, `"destructive"`, `"foreground"` (with optional `/opacity` 0–100)

**Custom colors:** `{ "light": "#EF4444", "dark": "#F87171" }` — supports hex, OKLCH, RGB, HSL formats

## Icon Configuration

Icons live in the `labels/icons/` subfolder with the label ID as the filename.

**Emoji icons (quick and easy):**
```json
"icon": "🐛"
```

**URL icons (auto-downloaded):**
```json
"icon": "https://example.com/icon.svg"
```
URLs are automatically downloaded to `labels/icons/{id}.{ext}`.

**Explicit local path:**
```json
"icon": "labels/icons/my-icon.svg"
```

**No icon:** Omit the `icon` field entirely. Many labels won't need an icon.

## Session Labels

Sessions store labels as an array of strings. Boolean labels are bare IDs; valued labels use the `::` separator:

```json
{
  "labels": ["bug", "priority::3", "due::2026-01-30", "linear::https://linear.app/issue/ENG-456"]
}
```

- Labels are additive (a session can have zero or many labels)
- Boolean labels: `"bug"` — presence-only, no value
- Valued labels: `"priority::3"` — ID + value separated by `::`
- The `::` split happens on the first occurrence only (values may contain `::`)
- Invalid label IDs are silently filtered out at read time
- Deleting a label strips it from all sessions automatically (children are also removed)
- Hierarchical filtering: clicking a parent label shows sessions tagged with it or any descendant

### Value Types

Values are inferred from the raw string at parse time:

| Type | Format | Example |
|------|--------|---------|
| `number` | Finite number | `"priority::3"`, `"effort::0.5"` |
| `date` | ISO date (YYYY-MM-DD) | `"due::2026-01-30"` |
| `string` | Anything else | `"link::https://example.com"` |

**Inference order:** ISO date check → number check → string fallback.

The optional `valueType` in config is a hint only — the parser always infers from the raw value regardless.

## Adding Labels

Edit the workspace's `labels/config.json`:

```json
{
  "version": 1,
  "labels": [
    {
      "id": "bug",
      "name": "Bug",
      "color": "destructive",
      "icon": "🐛"
    },
    {
      "id": "priority",
      "name": "Priority",
      "valueType": "number"
    },
    {
      "id": "due",
      "name": "Due Date",
      "valueType": "date"
    },
    {
      "id": "project",
      "name": "Project",
      "children": [
        { "id": "alpha", "name": "Alpha", "color": "info" },
        { "id": "beta", "name": "Beta", "color": "success" }
      ]
    }
  ]
}
```

## Color and Icon Conventions

When creating or modifying labels, follow these conventions unless the user explicitly requests otherwise:

1. **Always add colors, skip icons by default.** Every label should have a `color` — but do NOT add an `icon` unless the user specifically asks for one.

2. **Use complementary colors within a category.** Sibling labels (children of the same parent) should use colors from the same family or hue range, creating a cohesive visual group. For example, a "Backend" group might use greens/teals for its children (API, Database), while "Frontend" uses indigos/blues (React, CSS).

3. **Match icon color to the emoji/icon.** When an icon IS added (because the user requested it), pick a `color` that visually complements the icon or emoji. For example:
   - 🐛 Bug → red/destructive tones
   - 🌐 Frontend → blue/indigo tones
   - 🔒 Security → red/dark tones
   - 📋 Meta → neutral/gray tones

**Color format reminder:** Use custom `{ "light": "#hex", "dark": "#hex" }` objects for sub-labels to get precise color control. Reserve system colors (`"accent"`, `"info"`, `"destructive"`, etc.) for top-level parent categories.

## SVG Icon Guidelines

- Size: 24x24
- Use `currentColor` for stroke/fill (theming support via color class)
- stroke-width: 2
- stroke-linecap: round
- stroke-linejoin: round

## Validation

**IMPORTANT**: Always validate after creating or editing labels:

```
config_validate({ target: "labels" })
```

This validates:
- Valid JSON and recursive schema structure
- Globally unique IDs across the entire tree
- Valid slug format (lowercase alphanumeric with hyphens)
- Maximum nesting depth (5 levels)

## Sidebar Behavior

Labels appear in the left sidebar as a multi-level expandable section:

```
All Chats    (flat, total count)
Flagged      (flat, flagged count)
States       (expandable → status sub-items)
Labels       (expandable → hierarchical tree)
────────────
Sources      (expandable → API/MCP/Local)
Skills       (flat)
────────────
Settings     (flat)
```

Clicking a label filters the session list to show sessions with that label. Clicking a parent label includes sessions tagged with any descendant.

## Design Decisions

- **Nested JSON tree**: Hierarchy is the structure itself — no conventions to learn
- **Array position = order**: No `order` field needed, array position determines display order
- **Globally unique IDs**: Simple slugs, unique across the entire tree
- **No categories**: Labels don't affect inbox/archive filtering (that's what statuses are for)
- **No defaults**: Workspaces start with zero labels
- **No fixed labels**: All labels are fully user-controlled (deletable, renameable)
- **Multi-select**: Sessions store `labels: string[]`, not a single value
- **Delete cascade**: Deleting a label removes it and all descendants from sessions
- **Max depth 5**: Prevents excessively deep hierarchies
- **Hierarchical filtering**: Parent label clicks include all descendant sessions
- **Icons subfolder**: All icons in one `labels/icons/` dir — simpler than one folder per label
- **Values via `::` separator**: Simple, flat string storage — no schema changes to session format
- **Type inference at parse time**: Parser always infers (date → number → string), `valueType` is just a UI hint
- **Date-only format**: ISO `YYYY-MM-DD` — no time component, avoids timezone complexity
