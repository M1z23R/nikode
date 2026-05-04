import { Component, input, inject } from '@angular/core';
import { OpenRequest } from '../../../core/models/request.model';
import { RequestAuth } from '../../../core/models/collection.model';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthFormComponent } from './auth-form.component';

/**
 * Request-level auth panel. Thin wrapper around AuthFormComponent that wires
 * change events into WorkspaceService.updateRequestAuth.
 */
@Component({
  selector: 'app-auth-panel',
  imports: [AuthFormComponent],
  template: `
    <div class="auth-panel">
      <app-auth-form
        [auth]="request().auth"
        [collectionPath]="request().collectionPath"
        [allowInherit]="true"
        targetLabel="request"
        (authChange)="onAuthChange($event)" />
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .auth-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 1rem;
      overflow: hidden;
    }
  `]
})
export class AuthPanelComponent {
  request = input.required<OpenRequest>();

  private workspace = inject(WorkspaceService);

  onAuthChange(auth: RequestAuth): void {
    this.workspace.updateRequestAuth(this.request().id, auth);
  }
}
