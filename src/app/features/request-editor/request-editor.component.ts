import { Component, inject } from '@angular/core';
import { DynamicTabsComponent, TabsService } from '@m1z23r/ngx-ui';

@Component({
  selector: 'app-request-editor',
  imports: [DynamicTabsComponent],
  template: `
    <div class="request-editor">
      @if (tabsService.tabs().length > 0) {
        <ui-dynamic-tabs variant="default" />
      } @else {
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          <p>Select a request from the collection to get started</p>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .request-editor {
      display: flex;
      flex-direction: column;
      background-color: var(--ui-bg);
      height: 100%;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--ui-text-muted);
      gap: 1rem;
      padding: 2rem;
      text-align: center;
    }
  `]
})
export class RequestEditorComponent {
  protected tabsService = inject(TabsService);
}
