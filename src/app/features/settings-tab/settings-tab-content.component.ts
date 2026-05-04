import { Component, inject, computed } from '@angular/core';
import { TAB_DATA, TabsComponent, TabComponent } from '@m1z23r/ngx-ui';
import { RequestAuth } from '../../core/models/collection.model';
import { WorkspaceService } from '../../core/services/workspace.service';
import { UnifiedCollectionService } from '../../core/services/unified-collection.service';
import { AuthFormComponent } from '../request-editor/panels/auth-form.component';

export interface SettingsTabData {
  collectionPath: string;
  /** null → collection-level settings; otherwise the folder's CollectionItem id */
  folderId: string | null;
}

/**
 * Tab-style settings editor for a collection or folder. Contains the auth
 * configuration today; structured as a tabbed panel so future settings
 * (variables, scripts, headers, docs) can slot in.
 *
 * Edits are live: every change calls the appropriate workspace mutator,
 * which marks the collection dirty so the existing autosave persists.
 */
@Component({
  selector: 'app-settings-tab-content',
  imports: [TabsComponent, TabComponent, AuthFormComponent],
  template: `
    @if (target(); as t) {
      <div class="settings-tab">
        <header class="settings-header">
          <span class="settings-kind">{{ kindLabel() }}</span>
          <h2 class="settings-title">{{ t.name }}</h2>
        </header>

        <ui-tabs class="settings-body">
          <ui-tab label="Auth">
            <div class="panel">
              <app-auth-form
                [auth]="t.auth"
                [collectionPath]="data.collectionPath"
                [allowInherit]="data.folderId !== null"
                [targetLabel]="kindLabel()"
                (authChange)="onAuthChange($event)" />
            </div>
          </ui-tab>
        </ui-tabs>
      </div>
    } @else {
      <div class="settings-missing">
        This {{ kindLabel() }} no longer exists.
      </div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .settings-tab {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .settings-header {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      padding: 1rem 1.25rem 0.75rem;
      border-bottom: 1px solid var(--ui-border);
    }

    .settings-kind {
      font-size: 0.7rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--ui-text-muted);
    }

    .settings-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
    }

    .settings-body {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .panel {
      padding: 1rem 1.25rem;
      max-width: 720px;
    }

    .settings-missing {
      padding: 2rem;
      color: var(--ui-text-muted);
      font-size: 0.875rem;
    }
  `]
})
export class SettingsTabContentComponent {
  protected readonly data = inject(TAB_DATA) as SettingsTabData;
  private workspace = inject(WorkspaceService);
  private unifiedCollectionService = inject(UnifiedCollectionService);

  /**
   * Reactively look up the live target (collection or folder) from the
   * unified-collection signal so external changes (e.g. autosave reloads,
   * cloud sync) flow through.
   */
  protected target = computed<{ name: string; auth: RequestAuth } | null>(() => {
    const unified = this.unifiedCollectionService.getCollection(this.data.collectionPath);
    if (!unified) return null;

    if (this.data.folderId === null) {
      return {
        name: unified.collection.name,
        auth: unified.collection.auth ?? { type: 'none' },
      };
    }

    const folder = this.unifiedCollectionService.findItem(this.data.collectionPath, this.data.folderId);
    if (!folder || folder.type !== 'folder') return null;
    return {
      name: folder.name,
      auth: folder.auth ?? { type: 'inherit' },
    };
  });

  protected kindLabel = computed(() => this.data.folderId === null ? 'collection' : 'folder');

  onAuthChange(auth: RequestAuth): void {
    if (this.data.folderId === null) {
      this.workspace.updateCollectionAuth(this.data.collectionPath, auth);
    } else {
      this.workspace.updateFolderAuth(this.data.collectionPath, this.data.folderId, auth);
    }
  }
}
