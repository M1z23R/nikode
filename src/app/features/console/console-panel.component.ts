import { Component, inject, ElementRef, viewChild, effect } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ButtonComponent } from '@m1z23r/ngx-ui';
import { ConsoleService, LogEntry } from '../../core/services/console.service';

@Component({
  selector: 'app-console-panel',
  imports: [DatePipe, ButtonComponent],
  template: `
    <div class="console-panel">
      <header class="console-header">
        <span class="console-title">Console</span>
        <ui-button variant="ghost" size="sm" (clicked)="console.clear()" title="Clear console">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"/>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
        </ui-button>
      </header>
      <div class="console-content" #scrollContainer>
        @for (entry of console.entries(); track entry.id) {
          <div class="log-entry" [class]="'log-' + entry.level">
            <span class="log-timestamp">{{ entry.timestamp | date:'HH:mm:ss.SSS' }}</span>
            <span class="log-level">{{ entry.level.toUpperCase() }}</span>
            <span class="log-message">{{ entry.message }}</span>
          </div>
        } @empty {
          <div class="console-empty">No logs yet</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .console-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--ui-bg);
      border-top: 1px solid var(--ui-border);
    }

    .console-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.25rem 0.5rem;
      background-color: var(--ui-bg-secondary);
      border-bottom: 1px solid var(--ui-border);
      flex-shrink: 0;
    }

    .console-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--ui-text);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .console-content {
      flex: 1;
      overflow-y: auto;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      font-size: 0.75rem;
      padding: 0.5rem;
    }

    .log-entry {
      display: flex;
      gap: 0.5rem;
      padding: 0.125rem 0;
      border-bottom: 1px solid var(--ui-border-light, rgba(128, 128, 128, 0.1));
    }

    .log-timestamp {
      color: var(--ui-text-muted);
      flex-shrink: 0;
    }

    .log-level {
      flex-shrink: 0;
      width: 3rem;
      font-weight: 600;
    }

    .log-message {
      flex: 1;
      word-break: break-word;
    }

    .log-info .log-level { color: var(--ui-info, #3b82f6); }
    .log-warn .log-level { color: var(--ui-warning, #f59e0b); }
    .log-error .log-level { color: var(--ui-error, #ef4444); }
    .log-debug .log-level { color: var(--ui-text-muted); }

    .log-error .log-message { color: var(--ui-error, #ef4444); }
    .log-warn .log-message { color: var(--ui-warning, #f59e0b); }

    .console-empty {
      color: var(--ui-text-muted);
      font-style: italic;
      padding: 1rem;
      text-align: center;
    }
  `]
})
export class ConsolePanelComponent {
  protected console = inject(ConsoleService);
  private scrollContainer = viewChild<ElementRef<HTMLDivElement>>('scrollContainer');

  constructor() {
    effect(() => {
      const entries = this.console.entries();
      const container = this.scrollContainer()?.nativeElement;
      if (container && entries.length > 0) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight;
        });
      }
    });
  }
}
