import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ButtonComponent, InputComponent, CheckboxComponent } from '@m1z23r/ngx-ui';
import { KeyValue } from '../../core/models/collection.model';

@Component({
  selector: 'app-key-value-editor',
  imports: [ButtonComponent, InputComponent, CheckboxComponent],
  template: `
    <div class="kv-editor">
      @for (item of items; track $index; let i = $index) {
        <div class="kv-row">
          <ui-checkbox
            [checked]="item.enabled"
            (checkedChange)="onToggle(i)" />
          <ui-input
            class="kv-key"
            [value]="item.key"
            (valueChange)="onKeyChange(i, $event.toString())"
            [placeholder]="keyPlaceholder" />
          <ui-input
            class="kv-value"
            [value]="item.value"
            (valueChange)="onValueChange(i, $event.toString())"
            [placeholder]="valuePlaceholder" />
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
  @Input() items: KeyValue[] = [];
  @Input() keyPlaceholder = 'Key';
  @Input() valuePlaceholder = 'Value';
  @Output() itemsChange = new EventEmitter<KeyValue[]>();

  private emitChange(): void {
    this.itemsChange.emit([...this.items]);
  }

  onToggle(index: number): void {
    this.items[index] = { ...this.items[index], enabled: !this.items[index].enabled };
    this.emitChange();
  }

  onKeyChange(index: number, key: string): void {
    this.items[index] = { ...this.items[index], key };
    this.emitChange();
  }

  onValueChange(index: number, value: string): void {
    this.items[index] = { ...this.items[index], value };
    this.emitChange();
  }

  onRemove(index: number): void {
    this.items.splice(index, 1);
    this.emitChange();
  }

  onAdd(): void {
    this.items.push({ key: '', value: '', enabled: true });
    this.emitChange();
  }
}
