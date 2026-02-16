import { Component, inject, signal } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  CheckboxComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';

export interface ExportEnvironmentDialogData {
  environmentName: string;
  hasSecrets: boolean;
}

export interface ExportEnvironmentResult {
  includeSecrets: boolean;
}

@Component({
  selector: 'app-export-environment-dialog',
  imports: [ModalComponent, ButtonComponent, CheckboxComponent],
  template: `
    <ui-modal title="Export Environment" size="sm">
      <p class="dialog-description">
        Export "{{ data.environmentName }}" to a file.
      </p>

      @if (data.hasSecrets) {
        <div class="secrets-option">
          <ui-checkbox
            [checked]="includeSecrets()"
            (checkedChange)="includeSecrets.set($event)">
            Include secret values
          </ui-checkbox>
          <p class="secrets-warning">
            Secret values will be exported in plain text. Only share the exported file with trusted parties.
          </p>
        </div>
      }

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        <ui-button color="primary" (clicked)="submit()">Export</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .dialog-description {
      margin: 0 0 1rem 0;
      color: var(--ui-text-secondary);
      font-size: var(--ui-font-sm);
    }

    .secrets-option {
      margin-top: 0.5rem;
    }

    .secrets-warning {
      margin: 0.5rem 0 0 1.5rem;
      font-size: var(--ui-font-xs);
      color: var(--ui-text-muted);
    }
  `]
})
export class ExportEnvironmentDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<ExportEnvironmentResult | undefined>;
  readonly data = inject(DIALOG_DATA) as ExportEnvironmentDialogData;

  includeSecrets = signal(false);

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    this.dialogRef.close({ includeSecrets: this.includeSecrets() });
  }
}
