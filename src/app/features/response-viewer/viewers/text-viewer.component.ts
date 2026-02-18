import { Component, input, computed } from '@angular/core';
import { CodeEditorComponent } from '../../../shared/code-editor/code-editor.component';

@Component({
  selector: 'app-text-viewer',
  standalone: true,
  imports: [CodeEditorComponent],
  template: `
    <div class="text-viewer">
      <app-code-editor
        [value]="body()"
        [language]="detectedLanguage()"
        [readonly]="true"
        [showLineNumbers]="true" />
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    .text-viewer {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  `]
})
export class TextViewerComponent {
  body = input.required<string>();
  subtype = input<string>('plain');

  detectedLanguage = computed<'json' | 'javascript' | 'xml' | 'html' | 'text'>(() => {
    const sub = this.subtype().toLowerCase();

    if (sub === 'javascript' || sub === 'x-javascript' || sub === 'ecmascript') {
      return 'javascript';
    }
    if (sub === 'css') {
      return 'text';
    }

    return 'text';
  });
}
