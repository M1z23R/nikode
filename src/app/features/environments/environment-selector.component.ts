import { Component, inject, computed } from '@angular/core';
import {
  DialogService,
  ButtonComponent,
  SelectComponent,
  OptionComponent
} from '@m1z23r/ngx-ui';
import { CollectionService } from '../../core/services/collection.service';
import { EnvironmentService } from '../../core/services/environment.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { EnvironmentEditorDialogComponent, EnvironmentEditorDialogData } from './environment-editor.dialog';

@Component({
  selector: 'app-environment-selector',
  imports: [ButtonComponent, SelectComponent, OptionComponent],
  template: `
    @if (activeCollection(); as col) {
      <div class="env-selector">
        <ui-select
          [value]="col.collection.activeEnvironmentId"
          (valueChange)="onEnvironmentChange($event?.toString() || '')">
          @for (env of col.collection.environments; track env.id) {
            <ui-option [value]="env.id">{{ env.name }}</ui-option>
          }
        </ui-select>
        <ui-button variant="ghost" size="sm" (clicked)="openEditor()" title="Edit Environments">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </ui-button>
      </div>
    } @else {
      <div class="no-collection">
        <span>No collection selected</span>
      </div>
    }
  `,
  styles: [`
    .env-selector {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    ui-select {
      min-width: 150px;
    }

    .no-collection {
      color: var(--ui-text-muted);
      font-size: 0.875rem;
    }
  `]
})
export class EnvironmentSelectorComponent {
  private collectionService = inject(CollectionService);
  private environmentService = inject(EnvironmentService);
  private workspace = inject(WorkspaceService);
  private dialogService = inject(DialogService);

  activeCollection = computed(() => {
    const activeRequest = this.workspace.activeRequest();
    if (activeRequest) {
      return this.collectionService.getCollection(activeRequest.collectionPath);
    }
    const collections = this.collectionService.collections();
    return collections.length > 0 ? collections[0] : undefined;
  });

  onEnvironmentChange(envId: string): void {
    const collection = this.activeCollection();
    if (collection) {
      this.environmentService.setActiveEnvironment(collection.path, envId);
    }
  }

  openEditor(): void {
    const collection = this.activeCollection();
    if (collection) {
      this.dialogService.open<EnvironmentEditorDialogComponent, EnvironmentEditorDialogData, void>(
        EnvironmentEditorDialogComponent,
        {
          data: { collectionPath: collection.path }
        }
      );
    }
  }
}
