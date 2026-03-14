import { Component, inject, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  CheckboxComponent,
  RadioGroupComponent,
  RadioComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';

export interface ExportCollectionDialogData {
  collectionName: string;
  hasScripts: boolean;
}

export type ExportFormat = 'nikode' | 'postman' | 'bruno' | 'openapi';

export interface ExportDialogResult {
  format: ExportFormat;
  options: {
    includeEnvironments?: boolean;
    openapiFormat?: 'json' | 'yaml';
  };
}

@Component({
  selector: 'app-export-collection-dialog',
  imports: [
    ModalComponent,
    ButtonComponent,
    CheckboxComponent,
    RadioGroupComponent,
    RadioComponent
  ],
  template: `
    <ui-modal title="Export Collection" size="md">
      @if (mode() === 'select') {
        <p class="dialog-description">
          Export "{{ data.collectionName }}" to an external format.
        </p>

        @if (data.hasScripts) {
          <div class="script-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>This collection contains scripts that use nk.* API. Manual conversion may be needed.</span>
          </div>
        }

        <div class="format-grid">
          <button class="format-button" (click)="selectFormat('nikode')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <span class="format-label">Nikode</span>
            <span class="format-ext">.nikode.json</span>
          </button>
          <button class="format-button" (click)="selectFormat('postman')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </div>
            <span class="format-label">Postman</span>
            <span class="format-ext">.postman_collection.json</span>
          </button>
          <button class="format-button" (click)="selectFormat('bruno')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <span class="format-label">Bruno</span>
            <span class="format-ext">folder</span>
          </button>
          <button class="format-button" (click)="selectFormat('openapi')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <span class="format-label">OpenAPI</span>
            <span class="format-ext">.yaml / .json</span>
          </button>
        </div>
      }

      @if (mode() === 'postman-options') {
        <p class="dialog-description">Postman export options</p>
        <div class="options-form">
          <ui-checkbox [(checked)]="includeEnvironments">
            Also export environments as separate file
          </ui-checkbox>
        </div>
      }

      @if (mode() === 'openapi-options') {
        <p class="dialog-description">OpenAPI export format</p>
        <ui-radio-group [(value)]="openapiFormat" label="Format">
          <ui-radio value="yaml">YAML</ui-radio>
          <ui-radio value="json">JSON</ui-radio>
        </ui-radio-group>
      }

      <ng-container footer>
        @if (mode() === 'select') {
          <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        } @else {
          <ui-button variant="ghost" (clicked)="backToSelect()">Back</ui-button>
          <ui-button color="primary" (clicked)="confirm()">Export</ui-button>
        }
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .dialog-description {
      margin: 0 0 1rem 0;
      color: var(--ui-text-secondary);
      font-size: var(--ui-font-sm);
    }

    .script-warning {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.75rem;
      margin-bottom: 1rem;
      background: var(--ui-warning-subtle, rgba(245, 158, 11, 0.1));
      border: 1px solid var(--ui-warning, #f59e0b);
      border-radius: 0.375rem;
      font-size: 0.75rem;
      color: var(--ui-warning, #f59e0b);

      svg {
        flex-shrink: 0;
        margin-top: 0.125rem;
      }
    }

    .format-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    .format-button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1.25rem 1rem;
      border: 1px solid var(--ui-border);
      border-radius: 0.5rem;
      background: var(--ui-bg);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--ui-primary);
        background: var(--ui-bg-hover);
      }
    }

    .format-icon {
      color: var(--ui-text-muted);
    }

    .format-button:hover .format-icon {
      color: var(--ui-primary);
    }

    .format-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--ui-text);
    }

    .format-ext {
      font-size: 0.75rem;
      color: var(--ui-text-muted);
    }

    .options-form {
      padding: 0.5rem 0;
    }
  `]
})
export class ExportCollectionDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<ExportDialogResult | undefined>;
  readonly data = inject(DIALOG_DATA) as ExportCollectionDialogData;

  mode = signal<'select' | 'postman-options' | 'openapi-options'>('select');
  selectedFormat = signal<ExportFormat>('nikode');
  includeEnvironments = signal(true);
  openapiFormat = signal<'json' | 'yaml'>('yaml');

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  backToSelect(): void {
    this.mode.set('select');
  }

  selectFormat(format: ExportFormat): void {
    this.selectedFormat.set(format);

    if (format === 'postman') {
      this.mode.set('postman-options');
    } else if (format === 'openapi') {
      this.mode.set('openapi-options');
    } else {
      // Nikode and Bruno: export immediately
      this.confirm();
    }
  }

  confirm(): void {
    this.dialogRef.close({
      format: this.selectedFormat(),
      options: {
        includeEnvironments: this.includeEnvironments(),
        openapiFormat: this.openapiFormat(),
      }
    });
  }
}
