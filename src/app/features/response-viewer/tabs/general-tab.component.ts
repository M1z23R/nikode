import { Component, input } from '@angular/core';
import { ProxyResponse } from '../../../core/models/request.model';

@Component({
  selector: 'app-general-tab',
  template: `
    <div class="general-tab">
      <div class="status-row">
        <span class="status-code" [class]="getStatusClass()">
          {{ response().statusCode }}
        </span>
        <span class="status-text">{{ response().statusText }}</span>
      </div>

      <div class="stats">
        <div class="stat">
          <span class="stat-label">Time</span>
          <span class="stat-value">{{ response().time }} ms</span>
        </div>
        <div class="stat">
          <span class="stat-label">Size</span>
          <span class="stat-value">{{ formatSize(response().size) }}</span>
        </div>
      </div>

      <div class="response-headers">
        <h4>Response Headers</h4>
        <table class="headers-table">
          <tbody>
            @for (header of headerEntries; track header[0]) {
              <tr>
                <td class="header-key">{{ header[0] }}</td>
                <td class="header-value">{{ header[1] }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      padding: 1rem;
      height: 100%;
      overflow: auto;
      box-sizing: border-box;
    }

    .general-tab {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .status-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .status-code {
      font-size: 1.5rem;
      font-weight: 700;

      &.status-2xx { color: var(--ui-success); }
      &.status-3xx { color: var(--ui-accent); }
      &.status-4xx { color: var(--ui-warning); }
      &.status-5xx { color: var(--ui-error); }
    }

    .status-text {
      font-size: 1rem;
      color: var(--ui-text-secondary);
    }

    .stats {
      display: flex;
      gap: 2rem;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .stat-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--ui-text-muted);
    }

    .stat-value {
      font-size: 1rem;
      font-weight: 500;
    }

    .response-headers {
      h4 {
        font-size: 0.875rem;
        font-weight: 600;
        margin: 0 0 0.75rem 0;
      }
    }

    .headers-table {
      width: 100%;
      border-collapse: collapse;

      td {
        padding: 0.375rem 0.5rem;
        border-bottom: 1px solid var(--ui-border);
        font-size: 0.875rem;
        vertical-align: top;
      }

      .header-key {
        font-weight: 500;
        width: 200px;
        color: var(--ui-text-secondary);
      }

      .header-value {
        font-family: monospace;
        word-break: break-all;
      }
    }
  `]
})
export class GeneralTabComponent {
  response = input.required<ProxyResponse>();

  get headerEntries(): [string, string][] {
    return Object.entries(this.response().headers);
  }

  getStatusClass(): string {
    const code = this.response().statusCode;
    if (code >= 200 && code < 300) return 'status-2xx';
    if (code >= 300 && code < 400) return 'status-3xx';
    if (code >= 400 && code < 500) return 'status-4xx';
    return 'status-5xx';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
