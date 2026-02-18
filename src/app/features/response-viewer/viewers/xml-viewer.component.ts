import { Component, input, computed } from '@angular/core';
import { CodeEditorComponent } from '../../../shared/code-editor/code-editor.component';

@Component({
  selector: 'app-xml-viewer',
  standalone: true,
  imports: [CodeEditorComponent],
  template: `
    <div class="xml-viewer">
      <app-code-editor
        [value]="displayValue()"
        language="xml"
        [readonly]="true"
        [showLineNumbers]="true"
        [foldable]="true" />
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

    .xml-viewer {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  `]
})
export class XmlViewerComponent {
  body = input.required<string>();
  pretty = input(true);

  displayValue = computed(() => {
    const content = this.body();
    if (!this.pretty()) {
      return content;
    }
    return this.formatXml(content);
  });

  private formatXml(xml: string): string {
    let formatted = '';
    let indent = '';
    const tab = '  ';

    xml.split(/>\s*</).forEach((node) => {
      if (node.match(/^\/\w/)) {
        indent = indent.substring(tab.length);
      }
      formatted += indent + '<' + node + '>\n';
      if (node.match(/^<?\w[^>]*[^/]$/) && !node.startsWith('?') && !node.startsWith('!')) {
        indent += tab;
      }
    });

    return formatted.substring(1, formatted.length - 2);
  }
}
