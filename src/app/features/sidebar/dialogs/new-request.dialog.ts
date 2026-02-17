import { Component, inject, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  SelectComponent,
  OptionComponent,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';
import { FormsModule } from '@angular/forms';
import { HttpMethod, KeyValue, RequestBody } from '../../../core/models/collection.model';
import { parseCurl } from '../../../core/utils/curl';

export interface NewRequestDialogResult {
  type: 'request' | 'websocket' | 'graphql';
  name: string;
  method?: HttpMethod;
  url?: string;
  headers?: KeyValue[];
  params?: KeyValue[];
  body?: RequestBody;
}

@Component({
  selector: 'app-new-request-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent, SelectComponent, OptionComponent, FormsModule],
  template: `
    <ui-modal title="New Request" size="md">
      <div class="mode-tabs">
        <button
          class="mode-tab"
          [class.active]="mode() === 'manual'"
          (click)="mode.set('manual')">
          HTTP Request
        </button>
        <button
          class="mode-tab"
          [class.active]="mode() === 'websocket'"
          (click)="mode.set('websocket')">
          WebSocket
        </button>
        <button
          class="mode-tab"
          [class.active]="mode() === 'graphql'"
          (click)="mode.set('graphql')">
          GraphQL
        </button>
        <button
          class="mode-tab"
          [class.active]="mode() === 'curl'"
          (click)="mode.set('curl')">
          Import cURL
        </button>
      </div>

      @if (mode() === 'manual') {
        <div class="form-fields">
          <ui-input
            label="Request Name"
            [(value)]="name"
            placeholder="Get Users" />
          <ui-select
            label="Method"
            [(value)]="method">
            @for (m of methods; track m) {
              <ui-option [value]="m">{{ m }}</ui-option>
            }
          </ui-select>
        </div>
      } @else if (mode() === 'websocket') {
        <div class="form-fields">
          <ui-input
            label="Name"
            [(value)]="name"
            placeholder="My WebSocket" />
          <ui-input
            label="URL"
            [(value)]="wsUrl"
            placeholder="wss://example.com/socket" />
        </div>
      } @else if (mode() === 'graphql') {
        <div class="form-fields">
          <ui-input
            label="Name"
            [(value)]="name"
            placeholder="My GraphQL Query" />
          <ui-input
            label="Endpoint URL"
            [(value)]="gqlUrl"
            placeholder="https://api.example.com/graphql" />
        </div>
      } @else {
        <div class="form-fields">
          <ui-input
            label="Request Name"
            [(value)]="name"
            placeholder="Get Users" />
          <div class="curl-field">
            <label class="curl-label">cURL Command</label>
            <textarea
              class="curl-input"
              [ngModel]="curlCommand()"
              (ngModelChange)="onCurlChange($event)"
              placeholder="curl -X POST 'https://api.example.com/users' \\
  -H 'Content-Type: application/json' \\
  -d '{&quot;name&quot;: &quot;John&quot;}'"
              rows="6"
            ></textarea>
            @if (curlError()) {
              <div class="error-message">{{ curlError() }}</div>
            }
          </div>
        </div>
      }

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        <ui-button color="primary" (clicked)="submit()" [disabled]="!canSubmit()">Create</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .mode-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      border-bottom: 1px solid var(--ui-border);
      padding-bottom: 0.75rem;
    }

    .mode-tab {
      padding: 0.5rem 1rem;
      border: none;
      background: none;
      color: var(--ui-text-muted);
      font-size: 0.875rem;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s ease;

      &:hover {
        color: var(--ui-text);
        background-color: var(--ui-bg-secondary);
      }

      &.active {
        color: var(--ui-primary);
        background-color: color-mix(in srgb, var(--ui-primary) 10%, transparent);
      }
    }

    .form-fields {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .curl-field {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .curl-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--ui-text);
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
export class NewRequestDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<NewRequestDialogResult | undefined>;

  mode = signal<'manual' | 'websocket' | 'graphql' | 'curl'>('manual');
  name = signal('');
  method = signal<HttpMethod>('GET');
  methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  wsUrl = signal('');
  gqlUrl = signal('');

  curlCommand = signal('');
  curlError = signal('');
  private parsedCurl = signal<NewRequestDialogResult | null>(null);

  canSubmit = computed(() => {
    if (this.mode() === 'manual') {
      return this.name().trim().length > 0;
    } else if (this.mode() === 'websocket') {
      return this.name().trim().length > 0;
    } else if (this.mode() === 'graphql') {
      return this.name().trim().length > 0;
    } else {
      return this.name().trim().length > 0 && this.parsedCurl() !== null;
    }
  });

  onCurlChange(value: string): void {
    this.curlCommand.set(value);
    this.curlError.set('');
    this.parsedCurl.set(null);

    if (!value.trim()) return;

    const result = parseCurl(value);
    if (result.success) {
      this.parsedCurl.set({
        type: 'request',
        name: this.name().trim() || 'Imported Request',
        method: result.data.method,
        url: result.data.url,
        headers: result.data.headers,
        params: result.data.params,
        body: result.data.body
      });
    } else {
      this.curlError.set(result.error);
    }
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    const trimmedName = this.name().trim();
    if (!trimmedName) return;

    if (this.mode() === 'manual') {
      this.dialogRef.close({
        type: 'request',
        name: trimmedName,
        method: this.method()
      });
    } else if (this.mode() === 'websocket') {
      this.dialogRef.close({
        type: 'websocket',
        name: trimmedName,
        url: this.wsUrl()
      });
    } else if (this.mode() === 'graphql') {
      this.dialogRef.close({
        type: 'graphql',
        name: trimmedName,
        url: this.gqlUrl()
      });
    } else {
      const parsed = this.parsedCurl();
      if (parsed) {
        this.dialogRef.close({
          ...parsed,
          name: trimmedName
        });
      }
    }
  }
}
