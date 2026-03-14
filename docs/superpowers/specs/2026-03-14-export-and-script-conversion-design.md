# Export Functionality & Script Conversion Design

## Overview

Add export functionality for Postman and Bruno formats, plus bi-directional script conversion between `nk.*`, `pm.*`, and `bru.*` APIs.

## Goals

1. Export Nikode collections to Postman Collection v2.1 format
2. Export Nikode collections to Bruno folder structure
3. Improve existing OpenAPI export
4. Bi-directional script conversion (common subset only, unsupported code commented out)

## Non-Goals

- Full script API compatibility (only common subset)
- WebSocket export (not supported by Postman/Bruno)
- XML schema validation conversion

## Phases

- **Phase 1**: Export functionality with script passthrough (warning header)
- **Phase 2**: Smart script conversion for common API subset

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Angular Frontend                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           ExportCollectionDialog                     │   │
│  │    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      │   │
│  │    │ Nikode │ │Postman │ │ Bruno  │ │OpenAPI │      │   │
│  │    └────────┘ └────────┘ └────────┘ └────────┘      │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC
┌──────────────────────────▼──────────────────────────────────┐
│                    Electron Backend                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Export Handlers                     │   │
│  │   export-nikode │ export-postman │ export-bruno      │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Converters                         │   │
│  │  ┌────────────────┐ ┌────────────────┐               │   │
│  │  │postman-conv.js │ │ bruno-conv.js  │               │   │
│  │  │ + exportTo()   │ │ + exportTo()   │               │   │
│  │  └───────┬────────┘ └───────┬────────┘               │   │
│  │          └──────────┬───────┘                        │   │
│  │          ┌──────────▼────────┐                       │   │
│  │          │ script-converter  │  (Phase 2)            │   │
│  │          │ nk ↔ pm ↔ bru     │                       │   │
│  │          └───────────────────┘                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Mapping

### Postman Collection v2.1 Export

| Nikode | Postman |
|--------|---------|
| `collection.name` | `info.name` |
| `collection.version` | `info.version` |
| `collection.items[]` | `item[]` (recursive) |
| folder | `item` with nested `item[]` |
| request | `item` with `request{}` |
| `method` | `request.method` |
| `url` | `request.url` (object with raw, host, path, query) |
| `headers` | `request.header[]` |
| `body` | `request.body` (mode + content) |
| `auth` | `request.auth` |
| `scripts.pre` | `event[listen=prerequest]` |
| `scripts.post` | `event[listen=test]` |
| `environments[]` | Separate `.postman_environment.json` file |
| `variables[]` | `values[]` |
| `secret=true` | `value=""` + placeholder comment |

### Bruno Folder Export

| Nikode | Bruno |
|--------|-------|
| `collection.name` | `bruno.json` + folder name |
| `collection.items[]` | Folder structure |
| folder | Subdirectory |
| request | `<name>.bru` file |
| `method/url` | `http`/`get`/`post`/etc block |
| `headers` | `headers {}` block |
| `params` | `query {}` block |
| `body` | `body:json`/`form`/etc `{}` block |
| `auth` | `auth:bearer`/`basic`/`apikey {}` block |
| `scripts.pre` | `script:pre-request {}` block |
| `scripts.post` | `script:post-response {}` block |
| `environments[]` | `environments/<name>.bru` files |
| `variables[]` | `vars {}` block |
| `secret=true` | `vars:secret {}` block |

---

## Export Dialog UI

**Trigger:** Right-click collection → "Export" context menu item

**Layout:** Card-based grid (matching import dialog style)

- **Nikode** card → File picker → Save `.nikode.json`
- **Postman** card → File picker → Save `.postman_collection.json` + optional environment file
- **Bruno** card → Folder picker → Create folder with `.bru` files
- **OpenAPI** card → File picker (JSON/YAML option) → Save spec file

**Script warning:** All formats show warning if scripts exist:
> "This collection contains scripts. Scripts will be exported with nk.* API and may require manual conversion."

---

## Script Conversion (Phase 2)

### Common Subset Mapping

| Feature | nk.* | pm.* | bru.* |
|---------|------|------|-------|
| Get env | `nk.getEnv('key')` | `pm.environment.get('key')` | `bru.getEnvVar('key')` |
| Set env | `nk.setEnv('key', val)` | `pm.environment.set('key', val)` | `bru.setEnvVar('key', val)` |
| Get var | `nk.getVar('key')` | `pm.variables.get('key')` | `bru.getVar('key')` |
| Set var | `nk.setVar('key', val)` | `pm.variables.set('key', val)` | `bru.setVar('key', val)` |
| Response body | `nk.response.body` | `pm.response.text()` | `res.body` |
| Response JSON | `JSON.parse(nk.response.body)` | `pm.response.json()` | `res.getBody()` |
| Status code | `nk.response.statusCode` | `pm.response.code` | `res.statusCode` |
| Request URL | `nk.request.url` | `pm.request.url.toString()` | `req.url` |
| Request method | `nk.request.method` | `pm.request.method` | `req.method` |
| Console log | `console.log()` | `console.log()` | `console.log()` |

### Unsupported Features (Commented Out)

When converting FROM `nk.*`:

| Feature | Reason |
|---------|--------|
| `nk.test()` / `nk.assert()` | Different assertion APIs |
| `nk.getCookie()` / `nk.setCookie()` | Limited support in Bruno |
| `nk.validateSchema()` | No equivalent in Bruno |
| `nk.stopPolling()` | Nikode-specific |
| `nk.iteration` | Nikode-specific |

**Comment format:**
```javascript
// UNSUPPORTED in <target>: <feature>
// Original: <original code>
```

---

## Error Handling

### Export Errors

| Scenario | Handling |
|----------|----------|
| Invalid file path / no write permission | Error dialog, pick different location |
| Bruno folder already exists | Prompt: overwrite / pick new location |
| Empty collection | Allow export, create minimal valid structure |

### Data Edge Cases

| Scenario | Handling |
|----------|----------|
| Binary body type | Postman: reference file path; Bruno: skip with warning |
| GraphQL requests | Map to respective GraphQL format |
| WebSocket requests | Skip with warning in export report |
| Secret variables | Export with empty value + `// SECRET` comment |
| Special characters in names | Sanitize for filesystem (Bruno) |

### Export Report

```
Export Complete
───────────────
✓ 12 requests exported
✓ 3 folders exported
✓ 2 environments exported
⚠ 1 WebSocket request skipped (not supported)
⚠ 4 scripts contain nk.* API (manual conversion may be needed)
```

---

## File Changes

### Phase 1: Export Functionality

| File | Changes |
|------|---------|
| `electron/services/postman-converter.js` | Add `exportToPostman(collection)` |
| `electron/services/bruno-converter.js` | Add `exportToBruno(collection, targetPath)` |
| `electron/main.js` | Add IPC handlers: `export-postman`, `export-bruno`, `export-postman-env` |
| `shared/ipc-types.ts` | Add export channel types |
| `src/app/shared/dialogs/export-collection.dialog.ts` | Rewrite as card-based UI |
| `src/app/shared/dialogs/export-collection.dialog.html` | New template |
| `src/app/features/sidebar/` | Add "Export" to collection context menu |
| `electron/preload.js` | Expose new IPC channels |

### Phase 2: Script Conversion

| File | Changes |
|------|---------|
| `electron/services/script-converter.js` | New file - conversion functions |
| `electron/services/postman-converter.js` | Integrate script converter |
| `electron/services/bruno-converter.js` | Integrate script converter |

---

## Success Criteria

1. Can export any Nikode collection to Postman format and import in Postman
2. Can export any Nikode collection to Bruno folder and open in Bruno
3. Environments exported correctly (separate file for Postman, folder for Bruno)
4. Scripts exported with appropriate warnings (Phase 1)
5. Common script API calls converted correctly (Phase 2)
6. Unsupported features clearly commented out (Phase 2)
7. Export report shows what was exported/skipped
