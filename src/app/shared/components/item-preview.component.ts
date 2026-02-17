import { Component, input } from '@angular/core';
import { CollectionItem, Environment } from '../../core/models/collection.model';

@Component({
  selector: 'app-item-preview',
  template: `
    @if (isCollectionItem(item())) {
      @switch (asItem(item()).type) {
        @case ('folder') {
          <div class="preview folder">
            <span class="icon">📁</span>
            <span class="name">{{ asItem(item()).name }}</span>
            <span class="meta">{{ asItem(item()).items?.length || 0 }} items</span>
          </div>
        }
        @case ('request') {
          <div class="preview request">
            <span class="method method-{{ asItem(item()).method?.toLowerCase() }}">{{ asItem(item()).method }}</span>
            <span class="url">{{ truncateUrl(asItem(item()).url) }}</span>
            @if (asItem(item()).headers?.length) {
              <span class="meta">{{ asItem(item()).headers?.length }} headers</span>
            }
          </div>
        }
        @case ('websocket') {
          <div class="preview websocket">
            <span class="method method-ws">WS</span>
            <span class="url">{{ truncateUrl(asItem(item()).url) }}</span>
            @if (asItem(item()).wsSavedMessages?.length) {
              <span class="meta">{{ asItem(item()).wsSavedMessages?.length }} saved messages</span>
            }
          </div>
        }
      }
    } @else {
      <div class="preview environment">
        <span class="icon">🌐</span>
        <span class="name">{{ asEnv(item()).name }}</span>
        <span class="meta">{{ asEnv(item()).variables.length }} variables</span>
      </div>
    }
  `,
  styles: [`
    .preview {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: var(--ui-bg-secondary);
      border-radius: 4px;
      font-size: 0.8125rem;
    }

    .icon {
      font-size: 1rem;
    }

    .name {
      font-weight: 500;
      color: var(--ui-text);
    }

    .method {
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .method-get { background: #61affe33; color: #61affe; }
    .method-post { background: #49cc9033; color: #49cc90; }
    .method-put { background: #fca13033; color: #fca130; }
    .method-patch { background: #50e3c233; color: #50e3c2; }
    .method-delete { background: #f93e3e33; color: #f93e3e; }
    .method-head { background: #9012fe33; color: #9012fe; }
    .method-options { background: #0d5aa733; color: #0d5aa7; }
    .method-ws { background: #9b59b633; color: #9b59b6; }

    .url {
      color: var(--ui-text-muted);
      font-family: var(--ui-font-mono);
      font-size: 0.75rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 200px;
    }

    .meta {
      margin-left: auto;
      color: var(--ui-text-muted);
      font-size: 0.6875rem;
    }
  `]
})
export class ItemPreviewComponent {
  readonly item = input.required<CollectionItem | Environment>();

  isCollectionItem(item: CollectionItem | Environment): item is CollectionItem {
    return 'type' in item;
  }

  asItem(item: CollectionItem | Environment): CollectionItem {
    return item as CollectionItem;
  }

  asEnv(item: CollectionItem | Environment): Environment {
    return item as Environment;
  }

  truncateUrl(url?: string): string {
    if (!url) return '';
    if (url.length <= 40) return url;
    return url.slice(0, 37) + '...';
  }
}
