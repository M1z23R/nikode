import { Component, input, model } from '@angular/core';
import { ButtonComponent, InputComponent, CheckboxComponent } from '@m1z23r/ngx-ui';
import { KeyValue } from '../../core/models/collection.model';
import { TemplateInputWrapperComponent } from '../../shared/components/template-input-wrapper.component';

@Component({
  selector: 'app-key-value-editor',
  imports: [ButtonComponent, InputComponent, CheckboxComponent, TemplateInputWrapperComponent],
  template: `
    <div class="kv-editor">
      @for (item of items(); track $index; let i = $index) {
        <div class="kv-row">
          <ui-checkbox
            [checked]="item.enabled"
            (checkedChange)="onToggle(i)" />
          <ui-input
            class="kv-key"
            [value]="item.key"
            (valueChange)="onKeyChange(i, $event.toString())"
            [placeholder]="keyPlaceholder()" />
          <app-template-input
            class="kv-value"
            [value]="item.value"
            (valueChange)="onValueChange(i, $event)"
            [placeholder]="valuePlaceholder()"
            [collectionPath]="collectionPath()" />
          <ui-button variant="ghost" size="sm" (clicked)="onRemove(i)" title="Remove">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </ui-button>
        </div>
      }
      <ui-button variant="ghost" size="sm" class="add-btn" (clicked)="onAdd()">Add</ui-button>
    </div>
  `,
  styles: [`
    .kv-editor {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .kv-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .kv-key, .kv-value {
      flex: 1;
    }

    .add-btn {
      align-self: center;
      margin-top: 0.5rem;
    }
  `]
})
export class KeyValueEditorComponent {
  items = model<KeyValue[]>([]);
  keyPlaceholder = input('Key');
  valuePlaceholder = input('Value');
  collectionPath = input('');

  onToggle(index: number): void {
    const arr = [...this.items()];
    arr[index] = { ...arr[index], enabled: !arr[index].enabled };
    this.items.set(arr);
  }

  onKeyChange(index: number, key: string): void {
    const arr = [...this.items()];
    arr[index] = { ...arr[index], key };
    this.items.set(arr);
  }

  onValueChange(index: number, value: string): void {
    const arr = [...this.items()];
    arr[index] = { ...arr[index], value };
    this.items.set(arr);
  }

  onRemove(index: number): void {
    const arr = [...this.items()];
    arr.splice(index, 1);
    this.items.set(arr);
  }

  onAdd(): void {
    this.items.set([...this.items(), { key: '', value: '', enabled: true }]);
  }
}
