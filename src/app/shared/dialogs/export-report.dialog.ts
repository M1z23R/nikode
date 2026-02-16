import { Component, inject, signal } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  RadioGroupComponent,
  RadioComponent,
  CheckboxComponent,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';

export type ReportFormat = 'html' | 'csv';

export interface ExportReportResult {
  format: ReportFormat;
  includeResponseBodies: boolean;
}

@Component({
  selector: 'app-export-report-dialog',
  imports: [ModalComponent, ButtonComponent, RadioGroupComponent, RadioComponent, CheckboxComponent],
  template: `
    <ui-modal title="Export Report" size="sm">
      <p class="dialog-description">
        Export the test run results to a file.
      </p>

      <ui-radio-group [(value)]="format" label="Format">
        <ui-radio value="html">HTML Report</ui-radio>
        <ui-radio value="csv">CSV (Spreadsheet)</ui-radio>
      </ui-radio-group>

      <div class="checkbox-section">
        <ui-checkbox
          [checked]="includeResponseBodies()"
          (checkedChange)="includeResponseBodies.set($event)">
          Include response bodies
        </ui-checkbox>
        @if (includeResponseBodies()) {
          <p class="warning-text">
            Response bodies will be truncated to 10KB each to keep file size manageable.
          </p>
        }
      </div>

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

    .checkbox-section {
      margin-top: 1rem;
    }

    .warning-text {
      margin: 0.5rem 0 0 1.5rem;
      font-size: 0.75rem;
      color: var(--ui-text-muted);
    }
  `]
})
export class ExportReportDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<ExportReportResult | undefined>;

  format = signal<ReportFormat>('html');
  includeResponseBodies = signal(false);

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    this.dialogRef.close({
      format: this.format(),
      includeResponseBodies: this.includeResponseBodies()
    });
  }
}
