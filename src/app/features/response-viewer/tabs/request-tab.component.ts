import { Component, Input } from '@angular/core';
import { TextareaComponent } from '@m1z23r/ngx-ui';
import { ProxyResponse } from '../../../core/models/request.model';

@Component({
  selector: 'app-request-tab',
  imports: [TextareaComponent],
  template: `
    <div class="request-tab">
      <div class="request-line">
        <span class="method">{{ response.sentRequest.method }}</span>
        <span class="url">{{ response.sentRequest.url }}</span>
      </div>

      <div class="section">
        <h4>Request Headers</h4>
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

      @if (response.sentRequest.body) {
        <div class="section">
          <h4>Request Body</h4>
          <ui-textarea
            [value]="formatBody(response.sentRequest.body)"
            [readonly]="true"
            [rows]="8"
            resize="vertical" />
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      padding: 1rem;
    }

    .request-tab {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .request-line {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background-color: var(--ui-bg-secondary);
      border-radius: 6px;
      font-family: monospace;
    }

    .method {
      font-weight: 600;
      color: var(--ui-accent);
    }

    .url {
      word-break: break-all;
    }

    .section {
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
export class RequestTabComponent {
  @Input({ required: true }) response!: ProxyResponse;

  get headerEntries(): [string, string][] {
    return Object.entries(this.response.sentRequest.headers);
  }

  formatBody(body: string): string {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
}
