import { Component, inject, signal, computed, model, OnInit } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef,
} from '@m1z23r/ngx-ui';
import { CookieJarService } from '../../core/services/cookie-jar.service';
import { Cookie } from '../../core/models/request.model';

export interface CookieJarDialogData {
  collectionPath: string;
}

@Component({
  selector: 'app-cookie-jar-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent],
  template: `
    <ui-modal title="Cookie Jar" size="lg">
      <div class="cookie-jar-content">
        <div class="toolbar">
          <ui-input
            placeholder="Filter cookies..."
            [(value)]="filter"
            size="sm"
          />
          <ui-button variant="ghost" size="sm" color="danger" (clicked)="clearAll()" [disabled]="cookies().length === 0">
            Clear All
          </ui-button>
        </div>

        @if (filteredCookies().length === 0) {
          <div class="empty-state">
            @if (cookies().length === 0) {
              No cookies stored for this collection.
            } @else {
              No cookies match the filter.
            }
          </div>
        } @else {
          <div class="cookie-table-wrapper">
            <table class="cookie-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Domain</th>
                  <th>Path</th>
                  <th>Expires</th>
                  <th>Flags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (cookie of filteredCookies(); track cookie.name + cookie.domain + cookie.path) {
                  <tr>
                    <td class="cell-name" [title]="cookie.name">{{ cookie.name }}</td>
                    <td class="cell-value" [title]="cookie.value">{{ cookie.value }}</td>
                    <td class="cell-domain">{{ cookie.domain }}</td>
                    <td class="cell-path">{{ cookie.path }}</td>
                    <td class="cell-expires">{{ cookie.expires || '-' }}</td>
                    <td class="cell-flags">
                      @if (cookie.httpOnly) { <span class="flag">HttpOnly</span> }
                      @if (cookie.secure) { <span class="flag">Secure</span> }
                    </td>
                    <td class="cell-actions">
                      <ui-button variant="ghost" size="sm" color="danger" (clicked)="deleteCookie(cookie)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </ui-button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="close()">Close</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .cookie-jar-content {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-height: 200px;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .toolbar ui-input {
      flex: 1;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      color: var(--ui-text-muted);
      font-size: 0.875rem;
    }

    .cookie-table-wrapper {
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
    }

    .cookie-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125rem;
    }

    .cookie-table th {
      text-align: left;
      padding: 0.375rem 0.5rem;
      border-bottom: 1px solid var(--ui-border);
      color: var(--ui-text-muted);
      font-weight: 500;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      position: sticky;
      top: 0;
      background: var(--ui-bg);
    }

    .cookie-table td {
      padding: 0.375rem 0.5rem;
      border-bottom: 1px solid var(--ui-border);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cookie-table tbody tr:hover {
      background-color: var(--ui-bg-hover);
    }

    .cell-name {
      max-width: 150px;
      font-weight: 500;
    }

    .cell-value {
      max-width: 200px;
      font-family: monospace;
      font-size: 0.75rem;
    }

    .cell-domain {
      max-width: 120px;
    }

    .cell-path {
      max-width: 80px;
    }

    .cell-expires {
      max-width: 150px;
      font-size: 0.75rem;
      color: var(--ui-text-muted);
    }

    .flag {
      font-size: 0.6875rem;
      padding: 0.0625rem 0.25rem;
      border-radius: 2px;
      background-color: var(--ui-bg-secondary);
      color: var(--ui-text-muted);
      margin-right: 0.25rem;
    }

    .cell-actions {
      width: 32px;
      text-align: center;
    }
  `]
})
export class CookieJarDialogComponent implements OnInit {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<void>;
  readonly data = inject(DIALOG_DATA) as CookieJarDialogData;
  private cookieJarService = inject(CookieJarService);

  protected cookies = signal<Cookie[]>([]);
  protected filter = model('');

  protected filteredCookies = computed(() => {
    const f = this.filter().toLowerCase();
    const all = this.cookies();
    if (!f) return all;
    return all.filter(c =>
      c.name.toLowerCase().includes(f) ||
      c.value.toLowerCase().includes(f) ||
      c.domain.toLowerCase().includes(f) ||
      c.path.toLowerCase().includes(f)
    );
  });

  async ngOnInit(): Promise<void> {
    const cookies = await this.cookieJarService.loadCookies(this.data.collectionPath);
    this.cookies.set(cookies);
  }

  protected async deleteCookie(cookie: Cookie): Promise<void> {
    await this.cookieJarService.deleteCookie(
      this.data.collectionPath,
      cookie.name,
      cookie.domain,
      cookie.path
    );
    this.cookies.set(this.cookieJarService.getCookies(this.data.collectionPath));
  }

  protected async clearAll(): Promise<void> {
    await this.cookieJarService.clearCookies(this.data.collectionPath);
    this.cookies.set([]);
  }

  protected close(): void {
    this.dialogRef.close();
  }
}
