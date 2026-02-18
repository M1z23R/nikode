import { Component, input } from '@angular/core';
import { ProxyResponse } from '../../../core/models/request.model';

@Component({
  selector: 'app-cookies-tab',
  template: `
    <div class="cookies-tab">
      @if (response().cookies && response().cookies.length > 0) {
        <table class="cookies-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Value</th>
              <th>Domain</th>
              <th>Path</th>
              <th>Expires</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            @for (cookie of response().cookies; track cookie.name) {
              <tr>
                <td class="cookie-name">{{ cookie.name }}</td>
                <td class="cookie-value">{{ cookie.value }}</td>
                <td>{{ cookie.domain || '-' }}</td>
                <td>{{ cookie.path || '/' }}</td>
                <td>{{ cookie.expires || 'Session' }}</td>
                <td>
                  @if (cookie.httpOnly) {
                    <span class="flag">HttpOnly</span>
                  }
                  @if (cookie.secure) {
                    <span class="flag">Secure</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <div class="no-cookies">
          <p>No cookies in response</p>
        </div>
      }
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

    .cookies-tab {
      overflow-x: auto;
    }

    .cookies-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;

      th, td {
        padding: 0.5rem;
        text-align: left;
        border-bottom: 1px solid var(--ui-border);
      }

      th {
        font-weight: 500;
        font-size: 0.75rem;
        text-transform: uppercase;
        color: var(--ui-text-secondary);
        background-color: var(--ui-bg-secondary);
      }

      .cookie-name {
        font-weight: 500;
      }

      .cookie-value {
        font-family: monospace;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .flag {
      display: inline-block;
      padding: 0.125rem 0.375rem;
      margin-right: 0.25rem;
      font-size: 0.75rem;
      background-color: var(--ui-bg-tertiary);
      border-radius: 4px;
    }

    .no-cookies {
      padding: 2rem;
      text-align: center;
      color: var(--ui-text-muted);
    }
  `]
})
export class CookiesTabComponent {
  response = input.required<ProxyResponse>();
}
