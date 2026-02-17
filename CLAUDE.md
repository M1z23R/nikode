# Nikode - Claude Code Instructions

## UI Components

**ALWAYS use `@m1z23r/ngx-ui` components instead of native HTML elements.**

Available components include:
- `ui-button` - buttons
- `ui-input` - text inputs
- `ui-checkbox` - checkboxes
- `ui-select` - dropdowns/selects (NOT native `<select>`)
- `ui-radio` / `ui-radio-group` - radio buttons (supports `variant="segmented"` for segment controls)
- `ui-modal` - modals/dialogs
- `ui-dropdown` - dropdown menus
- `ui-tabs` - tab navigation
- `ui-accordion` - accordions
- `ui-toast` - toast notifications

**Never use native HTML form elements like `<select>`, `<input>`, `<button>` when an ngx-ui equivalent exists.**
