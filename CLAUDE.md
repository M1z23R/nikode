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

## Angular Signals

**Use `model()` signals with two-way binding (`[(value)]="myModel"`) when no side effects are needed on value change.** Only use `signal()` with separate `[value]`/`(valueChange)` bindings when you need to run side-effect logic in the change handler.
