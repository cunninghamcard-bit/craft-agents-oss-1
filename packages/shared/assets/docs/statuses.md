# Status Configuration

Session statuses represent workflow states. Each workspace has its own status configuration.

## Storage Locations

- Config: `~/.craft-agent/workspaces/{id}/statuses/config.json`
- Icons: `~/.craft-agent/workspaces/{id}/statuses/icons/`

## Default Statuses

| ID | Label | Default Color | Category | Type |
|----|-------|---------------|----------|------|
| `backlog` | Backlog | text-foreground/50 | open | Default |
| `todo` | Todo | text-foreground | open | Fixed |
| `needs-review` | Needs Review | text-info | open | Default |
| `done` | Done | text-accent | closed | Fixed |
| `cancelled` | Cancelled | text-foreground/50 | closed | Fixed |

**Note:** Color is optional. When omitted, the design system default is used.

## Status Types

- **Fixed** (`isFixed: true`): Cannot be deleted or renamed. Required statuses: `todo`, `done`, `cancelled`.
- **Default** (`isDefault: true`): Ships with app, can be modified but not deleted.
- **Custom** (`isFixed: false, isDefault: false`): User-created, fully editable and deletable.

## Category System

- **open**: Session appears in inbox/active list
- **closed**: Session appears in archive/completed list

## config.json Schema

```json
{
  "version": 1,
  "statuses": [
    {
      "id": "todo",
      "label": "Todo",
      "category": "open",
      "isFixed": true,
      "isDefault": false,
      "order": 0
    }
  ],
  "defaultStatusId": "todo"
}
```

**Note:** The `icon` field is optional. Default statuses use auto-discovered SVG files from `statuses/icons/{id}.svg`.

## Status Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique slug (lowercase, hyphens) |
| `label` | string | Display name |
| `color` | string? | Optional color (hex or Tailwind class). Uses design system default if omitted. |
| `icon` | string? | Optional emoji (e.g., `"🔥"`) or URL. Omit to use auto-discovered file. |
| `category` | `"open"` \| `"closed"` | Inbox vs archive |
| `isFixed` | boolean | Cannot delete/rename if true |
| `isDefault` | boolean | Ships with app, cannot delete |
| `order` | number | Display order (lower = first) |

## Icon Configuration

Icon resolution priority:
1. **Local file** - Auto-discovered from `statuses/icons/{id}.svg` (or .png, .jpg, .jpeg)
2. **Emoji** - If `icon` field is an emoji string (e.g., `"🔥"`)
3. **Fallback** - Bullet character if no icon found

**File-based icons (recommended for default statuses):**
- Place SVG in `statuses/icons/{status-id}.svg`
- No config needed - auto-discovered by status ID
- Example: `statuses/icons/blocked.svg` for status ID `blocked`

**Emoji icons (quick and easy):**
```json
"icon": "🔥"
```

**URL icons (auto-downloaded):**
```json
"icon": "https://example.com/icon.svg"
```
URLs are automatically downloaded to `statuses/icons/{id}.{ext}`.

**⚠️ Icon Sourcing Rules:**
- **DO** generate custom SVG files following the guidelines below
- **DO** download icons from the web (e.g., Heroicons, Feather, Simple Icons)
- **DO** use emoji for quick, universal icons

## Adding Custom Statuses

Edit the workspace's `statuses/config.json`:

```json
{
  "id": "blocked",
  "label": "Blocked",
  "color": "#EF4444",
  "icon": "🚫",
  "category": "open",
  "isFixed": false,
  "isDefault": false,
  "order": 3
}
```

Adjust `order` values for existing statuses as needed.

## SVG Icon Guidelines

- Size: 24x24
- Use `currentColor` for stroke/fill (theming support)
- stroke-width: 2
- stroke-linecap: round
- stroke-linejoin: round

## Self-Healing

- Missing icon files are auto-recreated from embedded defaults
- Invalid status IDs on sessions fallback to `todo`
- Corrupted configs reset to defaults

## Validation

**IMPORTANT**: Always validate after creating or editing statuses:

```
config_validate({ target: "statuses" })
```

This validates:
- Required fixed statuses exist (`todo`, `done`, `cancelled`)
- No duplicate status IDs
- `defaultStatusId` references an existing status
- Icon files exist when referenced
- At least one status in each category (open/closed)

Invalid configs will fall back to defaults at runtime, but validation catches issues before they cause problems.
