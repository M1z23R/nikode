import { Component, input, model, inject } from '@angular/core';
import { ButtonComponent, InputComponent, CheckboxComponent, SelectComponent, OptionComponent } from '@m1z23r/ngx-ui';
import { FormDataEntry } from '../../core/models/collection.model';
import { TemplateInputWrapperComponent } from '../../shared/components/template-input-wrapper.component';
import { ApiService } from '../../core/services/api.service';
import { isIpcError } from '@shared/ipc-types';

@Component({
  selector: 'app-form-data-editor',
  imports: [ButtonComponent, InputComponent, CheckboxComponent, SelectComponent, OptionComponent, TemplateInputWrapperComponent],
  template: `
    <div class="form-data-editor">
      @for (item of items(); track $index; let i = $index) {
        <div class="form-data-row">
          <ui-checkbox
            [checked]="item.enabled"
            (checkedChange)="onToggle(i)" />
          <ui-input
            class="form-data-key"
            [value]="item.key"
            (valueChange)="onKeyChange(i, $event.toString())"
            [placeholder]="keyPlaceholder()" />
          <ui-select
            class="form-data-type"
            [value]="item.type"
            (valueChange)="onTypeChange(i, $event?.toString() || 'text')">
            <ui-option value="text">Text</ui-option>
            <ui-option value="file">File</ui-option>
          </ui-select>
          @if (item.type === 'file') {
            <div class="file-picker">
              <ui-button
                variant="outline"
                size="sm"
                (clicked)="onSelectFile(i)">
                Choose File
              </ui-button>
              @if (item.filePath) {
                <span class="file-name" [title]="item.filePath">{{ item.value || getFileName(item.filePath) }}</span>
                <ui-button variant="ghost" size="sm" (clicked)="onClearFile(i)" title="Clear file">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </ui-button>
              } @else {
                <span class="no-file">No file selected</span>
              }
            </div>
          } @else {
            <app-template-input
              class="form-data-value"
              [value]="item.value"
              (valueChange)="onValueChange(i, $event)"
              [placeholder]="valuePlaceholder()"
              [collectionPath]="collectionPath()" />
          }
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
    .form-data-editor {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .form-data-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .form-data-key {
      flex: 1;
      min-width: 0;
      max-width: 200px;
    }

    .form-data-type {
      width: 80px;
      flex-shrink: 0;
    }

    .form-data-value {
      flex: 2;
      min-width: 0;
    }

    .file-picker {
      flex: 2;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .file-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.875rem;
      color: var(--ui-text);
    }

    .no-file {
      flex: 1;
      font-size: 0.875rem;
      color: var(--ui-text-muted);
      font-style: italic;
    }

    .add-btn {
      align-self: center;
      margin-top: 0.5rem;
    }
  `]
})
export class FormDataEditorComponent {
  items = model<FormDataEntry[]>([]);
  keyPlaceholder = input('Field name');
  valuePlaceholder = input('Value');
  collectionPath = input('');

  private apiService = inject(ApiService);

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

  onTypeChange(index: number, type: string): void {
    const arr = [...this.items()];
    const newType = type as 'text' | 'file';
    arr[index] = {
      ...arr[index],
      type: newType,
      // Clear value/filePath when switching types
      value: '',
      filePath: newType === 'text' ? undefined : arr[index].filePath,
    };
    this.items.set(arr);
  }

  onValueChange(index: number, value: string): void {
    const arr = [...this.items()];
    arr[index] = { ...arr[index], value };
    this.items.set(arr);
  }

  async onSelectFile(index: number): Promise<void> {
    const result = await this.apiService.showOpenDialog({
      properties: ['openFile'],
    });

    if (isIpcError(result) || result.data.canceled || result.data.filePaths.length === 0) {
      return;
    }

    const filePath = result.data.filePaths[0];
    const fileName = this.getFileName(filePath);

    const arr = [...this.items()];
    arr[index] = {
      ...arr[index],
      filePath,
      value: fileName,
    };
    this.items.set(arr);
  }

  onClearFile(index: number): void {
    const arr = [...this.items()];
    arr[index] = {
      ...arr[index],
      filePath: undefined,
      value: '',
    };
    this.items.set(arr);
  }

  onRemove(index: number): void {
    const arr = [...this.items()];
    arr.splice(index, 1);
    this.items.set(arr);
  }

  onAdd(): void {
    this.items.set([...this.items(), { key: '', type: 'text', value: '', enabled: true }]);
  }

  getFileName(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] || filePath;
  }
}
