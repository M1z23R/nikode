import { Component, inject, OnInit, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  CheckboxComponent,
  DialogService,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef,
  ToastService
} from '@m1z23r/ngx-ui';
import { UnifiedCollectionService } from '../../core/services/unified-collection.service';
import { EnvironmentService, ExportedEnvironment } from '../../core/services/environment.service';
import { ApiService } from '../../core/services/api.service';
import { Environment, Variable } from '../../core/models/collection.model';
import { InputDialogComponent, InputDialogData } from '../../shared/dialogs/input.dialog';
import {
  ExportEnvironmentDialogComponent,
  ExportEnvironmentDialogData,
  ExportEnvironmentResult
} from '../../shared/dialogs/export-environment.dialog';
import { isIpcError } from '@shared/ipc-types';

export interface EnvironmentEditorDialogData {
  collectionPath: string;
}

@Component({
  selector: 'app-environment-editor-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent, CheckboxComponent],
  template: `
    <ui-modal title="Environments" size="lg" width="700px">
      <div class="env-list">
        <div class="env-tabs">
          @for (env of environments(); track env.id) {
            @if (selectedEnvId() === env.id) {
              <ui-button variant="default" color="primary" size="sm" (clicked)="selectEnvironment(env.id)">
                {{ env.name }}
              </ui-button>
            } @else {
              <ui-button variant="ghost" size="sm" (clicked)="selectEnvironment(env.id)">
                {{ env.name }}
              </ui-button>
            }
          }
          <ui-button variant="ghost" size="sm" (clicked)="addEnvironment()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </ui-button>
        </div>

        @if (selectedEnv(); as env) {
          <div class="env-content">
            <div class="env-header">
              <div class="input-wrapper">
                <ui-input
                  [value]="env.name"
                  (valueChange)="updateEnvName($event.toString())"
                  placeholder="Environment name" />
                <div class="floating-buttons">
                  <ui-button variant="ghost" size="sm" (clicked)="importEnvironment()" title="Import">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </ui-button>
                  <ui-button variant="ghost" size="sm" (clicked)="exportEnvironment()" title="Export">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </ui-button>
                  @if (environments().length > 1) {
                    <ui-button variant="ghost" color="danger" size="sm" (clicked)="deleteEnvironment()" title="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </ui-button>
                  }
                </div>
              </div>
            </div>

            <div class="variables-section">
              <h4>Variables</h4>
              <table class="variables-table">
                <thead>
                  <tr>
                    <th class="col-enabled"></th>
                    <th class="col-key">Key</th>
                    <th class="col-value">Value</th>
                    <th class="col-secret">Secret</th>
                    <th class="col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (variable of env.variables; track $index; let i = $index) {
                    <tr>
                      <td class="col-enabled">
                        <ui-checkbox
                          [checked]="variable.enabled"
                          (checkedChange)="toggleVariable(i)" />
                      </td>
                      <td class="col-key">
                        <ui-input
                          [value]="variable.key"
                          (valueChange)="updateVariableKey(i, $event.toString())"
                          placeholder="key" />
                      </td>
                      <td class="col-value">
                        @if (variable.secret) {
                          <ui-input
                            type="password"
                            [value]="getSecretValue(variable.key)"
                            (valueChange)="updateSecretValue(variable.key, $event.toString())"
                            placeholder="••••••••" />
                        } @else {
                          <ui-input
                            [value]="variable.value"
                            (valueChange)="updateVariableValue(i, $event.toString())"
                            placeholder="value" />
                        }
                      </td>
                      <td class="col-secret">
                        <ui-checkbox
                          [checked]="!!variable.secret"
                          (checkedChange)="toggleSecret(i)" />
                      </td>
                      <td class="col-actions">
                        <ui-button variant="ghost" size="sm" (clicked)="deleteVariable(i)">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </ui-button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              <ui-button variant="ghost" size="sm" (clicked)="addVariable()">Add Variable</ui-button>
            </div>
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
    .env-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .env-tabs {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .env-content {
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      padding: 1rem;
    }

    .env-header {
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
        padding-right: 7.5rem;
      }
    }

    .floating-buttons {
      position: absolute;
      right: 0.25rem;
      display: flex;
      gap: 0.25rem;
      align-items: center;
    }

    .variables-section {
      h4 {
        font-size: 0.875rem;
        font-weight: 600;
        margin: 0 0 0.75rem 0;
      }
    }

    .variables-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0.75rem;

      th, td {
        padding: 0.375rem;
        text-align: left;
        vertical-align: middle;
      }

      th {
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: uppercase;
        color: var(--ui-text-muted);
      }

      .col-enabled, .col-secret, .col-actions {
        width: 40px;
        text-align: center;
      }

      .col-key, .col-value {
        width: 40%;
      }

      ui-input {
        font-family: monospace;
      }
    }
  `]
})
export class EnvironmentEditorDialogComponent implements OnInit {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<void>;
  readonly data = inject(DIALOG_DATA) as EnvironmentEditorDialogData;

  private unifiedCollectionService = inject(UnifiedCollectionService);
  private environmentService = inject(EnvironmentService);
  private apiService = inject(ApiService);
  private toastService = inject(ToastService);
  private dialogService = inject(DialogService);

  selectedEnvId = signal('');
  // Track secrets for ALL environments, keyed by env ID
  allSecrets = signal<Record<string, Record<string, string>>>({});

  // Computed signal for the current environment's secrets
  secrets = computed(() => this.allSecrets()[this.selectedEnvId()] || {});

  ngOnInit(): void {
    const collection = this.unifiedCollectionService.getCollection(this.data.collectionPath);
    if (collection) {
      this.environmentService.loadSecrets(this.data.collectionPath);
      this.selectedEnvId.set(collection.collection.activeEnvironmentId);
      const loadedSecrets = this.environmentService.getSecrets(this.data.collectionPath);
      if (loadedSecrets) {
        this.allSecrets.set({ ...loadedSecrets });
      }
    }
  }

  environments = computed(() => {
    const collection = this.unifiedCollectionService.getCollection(this.data.collectionPath);
    return collection?.collection.environments || [];
  });

  selectedEnv = computed(() => {
    return this.environments().find(e => e.id === this.selectedEnvId());
  });

  selectEnvironment(envId: string): void {
    // If we don't have this env's secrets locally yet, load from service
    if (!this.allSecrets()[envId]) {
      const loadedSecrets = this.environmentService.getSecrets(this.data.collectionPath);
      if (loadedSecrets && loadedSecrets[envId]) {
        this.allSecrets.update(s => ({ ...s, [envId]: { ...loadedSecrets[envId] } }));
      }
    }
    this.selectedEnvId.set(envId);
  }

  async addEnvironment(): Promise<void> {
    const ref = this.dialogService.open<InputDialogComponent, InputDialogData, string | undefined>(
      InputDialogComponent,
      {
        data: {
          title: 'New Environment',
          label: 'Environment name',
          placeholder: 'Production',
          submitLabel: 'Create'
        }
      }
    );
    const name = await ref.afterClosed();
    if (name) {
      this.environmentService.addEnvironment(this.data.collectionPath, name);
    }
  }

  deleteEnvironment(): void {
    if (confirm('Delete this environment?')) {
      this.environmentService.deleteEnvironment(this.data.collectionPath, this.selectedEnvId());
      const remaining = this.environments();
      if (remaining.length > 0) {
        this.selectedEnvId.set(remaining[0].id);
      }
    }
  }

  updateEnvName(name: string): void {
    this.environmentService.updateEnvironment(this.data.collectionPath, this.selectedEnvId(), { name });
  }

  addVariable(): void {
    const variable: Variable = {
      key: '',
      value: '',
      enabled: true,
      secret: false
    };
    this.environmentService.addVariable(this.data.collectionPath, this.selectedEnvId(), variable);
  }

  toggleVariable(index: number): void {
    const variable = this.selectedEnv()?.variables[index];
    if (variable) {
      this.environmentService.updateVariable(this.data.collectionPath, this.selectedEnvId(), index, {
        enabled: !variable.enabled
      });
    }
  }

  updateVariableKey(index: number, newKey: string): void {
    this.environmentService.updateVariable(this.data.collectionPath, this.selectedEnvId(), index, {
      key: newKey
    });
  }

  updateVariableValue(index: number, value: string): void {
    this.environmentService.updateVariable(this.data.collectionPath, this.selectedEnvId(), index, {
      value
    });
  }

  toggleSecret(index: number): void {
    const variable = this.selectedEnv()?.variables[index];
    if (variable) {
      const becomingSecret = !variable.secret;
      const updates: Partial<Variable> = { secret: becomingSecret };

      if (becomingSecret) {
        // Migrate current value to the secrets store before clearing it
        if (variable.value) {
          this.updateSecretValue(variable.key, variable.value);
        }
        updates.value = '';
      } else {
        // Converting from secret back to normal: migrate secret value to collection data
        const secretValue = this.getSecretValue(variable.key);
        if (secretValue) {
          updates.value = secretValue;
        }
      }

      this.environmentService.updateVariable(this.data.collectionPath, this.selectedEnvId(), index, updates);
    }
  }

  deleteVariable(index: number): void {
    this.environmentService.deleteVariable(this.data.collectionPath, this.selectedEnvId(), index);
  }

  getSecretValue(key: string): string {
    return this.secrets()[key] || '';
  }

  updateSecretValue(key: string, value: string): void {
    const envId = this.selectedEnvId();
    this.allSecrets.update(all => ({
      ...all,
      [envId]: { ...(all[envId] || {}), [key]: value }
    }));
  }

  async exportEnvironment(): Promise<void> {
    const env = this.selectedEnv();
    if (!env) return;

    const hasSecrets = env.variables.some(v => v.secret);
    let includeSecrets = false;

    // Only show dialog if there are secrets to ask about
    if (hasSecrets) {
      const ref = this.dialogService.open<
        ExportEnvironmentDialogComponent,
        ExportEnvironmentDialogData,
        ExportEnvironmentResult | undefined
      >(ExportEnvironmentDialogComponent, {
        data: {
          environmentName: env.name,
          hasSecrets
        }
      });

      const result = await ref.afterClosed();
      if (!result) return;
      includeSecrets = result.includeSecrets;
    }

    const exported = this.environmentService.exportEnvironment(
      this.data.collectionPath,
      this.selectedEnvId(),
      includeSecrets
    );

    if (!exported) {
      this.toastService.error('Failed to export environment');
      return;
    }

    const saveResult = await this.apiService.showSaveDialog({
      defaultPath: `${env.name}.env.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (isIpcError(saveResult) || saveResult.data.canceled || !saveResult.data.filePath) {
      return;
    }

    // Write the file via a simple IPC call - we'll need to add this
    const content = JSON.stringify(exported, null, 2);
    const writeResult = await this.apiService.writeFile(saveResult.data.filePath, content);

    if (isIpcError(writeResult)) {
      this.toastService.error('Failed to save environment file');
      return;
    }

    this.toastService.success('Environment exported successfully');
  }

  async importEnvironment(): Promise<void> {
    const openResult = await this.apiService.showOpenDialog({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (isIpcError(openResult) || openResult.data.canceled || !openResult.data.filePaths.length) {
      return;
    }

    const filePath = openResult.data.filePaths[0];
    const readResult = await this.apiService.readFile(filePath);

    if (isIpcError(readResult)) {
      this.toastService.error('Failed to read environment file');
      return;
    }

    let imported: ExportedEnvironment;
    try {
      const parsed = JSON.parse(readResult.data);

      if (parsed.name && Array.isArray(parsed.values)) {
        // Postman environment format — convert to ExportedEnvironment
        const secrets: Record<string, string> = {};
        imported = {
          name: parsed.name,
          variables: parsed.values.map((v: any) => {
            const isSecret = v.type === 'secret';
            if (isSecret && v.value) {
              secrets[v.key] = String(v.value);
            }
            return {
              key: v.key,
              value: isSecret ? '' : String(v.value ?? ''),
              enabled: v.enabled ?? true,
              secret: isSecret
            };
          }),
          ...(Object.keys(secrets).length ? { secrets } : {})
        };
      } else if (parsed.name && Array.isArray(parsed.variables)) {
        // Nikode format
        imported = parsed;
      } else {
        throw new Error('Invalid format');
      }
    } catch {
      this.toastService.error('Invalid environment file format');
      return;
    }

    try {
      const newEnvId = this.environmentService.importEnvironment(this.data.collectionPath, imported);
      this.selectEnvironment(newEnvId);
      this.toastService.success(`Environment "${imported.name}" imported successfully`);
    } catch {
      this.toastService.error('Failed to import environment');
    }
  }

  close(): void {
    this.dialogRef.close();
  }

  save(): void {
    this.unifiedCollectionService.save(this.data.collectionPath);
    // Merge locally tracked secrets with existing ones to avoid wiping other environments
    const existingSecrets = this.environmentService.getSecrets(this.data.collectionPath) || {};
    this.environmentService.saveSecrets(this.data.collectionPath, {
      ...existingSecrets,
      ...this.allSecrets()
    });
    this.dialogRef.close();
  }
}
