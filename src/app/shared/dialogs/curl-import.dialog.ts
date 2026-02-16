import { Component, inject, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';
import { FormsModule } from '@angular/forms';
import { ParsedCurl, parseCurl } from '../../core/utils/curl';

@Component({
  selector: 'app-curl-import-dialog',
  imports: [ModalComponent, ButtonComponent, FormsModule],
  template: `
    <ui-modal title="Import cURL" size="lg">
      <div class="curl-import-content">
        <p class="help-text">Paste a cURL command below to import it as a request.</p>
        <textarea
          class="curl-input"
          [ngModel]="curlCommand()"
          (ngModelChange)="curlCommand.set($event)"
          placeholder="curl -X POST 'https://api.example.com/users' \\
  -H 'Content-Type: application/json' \\
  -d '{&quot;name&quot;: &quot;John&quot;}'"
          rows="8"
        ></textarea>
        @if (error()) {
          <div class="error-message">{{ error() }}</div>
        }
      </div>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        <ui-button color="primary" (clicked)="importCurl()" [disabled]="!canImport()">
          Import
        </ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .curl-import-content {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .help-text {
      color: var(--ui-text-muted);
      font-size: 0.875rem;
      margin: 0;
    }

    .curl-input {
      width: 100%;
      padding: 0.75rem;
      font-family: var(--ui-font-mono, ui-monospace, monospace);
      font-size: 0.875rem;
      line-height: 1.5;
      border: 1px solid var(--ui-border);
      border-radius: 4px;
      background-color: var(--ui-bg);
      color: var(--ui-text);
      resize: vertical;

      &:focus {
        outline: none;
        border-color: var(--ui-primary);
      }

      &::placeholder {
        color: var(--ui-text-muted);
      }
    }

    .error-message {
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
      color: var(--ui-danger);
      background-color: color-mix(in srgb, var(--ui-danger) 10%, transparent);
      border-radius: 4px;
    }
  `]
})
export class CurlImportDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<ParsedCurl | undefined>;

  curlCommand = signal('');
  error = signal('');

  canImport = computed(() => {
    const cmd = this.curlCommand().trim();
    return cmd.length > 0 && cmd.toLowerCase().startsWith('curl');
  });

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  importCurl(): void {
    const command = this.curlCommand().trim();
    if (!command) {
      this.error.set('Please enter a cURL command');
      return;
    }

    const result = parseCurl(command);

    if (result.success) {
      this.dialogRef.close(result.data);
    } else {
      this.error.set(result.error);
    }
  }
}
