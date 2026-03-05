import { Component, inject, OnInit, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  DialogService,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef,
} from '@m1z23r/ngx-ui';
import { UnifiedCollectionService } from '../../core/services/unified-collection.service';
import { SchemaService } from '../../core/services/schema.service';
import { SchemaType } from '../../core/models/collection.model';
import { InputDialogComponent, InputDialogData } from '../../shared/dialogs/input.dialog';
import { CodeEditorComponent } from '../../shared/code-editor/code-editor.component';
import { RadioGroupComponent, RadioComponent } from '@m1z23r/ngx-ui';

export interface SchemaEditorDialogData {
  collectionPath: string;
}

@Component({
  selector: 'app-schema-editor-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent, CodeEditorComponent, RadioGroupComponent, RadioComponent],
  template: `
    <ui-modal title="Schemas" size="lg" width="700px">
      <div class="schema-list">
        <div class="schema-tabs">
          @for (schema of schemas(); track schema.id) {
            @if (selectedSchemaId() === schema.id) {
              <ui-button variant="default" color="primary" size="sm" (clicked)="selectSchema(schema.id)">
                {{ schema.name }}
              </ui-button>
            } @else {
              <ui-button variant="ghost" size="sm" (clicked)="selectSchema(schema.id)">
                {{ schema.name }}
              </ui-button>
            }
          }
          <ui-button variant="ghost" size="sm" (clicked)="addSchema()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </ui-button>
        </div>

        @if (selectedSchema(); as schema) {
          <div class="schema-content">
            <div class="schema-header">
              <div class="input-wrapper">
                <ui-input
                  [value]="schema.name"
                  (valueChange)="updateSchemaName($event.toString())"
                  placeholder="Schema name" />
                <div class="floating-buttons">
                  <ui-button variant="ghost" color="danger" size="sm" (clicked)="deleteSchema()" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </ui-button>
                </div>
              </div>
            </div>

            <div class="schema-type">
              <label class="type-label">Type</label>
              <ui-radio-group
                variant="segmented"
                [value]="schema.type"
                (valueChange)="updateSchemaType($event)">
                <ui-radio value="json">JSON Schema</ui-radio>
                <ui-radio value="xml">XML Schema</ui-radio>
              </ui-radio-group>
            </div>

            <div class="schema-editor">
              <label class="editor-label">Schema Definition</label>
              <app-code-editor
                [language]="schema.type === 'xml' ? 'xml' : 'json'"
                [(value)]="schemaContent"
                [showLineNumbers]="true"
                [foldable]="true"
                placeholder="Enter your schema definition..." />
            </div>
          </div>
        } @else {
          <div class="empty-state">
            <p>No schemas defined. Click + to add one.</p>
          </div>
        }
      </div>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="close()">Close</ui-button>
        <ui-button color="primary" (clicked)="save()">Save</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .schema-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .schema-tabs {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .schema-content {
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      padding: 1rem;
    }

    .schema-header {
      margin-bottom: 1rem;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;

      ui-input {
        width: 100%;
      }

      ui-input ::ng-deep input {
        padding-right: 3rem;
      }
    }

    .floating-buttons {
      position: absolute;
      right: 0.25rem;
      display: flex;
      gap: 0.25rem;
      align-items: center;
    }

    .schema-type {
      margin-bottom: 1rem;
    }

    .type-label, .editor-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      color: var(--ui-text-muted);
      margin-bottom: 0.5rem;
    }

    .schema-editor {
      app-code-editor {
        height: 300px;
      }
    }

    .empty-state {
      padding: 2rem;
      text-align: center;
      color: var(--ui-text-muted);
      font-size: 0.875rem;
    }
  `]
})
export class SchemaEditorDialogComponent implements OnInit {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<void>;
  readonly data = inject(DIALOG_DATA) as SchemaEditorDialogData;

  private unifiedCollectionService = inject(UnifiedCollectionService);
  private schemaService = inject(SchemaService);
  private dialogService = inject(DialogService);

  selectedSchemaId = signal('');
  schemaContent = signal('');

  ngOnInit(): void {
    const schemas = this.schemas();
    if (schemas.length > 0) {
      this.selectSchema(schemas[0].id);
    }
  }

  schemas = computed(() => {
    return this.schemaService.getSchemas(this.data.collectionPath);
  });

  selectedSchema = computed(() => {
    return this.schemas().find(s => s.id === this.selectedSchemaId());
  });

  selectSchema(schemaId: string): void {
    this.saveCurrentContent();
    this.selectedSchemaId.set(schemaId);
    const schema = this.schemas().find(s => s.id === schemaId);
    this.schemaContent.set(schema?.content ?? '');
  }

  async addSchema(): Promise<void> {
    const ref = this.dialogService.open<InputDialogComponent, InputDialogData, string | undefined>(
      InputDialogComponent,
      {
        data: {
          title: 'New Schema',
          label: 'Schema name',
          placeholder: 'UserResponse',
          submitLabel: 'Create'
        }
      }
    );
    const name = await ref.afterClosed();
    if (name) {
      this.saveCurrentContent();
      this.schemaService.addSchema(this.data.collectionPath, name);
      const schemas = this.schemas();
      const newSchema = schemas.find(s => s.name === name);
      if (newSchema) {
        this.selectedSchemaId.set(newSchema.id);
        this.schemaContent.set(newSchema.content);
      }
    }
  }

  deleteSchema(): void {
    if (confirm('Delete this schema?')) {
      this.schemaService.deleteSchema(this.data.collectionPath, this.selectedSchemaId());
      const remaining = this.schemas();
      if (remaining.length > 0) {
        this.selectSchema(remaining[0].id);
      } else {
        this.selectedSchemaId.set('');
        this.schemaContent.set('');
      }
    }
  }

  updateSchemaName(name: string): void {
    this.schemaService.updateSchema(this.data.collectionPath, this.selectedSchemaId(), { name });
  }

  updateSchemaType(type: string | null): void {
    if (type) {
      this.schemaService.updateSchema(this.data.collectionPath, this.selectedSchemaId(), { type: type as SchemaType });
    }
  }

  private saveCurrentContent(): void {
    const currentId = this.selectedSchemaId();
    if (currentId) {
      const currentSchema = this.schemas().find(s => s.id === currentId);
      if (currentSchema && currentSchema.content !== this.schemaContent()) {
        this.schemaService.updateSchema(this.data.collectionPath, currentId, { content: this.schemaContent() });
      }
    }
  }

  close(): void {
    this.dialogRef.close();
  }

  save(): void {
    this.saveCurrentContent();
    this.unifiedCollectionService.save(this.data.collectionPath);
    this.dialogRef.close();
  }
}
