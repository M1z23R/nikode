import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ButtonComponent } from '@m1z23r/ngx-ui';
import { HttpLogService, HttpLogEntry, ExpandableSection } from '../../core/services/http-log.service';

@Component({
  selector: 'app-history-panel',
  imports: [DatePipe, ButtonComponent],
  template: `
    <div class="history-panel">
      <header class="history-header">
        <span class="history-title">History</span>
        <ui-button variant="ghost" size="sm" (clicked)="httpLog.clear()" title="Clear history">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"/>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
        </ui-button>
      </header>
      <div class="history-content">
        @for (entry of httpLog.entries(); track entry.id) {
          <div class="log-entry" [class.expanded]="entry.expanded" [class.error]="!!entry.error">
            <!-- Summary Row -->
            <div class="entry-summary" (click)="httpLog.toggle(entry.id)">
              <span class="expand-icon">
                @if (entry.expanded) {
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                } @else {
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                }
              </span>
              <span class="status-badge" [class]="getStatusClass(entry)">
                {{ entry.response?.statusCode || 'ERR' }}
              </span>
              <span class="method-badge" [class]="'method-' + entry.request.method.toLowerCase()">
                {{ entry.request.method }}
              </span>
              <span class="entry-url" [title]="entry.request.url">{{ truncateUrl(entry.request.url) }}</span>
              <span class="entry-duration">
                @if (entry.response) {
                  {{ entry.response.time }}ms
                } @else if (entry.error) {
                  Error
                }
              </span>
              <span class="entry-timestamp">{{ entry.timestamp | date:'HH:mm:ss' }}</span>
            </div>

            <!-- Expanded Content -->
            @if (entry.expanded) {
              <div class="entry-details">
                <!-- Request Section -->
                <div class="detail-section">
                  <div class="section-header" (click)="httpLog.toggleSection(entry.id, 'request'); $event.stopPropagation()">
                    <span class="section-toggle">
                      @if (entry.expandedSections.has('request')) {
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      } @else {
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      }
                    </span>
                    <span class="section-title">Request</span>
                  </div>
                  @if (entry.expandedSections.has('request')) {
                    <div class="section-content">
                      <div class="detail-group">
                        <span class="detail-label">Headers ({{ getHeaderCount(entry.request.headers) }})</span>
                        <div class="headers-table">
                          @for (header of getHeaders(entry.request.headers); track header.key) {
                            <div class="header-row">
                              <span class="header-key">{{ header.key }}:</span>
                              <span class="header-value">{{ header.value }}</span>
                            </div>
                          }
                          @if (getHeaderCount(entry.request.headers) === 0) {
                            <span class="empty-text">No headers</span>
                          }
                        </div>
                      </div>
                      @if (entry.request.body) {
                        <div class="detail-group">
                          <span class="detail-label">Body</span>
                          <pre class="body-content">{{ formatBody(entry.request.body) }}</pre>
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Response Section -->
                @if (entry.response) {
                  <div class="detail-section">
                    <div class="section-header" (click)="httpLog.toggleSection(entry.id, 'response'); $event.stopPropagation()">
                      <span class="section-toggle">
                        @if (entry.expandedSections.has('response')) {
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        } @else {
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        }
                      </span>
                      <span class="section-title">Response</span>
                    </div>
                    @if (entry.expandedSections.has('response')) {
                      <div class="section-content">
                        <div class="detail-group">
                          <span class="detail-label">Headers ({{ getHeaderCount(entry.response.headers) }})</span>
                          <div class="headers-table">
                            @for (header of getHeaders(entry.response.headers); track header.key) {
                              <div class="header-row">
                                <span class="header-key">{{ header.key }}:</span>
                                <span class="header-value">{{ header.value }}</span>
                              </div>
                            }
                            @if (getHeaderCount(entry.response.headers) === 0) {
                              <span class="empty-text">No headers</span>
                            }
                          </div>
                        </div>
                        <div class="detail-group">
                          <span class="detail-label">Body ({{ formatSize(entry.response.size) }})</span>
                          <pre class="body-content">{{ formatBody(entry.response.body) }}</pre>
                        </div>
                      </div>
                    }
                  </div>
                }

                <!-- Error Section -->
                @if (entry.error) {
                  <div class="detail-section error-section">
                    <div class="section-header">
                      <span class="section-title error-title">Error</span>
                    </div>
                    <div class="section-content">
                      <pre class="error-content">{{ entry.error }}</pre>
                    </div>
                  </div>
                }

                <!-- Metadata Section -->
                @if (entry.response) {
                  <div class="detail-section">
                    <div class="section-header" (click)="httpLog.toggleSection(entry.id, 'metadata'); $event.stopPropagation()">
                      <span class="section-toggle">
                        @if (entry.expandedSections.has('metadata')) {
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        } @else {
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        }
                      </span>
                      <span class="section-title">Metadata</span>
                    </div>
                    @if (entry.expandedSections.has('metadata')) {
                      <div class="section-content metadata-content">
                        <span class="metadata-item">
                          <span class="metadata-label">Size:</span> {{ formatSize(entry.response.size) }}
                        </span>
                        <span class="metadata-item">
                          <span class="metadata-label">Time:</span> {{ entry.response.time }}ms
                        </span>
                        <span class="metadata-item">
                          <span class="metadata-label">Cookies:</span> {{ entry.response.cookies.length }}
                        </span>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        } @empty {
          <div class="history-empty">No requests logged yet</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .history-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--ui-bg);
      border-top: 1px solid var(--ui-border);
    }

    .history-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.25rem 0.5rem;
      background-color: var(--ui-bg-secondary);
      border-bottom: 1px solid var(--ui-border);
      flex-shrink: 0;
    }

    .history-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--ui-text);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .history-content {
      flex: 1;
      overflow-y: auto;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      font-size: 0.75rem;
    }

    .log-entry {
      border-bottom: 1px solid var(--ui-border-light, rgba(128, 128, 128, 0.1));
    }

    .log-entry.error .entry-summary {
      background-color: rgba(239, 68, 68, 0.05);
    }

    .entry-summary {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      cursor: pointer;
      transition: background-color 0.15s;
    }

    .entry-summary:hover {
      background-color: var(--ui-bg-hover);
    }

    .expand-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ui-text-muted);
      flex-shrink: 0;
    }

    .status-badge {
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
      font-size: 0.6875rem;
      font-weight: 600;
      flex-shrink: 0;
    }

    .status-2xx { background-color: rgba(34, 197, 94, 0.15); color: #22c55e; }
    .status-3xx { background-color: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .status-4xx { background-color: rgba(249, 115, 22, 0.15); color: #f97316; }
    .status-5xx { background-color: rgba(239, 68, 68, 0.15); color: #ef4444; }
    .status-error { background-color: rgba(239, 68, 68, 0.15); color: #ef4444; }

    .method-badge {
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
      font-size: 0.6875rem;
      font-weight: 600;
      flex-shrink: 0;
    }

    .method-get { background-color: rgba(34, 197, 94, 0.15); color: #22c55e; }
    .method-post { background-color: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .method-put { background-color: rgba(249, 115, 22, 0.15); color: #f97316; }
    .method-patch { background-color: rgba(168, 85, 247, 0.15); color: #a855f7; }
    .method-delete { background-color: rgba(239, 68, 68, 0.15); color: #ef4444; }
    .method-head { background-color: rgba(107, 114, 128, 0.15); color: #6b7280; }
    .method-options { background-color: rgba(107, 114, 128, 0.15); color: #6b7280; }

    .entry-url {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--ui-text);
    }

    .entry-duration {
      color: var(--ui-text-muted);
      flex-shrink: 0;
      min-width: 50px;
      text-align: right;
    }

    .entry-timestamp {
      color: var(--ui-text-muted);
      flex-shrink: 0;
    }

    .entry-details {
      padding: 0 0.5rem 0.5rem 1.5rem;
    }

    .detail-section {
      margin-top: 0.5rem;
      border-left: 2px solid var(--ui-border);
      padding-left: 0.75rem;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      cursor: pointer;
      padding: 0.25rem 0;
    }

    .section-header:hover {
      color: var(--ui-text);
    }

    .section-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ui-text-muted);
    }

    .section-title {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ui-text-muted);
    }

    .error-title {
      color: #ef4444;
    }

    .section-content {
      padding: 0.25rem 0 0.25rem 1rem;
    }

    .detail-group {
      margin-bottom: 0.5rem;
    }

    .detail-label {
      display: block;
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ui-text-muted);
      margin-bottom: 0.25rem;
    }

    .headers-table {
      background-color: var(--ui-bg-secondary);
      border-radius: 4px;
      padding: 0.25rem 0.5rem;
    }

    .header-row {
      display: flex;
      gap: 0.5rem;
      padding: 0.125rem 0;
    }

    .header-key {
      color: var(--ui-text-muted);
      flex-shrink: 0;
    }

    .header-value {
      color: var(--ui-text);
      word-break: break-all;
    }

    .empty-text {
      color: var(--ui-text-muted);
      font-style: italic;
    }

    .body-content {
      background-color: var(--ui-bg-secondary);
      border-radius: 4px;
      padding: 0.5rem;
      margin: 0;
      max-height: 200px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--ui-text);
    }

    .error-content {
      background-color: rgba(239, 68, 68, 0.1);
      border-radius: 4px;
      padding: 0.5rem;
      margin: 0;
      color: #ef4444;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .error-section {
      border-left-color: #ef4444;
    }

    .metadata-content {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .metadata-item {
      color: var(--ui-text);
    }

    .metadata-label {
      color: var(--ui-text-muted);
    }

    .history-empty {
      color: var(--ui-text-muted);
      font-style: italic;
      padding: 1rem;
      text-align: center;
    }
  `]
})
export class HistoryPanelComponent {
  protected httpLog = inject(HttpLogService);

  getStatusClass(entry: HttpLogEntry): string {
    if (!entry.response) return 'status-error';
    const status = entry.response.statusCode;
    if (status >= 200 && status < 300) return 'status-2xx';
    if (status >= 300 && status < 400) return 'status-3xx';
    if (status >= 400 && status < 500) return 'status-4xx';
    if (status >= 500) return 'status-5xx';
    return 'status-error';
  }

  truncateUrl(url: string): string {
    if (url.length <= 60) return url;
    return url.substring(0, 57) + '...';
  }

  getHeaderCount(headers: Record<string, string>): number {
    return Object.keys(headers).length;
  }

  getHeaders(headers: Record<string, string>): { key: string; value: string }[] {
    return Object.entries(headers).map(([key, value]) => ({ key, value }));
  }

  formatBody(body: string | undefined): string {
    if (!body) return '';
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return body;
    }
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}
