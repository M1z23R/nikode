import { Component, input, computed } from '@angular/core';
import { ButtonComponent } from '@m1z23r/ngx-ui';

@Component({
  selector: 'app-binary-viewer',
  standalone: true,
  imports: [ButtonComponent],
  template: `
    <div class="binary-viewer">
      <div class="hex-container">
        <pre class="hex-dump">{{ hexDump() }}</pre>
      </div>
      <div class="binary-info">
        <span class="size-label">Size: {{ formattedSize() }}</span>
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

    .binary-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 1rem;
    }

    .hex-container {
      flex: 1;
      overflow: auto;
      background: var(--ui-bg-subtle);
      border: 1px solid var(--ui-border);
      border-radius: 4px;
      padding: 1rem;
    }

    .hex-dump {
      margin: 0;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre;
      color: var(--ui-text);
    }

    .binary-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .size-label {
      font-size: 0.875rem;
      color: var(--ui-text-muted);
    }
  `]
})
export class BinaryViewerComponent {
  body = input.required<string>();
  mimeType = input<string>('application/octet-stream');
  size = input<number>(0);

  private readonly BYTES_PER_LINE = 16;
  private readonly MAX_LINES = 100;

  hexDump = computed(() => {
    const base64 = this.body();
    const bytes = this.base64ToBytes(base64);
    const lines: string[] = [];
    const maxBytes = this.BYTES_PER_LINE * this.MAX_LINES;
    const displayBytes = bytes.slice(0, maxBytes);

    for (let i = 0; i < displayBytes.length; i += this.BYTES_PER_LINE) {
      const offset = i.toString(16).padStart(8, '0');
      const chunk = displayBytes.slice(i, i + this.BYTES_PER_LINE);

      const hex = Array.from(chunk)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ');

      const ascii = Array.from(chunk)
        .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
        .join('');

      const paddedHex = hex.padEnd(this.BYTES_PER_LINE * 3 - 1, ' ');
      lines.push(`${offset}  ${paddedHex}  |${ascii}|`);
    }

    if (bytes.length > maxBytes) {
      lines.push(`... (${bytes.length - maxBytes} more bytes)`);
    }

    return lines.join('\n');
  });

  formattedSize = computed(() => {
    const bytes = this.size();
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  });

  private base64ToBytes(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  download(): void {
    const bytes = this.base64ToBytes(this.body());
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: this.mimeType() });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const ext = this.mimeType().split('/')[1] || 'bin';
    link.download = `response.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
