import { Component, input, computed } from '@angular/core';
import { ButtonComponent } from '@m1z23r/ngx-ui';

@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [ButtonComponent],
  template: `
    <div class="image-viewer">
      <div class="image-container">
        <img [src]="dataUrl()" [alt]="'Response image'" />
      </div>
      <div class="image-actions">
        <ui-button variant="ghost" size="sm" (clicked)="download()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download
        </ui-button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .image-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 1rem;
    }

    .image-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--ui-bg-subtle);
      border: 1px solid var(--ui-border);
      border-radius: 4px;
      overflow: auto;
      padding: 1rem;
    }

    .image-container img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .image-actions {
      display: flex;
      justify-content: flex-end;
    }
  `]
})
export class ImageViewerComponent {
  body = input.required<string>();
  mimeType = input<string>('image/png');

  dataUrl = computed(() => {
    return `data:${this.mimeType()};base64,${this.body()}`;
  });

  download(): void {
    const link = document.createElement('a');
    link.href = this.dataUrl();
    const ext = this.mimeType().split('/')[1] || 'bin';
    link.download = `response.${ext}`;
    link.click();
  }
}
