# @m1z23r/ngx-ui Component Reference

A comprehensive guide to all components in the library.

## Table of Contents

- [Dialog/Modal System](#dialogmodal-system)
- [Toast System](#toast-system)
- [Loading System](#loading-system)
- [Validators](#validators)
- [Form Controls](#form-controls)
- [Display Components](#display-components)
- [Navigation Components](#navigation-components)
  - [Tabs (Declarative)](#tabs-declarative)
  - [Dynamic Tabs (Service-based)](#dynamic-tabs-service-based)
  - [Context Menu](#context-menu)
- [Layout Components](#layout-components)
- [Data Components](#data-components)
  - [Tree](#tree)
- [Split Pane](#split-pane)

---

## Dialog/Modal System

The dialog system provides a programmatic way to open modals with typed data and results.

### DialogService

```typescript
import { DialogService, DialogRef, DIALOG_DATA, DIALOG_REF } from '@m1z23r/ngx-ui';

@Component({ ... })
export class MyComponent {
  private dialogService = inject(DialogService);

  async openDialog() {
    const dialogRef = this.dialogService.open<MyDialog, MyData, MyResult>(MyDialog, {
      data: { title: 'Hello', message: 'World' },
      size: 'md',                    // 'sm' | 'md' | 'lg' | 'xl' | 'full'
      width: '500px',                // Custom width (overrides size)
      maxWidth: '90vw',
      closeOnBackdropClick: true,    // Default: true
      closeOnEscape: true,           // Default: true
      panelClass: 'custom-dialog',
    });

    const result = await dialogRef.afterClosed();
    console.log('Dialog returned:', result);
  }
}
```

### Creating a Dialog Component

```typescript
import { Component, inject } from '@angular/core';
import { ModalComponent, ButtonComponent, DIALOG_DATA, DIALOG_REF, DialogRef } from '@m1z23r/ngx-ui';

interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [ModalComponent, ButtonComponent],
  template: `
    <ui-modal [title]="data.title" size="sm">
      <p>{{ data.message }}</p>

      <ng-container footer>
        <ui-button variant="outline" (clicked)="cancel()">
          {{ data.cancelText || 'Cancel' }}
        </ui-button>
        <ui-button color="primary" (clicked)="confirm()">
          {{ data.confirmText || 'Confirm' }}
        </ui-button>
      </ng-container>
    </ui-modal>
  `,
})
export class ConfirmDialog {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<boolean>;
  readonly data = inject(DIALOG_DATA) as ConfirmDialogData;

  confirm() {
    this.dialogRef.close(true);
  }

  cancel() {
    this.dialogRef.close(false);
  }
}
```

### ModalComponent Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `title` | `string` | `''` | Modal header title |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl' \| 'full'` | `'md'` | Preset size |
| `width` | `string` | - | Custom CSS width |
| `maxWidth` | `string` | - | Custom max-width |
| `closeOnBackdropClick` | `boolean` | `true` | Close on backdrop click |
| `closeOnEscape` | `boolean` | `true` | Close on Escape key |
| `showCloseButton` | `boolean` | `true` | Show X button |
| `panelClass` | `string` | - | Custom CSS class |

### Form Dialog Example

```typescript
interface UserFormData {
  user?: { name: string; email: string };
}

@Component({
  selector: 'app-user-form-dialog',
  standalone: true,
  imports: [ModalComponent, ButtonComponent, InputComponent],
  template: `
    <ui-modal title="Edit User" size="md">
      <ui-input label="Name" [(value)]="name" />
      <ui-input label="Email" type="email" [(value)]="email" />

      <ng-container footer>
        <ui-button variant="outline" (clicked)="dialogRef.close()">Cancel</ui-button>
        <ui-button (clicked)="save()">Save</ui-button>
      </ng-container>
    </ui-modal>
  `,
})
export class UserFormDialog {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<{ name: string; email: string }>;
  readonly data = inject(DIALOG_DATA) as UserFormData;

  name = signal(this.data.user?.name || '');
  email = signal(this.data.user?.email || '');

  save() {
    this.dialogRef.close({ name: this.name(), email: this.email() });
  }
}

// Usage:
const ref = this.dialogService.open(UserFormDialog, {
  data: { user: { name: 'John', email: 'john@example.com' } }
});
const updated = await ref.afterClosed();
if (updated) {
  console.log('User updated:', updated);
}
```

---

## Toast System

Show non-blocking notifications.

### ToastService

```typescript
import { ToastService } from '@m1z23r/ngx-ui';

@Component({ ... })
export class MyComponent {
  private toastService = inject(ToastService);

  // Shorthand methods
  showSuccess() {
    this.toastService.success('Operation completed!', 'Success');
  }

  showError() {
    this.toastService.error('Something went wrong', 'Error');
  }

  showWarning() {
    this.toastService.warning('Please review your input');
  }

  showInfo() {
    this.toastService.info('New updates available');
  }

  // Full config
  showCustom() {
    const ref = this.toastService.show({
      message: 'Custom toast message',
      title: 'Optional Title',
      variant: 'success',           // 'success' | 'error' | 'warning' | 'info'
      duration: 5000,               // ms, 0 = no auto-dismiss
      position: 'top-right',        // 'top-right' | 'top-left' | 'top-center' |
                                    // 'bottom-right' | 'bottom-left' | 'bottom-center'
      dismissible: true,
      showProgress: true,
    });

    // Programmatic dismiss
    ref.dismiss();
  }

  // Dismiss all toasts
  clearAll() {
    this.toastService.dismissAll();
  }
}
```

---

## Loading System

Coordinate loading states across components.

### LoadingService

```typescript
import { LoadingService } from '@m1z23r/ngx-ui';

@Component({ ... })
export class MyComponent {
  private loadingService = inject(LoadingService);

  async loadData() {
    this.loadingService.start('fetch-users');
    try {
      await this.fetchUsers();
    } finally {
      this.loadingService.stop('fetch-users');
    }
  }

  // Check loading state (returns Signal<boolean>)
  isLoading = this.loadingService.isLoading('fetch-users');
  isAnyLoading = this.loadingService.isAnyLoading();
}
```

### LoadingDirective

Connect loading states to buttons:

```html
<ui-button uiLoading="fetch-users" (clicked)="loadData()">
  Fetch Users
</ui-button>
```

The button automatically shows a spinner when `fetch-users` is loading.

---

## Validators

Lightweight validation system for form inputs with built-in validators and custom validation support.

### Basic Usage

```typescript
import { Validators, ValidatorFn } from '@m1z23r/ngx-ui';

@Component({
  template: `
    <ui-input
      label="Email"
      [(value)]="email"
      [validators]="emailValidators"
    />
    <ui-input
      label="Username"
      [(value)]="username"
      [validators]="usernameValidators"
      [validatorFn]="noSpacesValidator"
    />
  `,
})
export class MyComponent {
  email = signal('');
  username = signal('');

  // Array of built-in validators
  emailValidators = [Validators.required, Validators.email];
  usernameValidators = [Validators.required, Validators.minLength(3), Validators.maxLength(20)];

  // Custom validator function
  noSpacesValidator: ValidatorFn = (value) => {
    if (typeof value === 'string' && value.includes(' ')) {
      return { key: 'noSpaces', message: 'Spaces are not allowed' };
    }
    return null;
  };
}
```

### Built-in Validators

| Validator | Description | Example |
|-----------|-------------|---------|
| `Validators.required` | Value must not be empty | `[Validators.required]` |
| `Validators.email` | Valid email format | `[Validators.email]` |
| `Validators.minLength(n)` | Minimum string length | `[Validators.minLength(3)]` |
| `Validators.maxLength(n)` | Maximum string length | `[Validators.maxLength(50)]` |
| `Validators.min(n)` | Minimum numeric value | `[Validators.min(0)]` |
| `Validators.max(n)` | Maximum numeric value | `[Validators.max(100)]` |
| `Validators.pattern(regex, msg?)` | Match regex pattern | `[Validators.pattern(/^[A-Z]/, 'Must start with uppercase')]` |
| `Validators.url` | Valid URL with protocol | `[Validators.url]` |
| `Validators.numeric` | Only numeric characters | `[Validators.numeric]` |
| `Validators.alphanumeric` | Only letters and numbers | `[Validators.alphanumeric]` |

### Input Validation Properties

When using validators, the input component exposes these signals and methods:

```typescript
@ViewChild('myInput') myInput!: InputComponent;

// Signals (reactive)
myInput.touched()      // boolean - has been blurred
myInput.dirty()        // boolean - value has changed
myInput.isValid()      // boolean - all validators pass
myInput.isInvalid()    // boolean - has validation errors
myInput.errors()       // ValidationError[] - all current errors
myInput.errorMessage() // string | null - first error message

// Full validation state object
myInput.validationState()
// Returns: {
//   touched: boolean,
//   dirty: boolean,
//   valid: boolean,
//   invalid: boolean,
//   errors: ValidationError[],
//   errorMessage: string | null,
//   classes: { touched, untouched, dirty, pristine, valid, invalid }
// }

// Methods
myInput.reset()           // Reset to initial state
myInput.markAsTouched()   // Mark as touched programmatically
myInput.markAsDirty()     // Mark as dirty programmatically
myInput.hasError('email') // Check if specific error exists
myInput.getError('email') // Get specific error object
```

### Controlling Error Display

Use `showErrorsOn` to control when validation errors appear:

```html
<!-- Show errors after blur (default) -->
<ui-input [validators]="validators" showErrorsOn="touched" />

<!-- Show errors after value changes -->
<ui-input [validators]="validators" showErrorsOn="dirty" />

<!-- Show errors immediately -->
<ui-input [validators]="validators" showErrorsOn="always" />
```

### Host CSS Classes

The input component applies validation state classes to its host element for external styling:

```scss
// Style invalid inputs that have been touched
ui-input.ui-input--touched.ui-input--invalid {
  // Custom styles
}

// Available classes:
// .ui-input--touched / .ui-input--untouched
// .ui-input--dirty / .ui-input--pristine
// .ui-input--valid / .ui-input--invalid
```

### Custom Validators

Create custom validators by implementing the `ValidatorFn` type:

```typescript
import { ValidatorFn, ValidationError } from '@m1z23r/ngx-ui';

// Simple validator
const noWhitespace: ValidatorFn = (value) => {
  if (typeof value === 'string' && /\s/.test(value)) {
    return { key: 'noWhitespace', message: 'Whitespace is not allowed' };
  }
  return null;
};

// Validator with parameters (factory function)
const exactLength = (length: number): ValidatorFn => {
  return (value) => {
    if (typeof value === 'string' && value.length !== length) {
      return { key: 'exactLength', message: `Must be exactly ${length} characters` };
    }
    return null;
  };
};

// Usage
validators = [Validators.required, noWhitespace, exactLength(6)];
```

### ValidationError Interface

```typescript
interface ValidationError {
  key: string;      // Unique identifier (e.g., 'required', 'email')
  message: string;  // Human-readable error message
}
```

---

## Form Controls

### Button

```html
<ui-button
  [variant]="'default'"           <!-- 'default' | 'outline' | 'ghost' | 'elevated' -->
  [color]="'primary'"             <!-- 'primary' | 'secondary' | 'danger' | 'success' | 'warning' -->
  [size]="'md'"                   <!-- 'sm' | 'md' | 'lg' -->
  [disabled]="false"
  [loading]="false"
  [type]="'button'"               <!-- 'button' | 'submit' | 'reset' -->
  (clicked)="onClick()">
  Click Me
</ui-button>
```

### Input

```html
<ui-input
  [(value)]="username"
  [type]="'text'"                 <!-- 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' -->
  [label]="'Username'"
  [placeholder]="'Enter username'"
  [hint]="'Min 3 characters'"
  [error]="errorMessage()"        <!-- Manual error (overrides validators) -->
  [disabled]="false"
  [readonly]="false"
  [required]="true"
  [validators]="myValidators"     <!-- Array of ValidatorFn -->
  [validatorFn]="customValidator" <!-- Single custom ValidatorFn -->
  [showErrorsOn]="'touched'"      <!-- 'touched' | 'dirty' | 'always' -->
/>
```

### Textarea

```html
<ui-textarea
  [(value)]="description"
  [label]="'Description'"
  [placeholder]="'Enter description...'"
  [hint]="'Optional field'"
  [error]="errorMessage()"
  [maxlength]="500"
  [resize]="'vertical'"           <!-- 'none' | 'vertical' | 'horizontal' | 'both' -->
/>
```

### Select

```html
<!-- Single select -->
<ui-select [(value)]="selectedCity" placeholder="Choose a city" [searchable]="true">
  <ui-option [value]="{ id: 1, name: 'NYC' }">New York</ui-option>
  <ui-option [value]="{ id: 2, name: 'LA' }">Los Angeles</ui-option>
  <ui-option [value]="{ id: 3, name: 'CHI' }">Chicago</ui-option>
</ui-select>

<!-- Multi-select -->
<ui-select [(value)]="selectedCities" [multiple]="true">
  @for (city of cities; track city.id) {
    <ui-option [value]="city">{{ city.name }}</ui-option>
  }
</ui-select>

<!-- Creatable select -->
<ui-select
  [(value)]="selectedTag"
  [creatable]="true"
  [deletable]="true"
  (created)="onTagCreated($event)"
  (deleted)="onTagDeleted($event)">
  @for (tag of tags(); track tag.id) {
    <ui-option [value]="tag">{{ tag.name }}</ui-option>
  }
</ui-select>

<!-- Custom option template -->
<ui-select [(value)]="selectedUser">
  <ng-template uiOptionTemplate let-user>
    <div class="user-option">
      <img [src]="user.avatar" />
      <span>{{ user.name }}</span>
    </div>
  </ng-template>
  @for (user of users; track user.id) {
    <ui-option [value]="user">{{ user.name }}</ui-option>
  }
</ui-select>
```

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `variant` | `'default' \| 'outlined' \| 'filled'` | `'default'` | Visual style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size |
| `multiple` | `boolean` | `false` | Allow multiple selections |
| `searchable` | `boolean` | `false` | Enable search filtering |
| `clearable` | `boolean` | `false` | Show clear button |
| `creatable` | `boolean` | `false` | Allow creating new options |
| `deletable` | `boolean` | `false` | Allow deleting options |

### Chip Input

```html
<ui-chip-input
  [(value)]="tags"
  [placeholder]="'Add tags...'"
  [label]="'Tags'"
  [allowDuplicates]="false"
  [autoAdd]="true"
  (added)="onChipAdded($event)"
  (removed)="onChipRemoved($event)"
/>

<!-- Custom chip template -->
<ui-chip-input [(value)]="filters">
  <ng-template uiChipTemplate let-item let-remove="remove">
    <span class="custom-chip" [class.active]="item.active">
      {{ item.label }}
      <button (click)="remove()">×</button>
    </span>
  </ng-template>
</ui-chip-input>
```

### Checkbox & Switch

```html
<ui-checkbox [(checked)]="agreed" [size]="'md'">
  I agree to the terms
</ui-checkbox>

<ui-switch [(checked)]="darkMode" [size]="'md'">
  Dark Mode
</ui-switch>
```

### Radio Group

```html
<!-- Default style -->
<ui-radio-group [(value)]="selectedPlan" [orientation]="'vertical'">
  <ui-radio [value]="'free'">Free Plan</ui-radio>
  <ui-radio [value]="'pro'">Pro Plan</ui-radio>
  <ui-radio [value]="'enterprise'">Enterprise</ui-radio>
</ui-radio-group>

<!-- Segmented style -->
<ui-radio-group [(value)]="view" [variant]="'segmented'">
  <ui-radio [value]="'list'">List</ui-radio>
  <ui-radio [value]="'grid'">Grid</ui-radio>
  <ui-radio [value]="'table'">Table</ui-radio>
</ui-radio-group>
```

### Slider

```html
<ui-slider
  [(value)]="volume"
  [min]="0"
  [max]="100"
  [step]="5"
  [label]="'Volume'"
  [showValue]="true"
/>
```

### File Chooser

```html
<ui-file-chooser
  [(value)]="files"
  [accept]="'image/*,.pdf'"
  [multiple]="true"
  [maxFileSize]="5242880"         <!-- 5MB in bytes -->
  [maxFiles]="10"
  [showFileList]="true"
  (filesRejected)="onRejected($event)"
/>
```

### Datepicker / Timepicker / Datetimepicker

```html
<ui-datepicker
  [(value)]="selectedDate"
  [label]="'Select Date'"
  [format]="'MM/dd/yyyy'"
  [minDate]="minDate"
  [maxDate]="maxDate"
  [clearable]="true"
/>

<ui-timepicker
  [(value)]="selectedTime"
  [format]="'12h'"                <!-- '12h' | '24h' -->
  [showSeconds]="false"
  [minuteStep]="15"
/>

<ui-datetimepicker
  [(value)]="selectedDateTime"
  [label]="'Event Date & Time'"
/>
```

---

## Display Components

### Badge

```html
<ui-badge [variant]="'primary'" [size]="'md'" [rounded]="true">
  New
</ui-badge>

<ui-badge [removable]="true" (removed)="onRemove()">
  Tag
</ui-badge>
```

### Alert

```html
<ui-alert
  [variant]="'warning'"           <!-- 'info' | 'success' | 'warning' | 'danger' -->
  [title]="'Warning'"
  [dismissible]="true"
  [showIcon]="true"
  (dismissed)="onDismiss()">
  Please check your input before submitting.
</ui-alert>
```

### Card

```html
<ui-card [variant]="'elevated'" [clickable]="true" (clicked)="onCardClick()">
  <ng-container card-header>
    <h3>Card Title</h3>
  </ng-container>

  <p>Card content goes here.</p>

  <ng-container card-footer>
    <ui-button size="sm">Action</ui-button>
  </ng-container>
</ui-card>
```

### Progress

```html
<!-- Linear progress -->
<ui-progress
  [value]="75"
  [max]="100"
  [variant]="'primary'"
  [showLabel]="true"
  [striped]="true"
  [animated]="true"
/>

<!-- Indeterminate -->
<ui-progress [indeterminate]="true" />

<!-- Circular progress -->
<ui-circular-progress
  [value]="60"
  [size]="'lg'"
  [showLabel]="true"
  [strokeWidth]="4"
/>
```

### Spinner

```html
<ui-spinner [size]="'md'" [variant]="'primary'" />
```

### Tooltip

```html
<button uiTooltip="Click to save" [tooltipPosition]="'top'">
  Save
</button>
```

---

## Navigation Components

### Dropdown

```html
<ui-dropdown [position]="'bottom-start'" [closeOnSelect]="true">
  <button uiDropdownTrigger>
    Actions <span>▼</span>
  </button>

  <ui-dropdown-item (clicked)="edit()">Edit</ui-dropdown-item>
  <ui-dropdown-item (clicked)="duplicate()">Duplicate</ui-dropdown-item>
  <ui-dropdown-divider />
  <ui-dropdown-item (clicked)="delete()" [disabled]="!canDelete">Delete</ui-dropdown-item>
</ui-dropdown>
```

### Context Menu

The `uiContextMenu` directive enables right-click context menus using the existing dropdown component.

```html
<!-- Define a dropdown without a trigger -->
<ui-dropdown #contextMenu [closeOnSelect]="true">
  <ui-dropdown-item (clicked)="cut()">Cut</ui-dropdown-item>
  <ui-dropdown-item (clicked)="copy()">Copy</ui-dropdown-item>
  <ui-dropdown-item (clicked)="paste()">Paste</ui-dropdown-item>
  <ui-dropdown-divider />
  <ui-dropdown-item (clicked)="delete()" [disabled]="!canDelete">Delete</ui-dropdown-item>
</ui-dropdown>

<!-- Attach context menu to any element -->
<div class="content-area" [uiContextMenu]="contextMenu">
  Right-click anywhere in this area
</div>
```

The directive:
- Prevents the default browser context menu
- Opens the dropdown at the mouse cursor position
- Works with any element

```typescript
import { ContextMenuDirective, DropdownComponent } from '@m1z23r/ngx-ui';

@Component({
  imports: [ContextMenuDirective, DropdownComponent, ...],
  // ...
})
```

### Tabs (Declarative)

```html
<ui-tabs [(activeTab)]="activeTab" [variant]="'underline'">
  <ui-tab id="overview" label="Overview">
    <p>Overview content here.</p>
  </ui-tab>
  <ui-tab id="settings" label="Settings">
    <p>Settings content here.</p>
  </ui-tab>
  <ui-tab id="disabled" label="Disabled" [disabled]="true">
    <p>This tab is disabled.</p>
  </ui-tab>
</ui-tabs>
```

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `variant` | `'default' \| 'pills' \| 'underline'` | `'default'` | Visual style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Tab size |
| `activeTab` | `string \| number` | `0` | Active tab id or index (two-way) |
| `ariaLabel` | `string` | `''` | ARIA label for tab list |

### Dynamic Tabs (Service-based)

Create and manage tabs programmatically using `TabsService`, similar to how dialogs work. Each tab can render a component with injected data and return results when closed.

#### TabsService

```typescript
import { TabsService, TabRef, TAB_DATA, TAB_REF, DynamicTabsComponent } from '@m1z23r/ngx-ui';

@Component({
  imports: [DynamicTabsComponent],
  template: `
    <ui-button (clicked)="addTab()">Add Tab</ui-button>
    <ui-dynamic-tabs variant="default" />
  `,
})
export class MyComponent {
  private tabsService = inject(TabsService);

  async addTab() {
    const tabRef = this.tabsService.open<MyTabContent, MyData, MyResult>(MyTabContent, {
      label: 'New Tab',
      data: { title: 'Hello', message: 'World' },
      closable: true,           // Show close button (default: true)
      activate: true,           // Activate immediately (default: true)
      id: 'unique-id',          // Optional custom ID
      icon: iconTemplateRef,    // Optional icon template
    });

    // Wait for tab to close and get result
    const result = await tabRef.afterClosed();
    console.log('Tab returned:', result);
  }
}
```

#### Creating a Tab Content Component

```typescript
import { Component, inject, signal } from '@angular/core';
import { TAB_DATA, TAB_REF, TabRef, ButtonComponent, InputComponent } from '@m1z23r/ngx-ui';

interface EditorTabData {
  filename: string;
  content: string;
}

@Component({
  selector: 'app-editor-tab',
  standalone: true,
  imports: [ButtonComponent, InputComponent],
  template: `
    <div class="editor-tab">
      <h3>Editing: {{ data.filename }}</h3>
      <ui-textarea [(value)]="content" />
      <div class="actions">
        <ui-button (clicked)="save()">Save</ui-button>
        <ui-button variant="ghost" (clicked)="close()">Discard</ui-button>
      </div>
    </div>
  `,
})
export class EditorTabComponent {
  readonly data = inject(TAB_DATA) as EditorTabData;
  private readonly tabRef = inject(TAB_REF) as TabRef<string>;

  content = signal(this.data.content);

  save() {
    this.tabRef.close(this.content());  // Close with result
  }

  close() {
    this.tabRef.close();  // Close without result
  }
}
```

#### DynamicTabsComponent

The container component that renders all dynamic tabs:

```html
<ui-dynamic-tabs
  [variant]="'default'"         <!-- 'default' | 'pills' | 'underline' -->
  [size]="'md'"                 <!-- 'sm' | 'md' | 'lg' -->
  [ariaLabel]="'Editor tabs'"
/>
```

#### TabsService Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `open(component, config)` | `TabRef<TResult>` | Open a new tab with the component |
| `close(tabRef)` | `void` | Close a tab by its TabRef |
| `closeById(id)` | `void` | Close a tab by its ID |
| `closeAll()` | `void` | Close all tabs |
| `activate(tabRef)` | `void` | Activate a tab by its TabRef |
| `activateById(id)` | `void` | Activate a tab by its ID |
| `getTab(id)` | `DynamicTab \| undefined` | Get a tab by ID |
| `updateLabel(id, label)` | `void` | Update a tab's label |

#### TabsService Signals

| Signal | Type | Description |
|--------|------|-------------|
| `tabs` | `Signal<DynamicTab[]>` | All currently open tabs |
| `activeTabId` | `Signal<string \| null>` | ID of the active tab |
| `activeTab` | `Signal<DynamicTab \| null>` | The currently active tab |

#### TabRef Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `close(result?)` | `void` | Close the tab with optional result |
| `activate()` | `void` | Activate this tab |
| `afterClosed()` | `Promise<TResult \| undefined>` | Promise that resolves when tab closes |
| `isActive` | `Signal<boolean>` | Whether this tab is currently active |

#### DynamicTabConfig Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `label` | `string` | (required) | Tab label text |
| `data` | `TData` | `undefined` | Data to inject via TAB_DATA |
| `closable` | `boolean` | `true` | Show close button |
| `activate` | `boolean` | `true` | Activate tab on creation |
| `id` | `string` | auto-generated | Custom tab ID |
| `icon` | `TemplateRef` | `undefined` | Icon template |

#### Keyboard Navigation

- **Arrow Left/Right**: Navigate between tabs
- **Home/End**: Jump to first/last tab
- **Delete**: Close the focused tab (if closable)

#### Example: IDE-style Tabs

```typescript
@Component({
  template: `
    <div class="ide-layout">
      <ui-tree [nodes]="files" (nodeClick)="openFile($event)" />
      <ui-dynamic-tabs variant="underline" />
    </div>
  `,
})
export class IdeComponent {
  private tabsService = inject(TabsService);

  openFile(node: TreeNode) {
    // Check if already open
    const existing = this.tabsService.getTab(node.data.path);
    if (existing) {
      this.tabsService.activateById(node.data.path);
      return;
    }

    // Open new tab
    this.tabsService.open(EditorTabComponent, {
      id: node.data.path,
      label: node.label,
      data: { filename: node.label, content: node.data.content },
      closable: true,
    });
  }
}
```

### Accordion

```html
<ui-accordion [multi]="false" [variant]="'bordered'">
  <ui-accordion-item header="Section 1" [expanded]="true">
    Content for section 1.
  </ui-accordion-item>
  <ui-accordion-item header="Section 2">
    Content for section 2.
  </ui-accordion-item>
  <ui-accordion-item header="Disabled" [disabled]="true">
    This section is disabled.
  </ui-accordion-item>
</ui-accordion>

<!-- Custom header -->
<ui-accordion>
  <ui-accordion-item>
    <ng-template uiAccordionHeader let-expanded>
      <span [class.bold]="expanded">Custom Header</span>
    </ng-template>
    Custom content.
  </ui-accordion-item>
</ui-accordion>
```

### Pagination

```html
<ui-pagination
  [(page)]="currentPage"
  [total]="totalItems"
  [pageSize]="10"
  [maxPages]="5"
  [showFirstLast]="true"
/>
```

---

## Layout Components

### Shell Layout

```html
<ui-shell [variant]="'default'">
  <ui-navbar>
    <ng-container start>
      <ui-sidebar-toggle />
      <span class="logo">MyApp</span>
    </ng-container>
    <ng-container end>
      <ui-button variant="ghost">Profile</ui-button>
    </ng-container>
  </ui-navbar>

  <ui-sidebar>
    <ng-container header>
      <h2>Navigation</h2>
    </ng-container>

    <nav>
      <a href="/dashboard">Dashboard</a>
      <a href="/settings">Settings</a>
    </nav>
  </ui-sidebar>

  <ui-content>
    <router-outlet />
  </ui-content>

  <ui-footer>
    <p>© 2024 MyApp</p>
  </ui-footer>
</ui-shell>
```

### SidebarService

```typescript
import { SidebarService } from '@m1z23r/ngx-ui';

@Component({ ... })
export class MyComponent {
  private sidebarService = inject(SidebarService);

  // Signals
  collapsed = this.sidebarService.collapsed;
  isMobile = this.sidebarService.isMobile;
  mobileOpen = this.sidebarService.mobileOpen;

  // Methods
  toggle() { this.sidebarService.toggle(); }
  expand() { this.sidebarService.expand(); }
  collapse() { this.sidebarService.collapse(); }
}
```

---

## Data Components

### Table

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  role: { name: string };
}

columns: TableColumn<User>[] = [
  { key: 'id', label: 'ID', sortable: true },
  { key: 'name', label: 'Name', sortable: true },
  { key: 'email', label: 'Email' },
  { key: 'role.name', label: 'Role' },  // Nested property access
  { key: 'actions', label: '' },
];
```

```html
<ui-table [data]="users" [columns]="columns">
  <!-- Custom cell template -->
  <ng-template uiCellTemplate="actions" let-row>
    <ui-button size="sm" variant="ghost" (clicked)="edit(row)">Edit</ui-button>
    <ui-button size="sm" variant="ghost" color="danger" (clicked)="delete(row)">Delete</ui-button>
  </ng-template>
</ui-table>
```

### Tree

Hierarchical tree view for displaying nested data structures.

```typescript
import { TreeComponent, TreeNode } from '@m1z23r/ngx-ui';

@Component({
  imports: [TreeComponent],
  template: `
    <ui-tree
      [nodes]="fileTree"
      [indent]="20"
      (nodeClick)="onNodeClick($event)"
      (nodeExpand)="onNodeExpand($event)"
      (nodeCollapse)="onNodeCollapse($event)"
    />
  `,
})
export class MyComponent {
  fileTree: TreeNode[] = [
    {
      label: 'src',
      icon: '📁',
      expanded: true,
      children: [
        {
          label: 'components',
          icon: '📁',
          children: [
            { label: 'button.ts', icon: '📄', data: { path: 'src/components/button.ts' } },
            { label: 'input.ts', icon: '📄', data: { path: 'src/components/input.ts' } },
          ],
        },
        { label: 'index.ts', icon: '📄', data: { path: 'src/index.ts' } },
      ],
    },
    {
      label: 'package.json',
      icon: '📄',
      data: { path: 'package.json' },
    },
  ];

  onNodeClick(node: TreeNode) {
    console.log('Clicked:', node.label, node.data);
  }

  onNodeExpand(node: TreeNode) {
    console.log('Expanded:', node.label);
  }

  onNodeCollapse(node: TreeNode) {
    console.log('Collapsed:', node.label);
  }
}
```

#### TreeNode Interface

```typescript
interface TreeNode {
  label: string;           // Display text
  icon?: string;           // Optional icon (emoji or text)
  expanded?: boolean;      // Initial expanded state
  children?: TreeNode[];   // Nested children
  data?: unknown;          // Custom data payload
}
```

#### Tree Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `nodes` | `TreeNode[]` | `[]` | Array of root-level nodes |
| `indent` | `number` | `16` | Pixels of indentation per level |

#### Tree Outputs

| Output | Type | Description |
|--------|------|-------------|
| `nodeClick` | `TreeNode` | Emitted when a node is clicked |
| `nodeExpand` | `TreeNode` | Emitted when a node is expanded |
| `nodeCollapse` | `TreeNode` | Emitted when a node is collapsed |

---

## Split Pane

Resizable split pane layout for creating adjustable panel layouts.

```typescript
import { SplitComponent, SplitPaneComponent } from '@m1z23r/ngx-ui';
```

### Basic Usage

```html
<!-- Horizontal split (side by side) -->
<ui-split orientation="horizontal" gutterSize="md">
  <ui-split-pane [size]="30" [minSize]="20" [maxSize]="50">
    <div class="sidebar">Sidebar content</div>
  </ui-split-pane>
  <ui-split-pane>
    <div class="main">Main content</div>
  </ui-split-pane>
</ui-split>

<!-- Vertical split (stacked) -->
<ui-split orientation="vertical" gutterSize="sm">
  <ui-split-pane [size]="70">
    <div class="editor">Editor</div>
  </ui-split-pane>
  <ui-split-pane [minSize]="10">
    <div class="terminal">Terminal</div>
  </ui-split-pane>
</ui-split>
```

### Multiple Panes

```html
<ui-split orientation="horizontal">
  <ui-split-pane [size]="20" [minSize]="15">
    <div>Left panel</div>
  </ui-split-pane>
  <ui-split-pane [size]="60">
    <div>Center panel</div>
  </ui-split-pane>
  <ui-split-pane [size]="20" [minSize]="15">
    <div>Right panel</div>
  </ui-split-pane>
</ui-split>
```

### Nested Splits

```html
<ui-split orientation="horizontal">
  <ui-split-pane [size]="25">
    <div>Sidebar</div>
  </ui-split-pane>
  <ui-split-pane>
    <!-- Nested vertical split -->
    <ui-split orientation="vertical">
      <ui-split-pane [size]="70">
        <div>Editor</div>
      </ui-split-pane>
      <ui-split-pane>
        <div>Output panel</div>
      </ui-split-pane>
    </ui-split>
  </ui-split-pane>
</ui-split>
```

### Handling Size Changes

```typescript
@Component({
  template: `
    <ui-split
      orientation="horizontal"
      (sizeChange)="onSizeChange($event)"
      (dragStart)="onDragStart($event)"
      (dragEnd)="onDragEnd($event)"
    >
      <ui-split-pane [size]="30">Left</ui-split-pane>
      <ui-split-pane>Right</ui-split-pane>
    </ui-split>
  `,
})
export class MyComponent {
  onSizeChange(event: SplitSizeChange) {
    console.log('Gutter index:', event.gutterIndex);
    console.log('New sizes:', event.sizes); // e.g., [35, 65]
  }

  onDragStart(gutterIndex: number) {
    console.log('Started dragging gutter:', gutterIndex);
  }

  onDragEnd(gutterIndex: number) {
    console.log('Finished dragging gutter:', gutterIndex);
  }
}
```

### SplitComponent Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Split direction |
| `gutterSize` | `'sm' \| 'md' \| 'lg'` | `'md'` | Gutter/divider thickness |
| `disabled` | `boolean` | `false` | Disable resizing |

### SplitComponent Outputs

| Output | Type | Description |
|--------|------|-------------|
| `sizeChange` | `SplitSizeChange` | Emitted when pane sizes change |
| `dragStart` | `number` | Emitted when drag starts (gutter index) |
| `dragEnd` | `number` | Emitted when drag ends (gutter index) |

### SplitPaneComponent Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `size` | `number \| undefined` | `undefined` | Initial size as percentage (auto-calculated if omitted) |
| `minSize` | `number` | `0` | Minimum size as percentage |
| `maxSize` | `number` | `100` | Maximum size as percentage |

### Keyboard Navigation

The gutter supports keyboard navigation:
- **Arrow Left/Up**: Decrease left/top pane size by 1%
- **Arrow Right/Down**: Increase left/top pane size by 1%
- **Home**: Set left/top pane to minimum size
- **End**: Set left/top pane to maximum size

---

## Utility Pipes

| Pipe | Description | Example |
|------|-------------|---------|
| `FileSizePipe` | Format bytes to human-readable | `{{ 1024 \| fileSize }}` → `1 KB` |
| `FilePreviewPipe` | Generate preview URL for File | `{{ file \| filePreview \| async }}` |
| `CellValuePipe` | Extract nested object value | `{{ row \| cellValue:'user.name' }}` |
| `TabActivePipe` | Check if tab is active | `{{ tab \| tabActive:activeTab }}` |

---

## Theme Variables

All components use CSS custom properties for theming. Override in your global styles:

```scss
:root {
  // Colors
  --ui-primary: #3b82f6;
  --ui-secondary: #64748b;
  --ui-success: #22c55e;
  --ui-danger: #ef4444;
  --ui-warning: #f59e0b;

  // Backgrounds
  --ui-bg: #ffffff;
  --ui-bg-secondary: #f8fafc;
  --ui-bg-hover: #f1f5f9;

  // Text
  --ui-text: #0f172a;
  --ui-text-secondary: #475569;
  --ui-text-muted: #94a3b8;

  // Borders
  --ui-border: #e2e8f0;
  --ui-border-hover: #cbd5e1;

  // Spacing
  --ui-spacing-xs: 0.25rem;
  --ui-spacing-sm: 0.5rem;
  --ui-spacing-md: 1rem;
  --ui-spacing-lg: 1.5rem;
  --ui-spacing-xl: 2rem;

  // Radius
  --ui-radius-sm: 0.25rem;
  --ui-radius-md: 0.5rem;
  --ui-radius-lg: 0.75rem;

  // Shadows
  --ui-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --ui-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --ui-shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);

  // Transitions
  --ui-transition-fast: 150ms;
  --ui-transition-normal: 200ms;
  --ui-transition-slow: 300ms;
}
```
