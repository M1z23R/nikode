import { Component, input, computed, ElementRef, ViewChild, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import { CodeEditorComponent } from '../../../shared/code-editor/code-editor.component';

@Component({
  selector: 'app-html-viewer',
  standalone: true,
  imports: [CodeEditorComponent],
  template: `
    @if (preview()) {
      <div class="html-preview">
        <iframe
          #previewFrame
          sandbox="allow-same-origin"
          title="HTML Preview"></iframe>
      </div>
    } @else {
      <div class="html-source">
        <app-code-editor
          [value]="body()"
          language="html"
          [readonly]="true"
          [showLineNumbers]="true"
          [foldable]="true" />
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .html-preview {
      height: 100%;
      border: 1px solid var(--ui-border);
      border-radius: 4px;
      overflow: hidden;
      background: #fff;
    }

    .html-preview iframe {
      width: 100%;
      height: 100%;
      border: none;
    }

    .html-source {
      height: 100%;
    }
  `]
})
export class HtmlViewerComponent implements AfterViewInit, OnChanges {
  body = input.required<string>();
  preview = input(true);

  @ViewChild('previewFrame') previewFrame?: ElementRef<HTMLIFrameElement>;

  sanitizedHtml = computed(() => {
    return this.stripScripts(this.body());
  });

  ngAfterViewInit(): void {
    this.updatePreview();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['body'] || changes['preview']) {
      setTimeout(() => this.updatePreview());
    }
  }

  private updatePreview(): void {
    if (this.preview() && this.previewFrame?.nativeElement) {
      const iframe = this.previewFrame.nativeElement;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(this.sanitizedHtml());
        doc.close();
      }
    }
  }

  private stripScripts(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\son\w+\s*=/gi, ' data-removed-event=');
  }
}
