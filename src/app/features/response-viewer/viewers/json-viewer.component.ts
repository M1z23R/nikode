import { Component, input, computed } from '@angular/core';
import { CodeEditorComponent } from '../../../shared/code-editor/code-editor.component';

@Component({
  selector: 'app-json-viewer',
  standalone: true,
  imports: [CodeEditorComponent],
  template: `
    <div class="json-viewer">
      <app-code-editor
        [value]="displayValue()"
        language="json"
        [readonly]="true"
        [showLineNumbers]="true"
        [foldable]="true" />
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .json-viewer {
      height: 100%;
    }
  `]
})
export class JsonViewerComponent {
  body = input.required<string>();
  pretty = input(true);

  displayValue = computed(() => {
    const content = this.body();
    if (!this.pretty()) {
      return content;
    }
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  });
}
