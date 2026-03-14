# Unified Collection Import Design

## Overview

Rework the collection import flow to be clearer and more unified. Replace the current "Open Collection" and "New Collection" buttons with a single "Add Collection" button that opens a dialog with explicit format options.

## Goals

1. Eliminate ambiguity between "Open" and "Import" flows
2. Support Bruno collections (folder-based format)
3. Provide clear, explicit format selection instead of auto-detection guessing
4. Unify local and cloud collection creation in one dialog

## Dialog UI

Single "Add Collection" button in sidebar header opens a dialog:

```
┌──────────────────────────────────────────┐
│  Add Collection                      [X] │
├──────────────────────────────────────────┤
│  ┌──────────────────────────────────┐    │
│  │  ○ Local       ○ Cloud           │    │
│  └──────────────────────────────────┘    │
│                                          │
│  ┌──────────┐  ┌──────────┐              │
│  │    +     │  │   { }    │              │
│  │   New    │  │ OpenAPI  │              │
│  └──────────┘  └──────────┘              │
│  ┌──────────┐  ┌──────────┐              │
│  │   PM     │  │   BR     │              │
│  │ Postman  │  │  Bruno   │              │
│  └──────────┘  └──────────┘              │
│                                          │
└──────────────────────────────────────────┘
```

### Components

- `ui-radio-group` with `variant="segmented"` for Local/Cloud toggle
- Grid of styled `ui-button` elements for format options
- Each button displays an icon and label

### Behavior

- **OpenAPI/Postman buttons:** Open OS file picker (`.json`, `.yaml`, `.yml`)
- **Bruno button:** Open OS folder picker
- **New button:** Expand inline to show name input + optional template dropdown
- **Auto-detection fallback:** If `.nikode.json` selected via any picker, skip conversion and open directly

## Import Flow

### For OpenAPI, Postman, or Bruno

1. User clicks format button
2. Dialog closes
3. OS picker opens (file for OpenAPI/Postman, folder for Bruno)
4. If user cancels picker → nothing happens
5. If user selects file/folder:
   - **Local mode:** Show save dialog for `.nikode.json` destination
   - **Cloud mode:** Convert in temp location, upload to cloud workspace
6. Conversion runs
7. Collection opens in sidebar
8. Toast: "Collection imported successfully"

### For New Collection

1. User clicks "New" button
2. Dialog expands to show:
   - Name input field (required)
   - Template dropdown (optional)
3. User fills form and clicks "Create"
4. **Local mode:** Show save dialog for location
5. **Cloud mode:** Create directly in cloud workspace
6. Collection opens in sidebar

### Error Handling

- If format detection fails: Toast "Could not detect collection format"
- If conversion fails: Toast with error details
- If file/folder picker cancelled: No action, no error

## Bruno Converter

### Bruno Collection Structure

```
my-collection/
├── bruno.json           # Collection metadata
├── environments/
│   ├── dev.bru          # Environment files
│   └── prod.bru
├── auth/
│   ├── login.bru        # Request files
│   └── logout.bru
└── users/
    ├── folder.bru       # Optional folder metadata
    ├── get-users.bru
    └── create-user.bru
```

### Bruno `.bru` File Format

```bru
meta {
  name: Get Users
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/users
  body: none
  auth: bearer
}

headers {
  Content-Type: application/json
}

auth:bearer {
  token: {{accessToken}}
}
```

### Conversion Mapping

| Bruno | Nikode |
|-------|--------|
| `bruno.json` name | Collection name |
| Folders containing `.bru` files | Folder items |
| `*.bru` request files | Request items |
| `environments/*.bru` | Environments |
| `vars` block | Environment variables |
| `headers` block | Request headers |
| `body` block | Request body |
| `auth` block | Request auth |
| `meta.seq` | Item ordering |

### Implementation

- New `BrunoConverter` class in `electron/services/bruno-converter.js`
- Line-based parser for `.bru` DSL format
- Recursive folder walker to build collection tree
- Map Bruno auth types (bearer, basic, etc.) to Nikode auth model

## Code Changes

### Files to Modify

1. **Sidebar component** (`src/app/features/sidebar/`)
   - Replace two buttons with single "Add Collection" button
   - Update to use new dialog

2. **Open Collection Dialog** (`src/app/features/sidebar/dialogs/open-collection.dialog.ts`)
   - Complete rewrite as "Add Collection" dialog
   - Add Local/Cloud segmented toggle
   - Add format button grid
   - Add inline "New" form expansion

3. **Collection Service** (`src/app/core/services/collection.service.ts`)
   - Simplify `openWithDialog()` or replace entirely
   - Add `importBruno(folderPath, targetPath)` method

4. **API Service** (`src/app/core/services/api.service.ts`)
   - Add `importBruno()` IPC call

5. **IPC handlers** (`electron/main.js` or `electron/ipc-handlers.js`)
   - Add handler for Bruno import IPC

### Files to Create

1. **Bruno Converter** (`electron/services/bruno-converter.js`)
   - `BrunoConverter` class with:
     - `.bru` file parser
     - Folder structure walker
     - Conversion to Nikode collection format

### Files to Delete

1. **New Collection Dialog** (`src/app/features/sidebar/dialogs/new-collection.dialog.ts`)
   - Functionality merged into unified "Add Collection" dialog

## Testing Considerations

- Test import of OpenAPI 2.0 and 3.x specs
- Test import of Postman v2.1 collections
- Test import of Bruno collections with various structures
- Test Local/Cloud toggle behavior
- Test auto-detection of `.nikode.json` files
- Test error handling for invalid/malformed files
- Test cancellation at each step
