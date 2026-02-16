import { Component, inject, signal, OnInit } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  SelectComponent,
  OptionComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';
import { TeamService } from '../../core/services/team.service';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { Workspace, Team } from '../../core/models/cloud.model';

@Component({
  selector: 'app-new-workspace-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent, SelectComponent, OptionComponent],
  template: `
    <ui-modal title="New Workspace" size="sm">
      <div class="form-group">
        <ui-input
          label="Workspace Name"
          [(value)]="name"
          placeholder="My Workspace"
          (keydown.enter)="submit()" />
      </div>

      <div class="form-group">
        <ui-select label="Type" [(value)]="workspaceType">
          <ui-option value="personal">Personal</ui-option>
          <ui-option value="team">Team</ui-option>
        </ui-select>
      </div>

      @if (workspaceType() === 'team') {
        <div class="form-group">
          <ui-select label="Team" [(value)]="selectedTeamId">
            @for (team of teams(); track team.id) {
              <ui-option [value]="team.id">{{ team.name }}</ui-option>
            }
          </ui-select>
        </div>
      }

      @if (error()) {
        <div class="error-message">{{ error() }}</div>
      }

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()" [disabled]="isLoading()">Cancel</ui-button>
        <ui-button
          color="primary"
          (clicked)="submit()"
          [disabled]="!canSubmit() || isLoading()">
          @if (isLoading()) {
            Creating...
          } @else {
            Create
          }
        </ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .form-group {
      margin-bottom: 1rem;
    }

    .error-message {
      color: var(--ui-danger);
      font-size: 0.8125rem;
      margin-top: 0.5rem;
    }
  `]
})
export class NewWorkspaceDialogComponent implements OnInit {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<Workspace | undefined>;
  private teamService = inject(TeamService);
  private cloudWorkspaceService = inject(CloudWorkspaceService);

  name = signal('');
  workspaceType = signal<'personal' | 'team'>('personal');
  selectedTeamId = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);

  teams = this.teamService.teams;

  ngOnInit(): void {
    const teamsList = this.teams();
    if (teamsList.length > 0) {
      this.selectedTeamId.set(teamsList[0].id);
    }
  }

  canSubmit(): boolean {
    const hasName = this.name().trim().length > 0;
    const hasTeam = this.workspaceType() === 'personal' || this.selectedTeamId().length > 0;
    return hasName && hasTeam;
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  async submit(): Promise<void> {
    if (!this.canSubmit() || this.isLoading()) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const teamId = this.workspaceType() === 'team' ? this.selectedTeamId() : undefined;
      const workspace = await this.cloudWorkspaceService.createWorkspace(
        this.name().trim(),
        teamId
      );
      this.dialogRef.close(workspace);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      this.isLoading.set(false);
    }
  }
}
