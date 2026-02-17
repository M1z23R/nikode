import { Component, inject, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  RadioGroupComponent,
  RadioComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';
import { ItemPreviewComponent } from '../components/item-preview.component';
import {
  ItemConflict,
  MergeResult,
  ConflictResolution,
  ResolutionChoice
} from '../../core/models/merge.model';

export interface MergeConflictDialogData {
  result: MergeResult;
}

export interface MergeConflictDialogResult {
  resolutions: ConflictResolution[];
  cancelled: boolean;
}

@Component({
  selector: 'app-merge-conflict-dialog',
  imports: [ModalComponent, ButtonComponent, RadioGroupComponent, RadioComponent, ItemPreviewComponent],
  template: `
    <ui-modal title="Resolve Conflicts" size="lg">
      <div class="summary">
        {{ data.result.conflicts.length }} conflicts found.
        @if (data.result.autoMergedCount > 0) {
          {{ data.result.autoMergedCount }} changes auto-merged.
        }
      </div>

      <div class="conflicts">
        @for (conflict of data.result.conflicts; track conflict.id) {
          <div class="conflict-card" [class.resolved]="isResolved(conflict.id)">
            <div class="conflict-header">
              <span class="conflict-type">{{ getConflictLabel(conflict) }}</span>
              <span class="conflict-path">{{ conflict.path.join(' > ') }}</span>
              <span class="item-type">{{ conflict.itemType }}</span>
            </div>

            <div class="conflict-body">
              @switch (conflict.type) {
                @case ('update') {
                  <div class="versions">
                    <div class="version local">
                      <div class="version-label">Your Version</div>
                      @if (conflict.localVersion) {
                        <app-item-preview [item]="conflict.localVersion" />
                      }
                    </div>
                    <div class="version remote">
                      <div class="version-label">Server Version</div>
                      @if (conflict.remoteVersion) {
                        <app-item-preview [item]="conflict.remoteVersion" />
                      }
                    </div>
                  </div>
                  <div class="actions">
                    <ui-radio-group
                      [value]="getResolution(conflict.id)"
                      (valueChange)="resolve(conflict.id, $event)"
                      orientation="horizontal"
                      variant="segmented">
                      <ui-radio value="keep-local">Keep Mine</ui-radio>
                      <ui-radio value="keep-remote">Keep Theirs</ui-radio>
                      <ui-radio value="keep-both">Keep Both</ui-radio>
                    </ui-radio-group>
                  </div>
                  <div class="legend">
                    <span><strong>Keep Mine:</strong> Discard server changes, use your version</span>
                    <span><strong>Keep Theirs:</strong> Discard your changes, use server version</span>
                    <span><strong>Keep Both:</strong> Use server version and keep your version as a copy</span>
                  </div>
                }
                @case ('delete-local') {
                  <div class="delete-info">
                    <p>You deleted this {{ conflict.itemType }}. Server has updates.</p>
                    @if (conflict.remoteVersion) {
                      <app-item-preview [item]="conflict.remoteVersion" />
                    }
                  </div>
                  <div class="actions">
                    <ui-radio-group
                      [value]="getResolution(conflict.id)"
                      (valueChange)="resolve(conflict.id, $event)"
                      orientation="horizontal"
                      variant="segmented">
                      <ui-radio value="keep-local">Confirm Delete</ui-radio>
                      <ui-radio value="keep-remote">Restore</ui-radio>
                    </ui-radio-group>
                  </div>
                  <div class="legend">
                    <span><strong>Confirm Delete:</strong> Permanently delete this {{ conflict.itemType }}</span>
                    <span><strong>Restore:</strong> Restore the server version with its updates</span>
                  </div>
                }
                @case ('delete-remote') {
                  <div class="delete-info">
                    <p>Server deleted this {{ conflict.itemType }}. You have local changes.</p>
                    @if (conflict.localVersion) {
                      <app-item-preview [item]="conflict.localVersion" />
                    }
                  </div>
                  <div class="actions">
                    <ui-radio-group
                      [value]="getResolution(conflict.id)"
                      (valueChange)="resolve(conflict.id, $event)"
                      orientation="horizontal"
                      variant="segmented">
                      <ui-radio value="keep-local">Keep Mine</ui-radio>
                      <ui-radio value="keep-remote">Accept Delete</ui-radio>
                    </ui-radio-group>
                  </div>
                  <div class="legend">
                    <span><strong>Keep Mine:</strong> Restore your version with your changes</span>
                    <span><strong>Accept Delete:</strong> Permanently delete this {{ conflict.itemType }}</span>
                  </div>
                }
              }
            </div>
          </div>
        }
      </div>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        <ui-button
          color="primary"
          [disabled]="!allResolved()"
          (clicked)="apply()">
          Apply ({{ resolvedCount() }}/{{ data.result.conflicts.length }} resolved)
        </ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .summary {
      padding: 0.75rem;
      background: var(--ui-bg-secondary);
      border-radius: 4px;
      font-size: 0.875rem;
      color: var(--ui-text-muted);
      margin-bottom: 1rem;
    }

    .conflicts {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-height: 400px;
      overflow-y: auto;
    }

    .conflict-card {
      border: 1px solid var(--ui-border);
      border-radius: 6px;
      overflow: hidden;
    }

    .conflict-card.resolved {
      border-color: var(--ui-success);
    }

    .conflict-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: var(--ui-bg-secondary);
      border-bottom: 1px solid var(--ui-border);
      font-size: 0.8125rem;
    }

    .conflict-type {
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      background: var(--ui-warning-bg, #ffc10733);
      color: var(--ui-warning, #ffc107);
    }

    .conflict-path {
      color: var(--ui-text);
      font-weight: 500;
    }

    .item-type {
      margin-left: auto;
      color: var(--ui-text-muted);
      font-size: 0.6875rem;
      text-transform: capitalize;
    }

    .conflict-body {
      padding: 0.75rem;
    }

    .versions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .version {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .version-label {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--ui-text-muted);
    }

    .delete-info {
      margin-bottom: 0.75rem;
    }

    .delete-info p {
      margin: 0 0 0.5rem;
      font-size: 0.8125rem;
      color: var(--ui-text-muted);
    }

    .actions {
      display: flex;
      gap: 0.5rem;
    }

    .legend {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--ui-border);
      font-size: 0.6875rem;
      color: var(--ui-text-muted);
    }

    .legend strong {
      color: var(--ui-text);
    }
  `]
})
export class MergeConflictDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<MergeConflictDialogResult>;
  readonly data = inject(DIALOG_DATA) as MergeConflictDialogData;

  private resolutions = signal<Map<string, ResolutionChoice>>(new Map());

  readonly resolvedCount = computed(() => this.resolutions().size);

  getConflictLabel(conflict: ItemConflict): string {
    switch (conflict.type) {
      case 'update': return 'UPDATE';
      case 'delete-local': return 'DELETE';
      case 'delete-remote': return 'DELETED';
    }
  }

  isResolved(conflictId: string): boolean {
    return this.resolutions().has(conflictId);
  }

  getResolution(conflictId: string): ResolutionChoice | undefined {
    return this.resolutions().get(conflictId);
  }

  resolve(conflictId: string, choice: string | number | null | undefined): void {
    if (!choice) return;
    this.resolutions.update(map => {
      const newMap = new Map(map);
      newMap.set(conflictId, choice as ResolutionChoice);
      return newMap;
    });
  }

  allResolved(): boolean {
    return this.resolutions().size === this.data.result.conflicts.length;
  }

  cancel(): void {
    this.dialogRef.close({ resolutions: [], cancelled: true });
  }

  apply(): void {
    const resolutions: ConflictResolution[] = [];
    this.resolutions().forEach((choice, conflictId) => {
      resolutions.push({ conflictId, choice });
    });
    this.dialogRef.close({ resolutions, cancelled: false });
  }
}
