import {
  Component,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { EditorState, Extension, Compartment } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { variableTooltip, variableTooltipTheme, VariableTooltipConfig } from './variable-tooltip.extension';
import { scriptCompletions } from './script-completions.extension';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { syntaxHighlighting, HighlightStyle, foldGutter, foldKeymap } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { oneDark } from '@codemirror/theme-one-dark';

// Light theme colors
const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#1e1e1e',
  },
  '.cm-content': {
    caretColor: '#6366f1',
    padding: '8px 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#6366f1',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  '.cm-gutters': {
    backgroundColor: '#f8f8f8',
    color: '#999',
    borderRight: '1px solid #e0e0e0',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#f0f0f0',
  },
  '.cm-activeLine': {
    backgroundColor: '#f5f5f5',
  },
  '.cm-line': {
    padding: '0 12px',
  },
}, { dark: false });

// Light mode syntax highlighting
const lightHighlighting = HighlightStyle.define([
  { tag: tags.keyword, color: '#7c3aed' },
  { tag: tags.string, color: '#16a34a' },
  { tag: tags.number, color: '#ea580c' },
  { tag: tags.bool, color: '#ea580c' },
  { tag: tags.null, color: '#ea580c' },
  { tag: tags.propertyName, color: '#2563eb' },
  { tag: tags.punctuation, color: '#64748b' },
  { tag: tags.bracket, color: '#64748b' },
  { tag: tags.comment, color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#1e1e1e' },
  { tag: tags.function(tags.variableName), color: '#2563eb' },
  { tag: tags.definition(tags.variableName), color: '#c026d3' },
  { tag: tags.operator, color: '#64748b' },
]);

// Dark mode syntax highlighting
const darkHighlighting = HighlightStyle.define([
  { tag: tags.keyword, color: '#c678dd' },
  { tag: tags.string, color: '#98c379' },
  { tag: tags.number, color: '#d19a66' },
  { tag: tags.bool, color: '#d19a66' },
  { tag: tags.null, color: '#d19a66' },
  { tag: tags.propertyName, color: '#61afef' },
  { tag: tags.punctuation, color: '#abb2bf' },
  { tag: tags.bracket, color: '#abb2bf' },
  { tag: tags.comment, color: '#5c6370', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#e06c75' },
  { tag: tags.function(tags.variableName), color: '#61afef' },
  { tag: tags.definition(tags.variableName), color: '#e5c07b' },
  { tag: tags.operator, color: '#abb2bf' },
]);

@Component({
  selector: 'app-code-editor',
  standalone: true,
  template: `<div #editorContainer class="editor-container"></div>`,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .editor-container {
      height: 100%;
      overflow: hidden;
      border-radius: 4px;
      border: 1px solid var(--ui-border);
    }

    :host ::ng-deep .cm-editor {
      height: 100%;
      font-family: 'JetBrains Mono', 'Fira Code', 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      line-height: 1.5;
    }

    :host ::ng-deep .cm-scroller {
      overflow: auto;
    }

    :host ::ng-deep .cm-placeholder {
      color: var(--ui-text-muted);
      font-style: italic;
    }

    :host ::ng-deep .cm-focused {
      outline: none;
    }
  `]
})
export class CodeEditorComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef<HTMLDivElement>;

  @Input() value = '';
  @Input() language: 'json' | 'javascript' | 'text' = 'json';
  @Input() placeholder = '';
  @Input() readonly = false;
  @Input() showLineNumbers = true;
  @Input() foldable = false;
  @Input() variableTooltip: VariableTooltipConfig | null = null;

  @Output() valueChange = new EventEmitter<string>();

  private editorView: EditorView | null = null;
  private skipNextUpdate = false;
  private themeCompartment = new Compartment();
  private observer: MutationObserver | null = null;

  ngAfterViewInit(): void {
    this.initEditor();
    this.observeThemeChanges();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && this.editorView && !this.skipNextUpdate) {
      const currentValue = this.editorView.state.doc.toString();
      if (currentValue !== this.value) {
        this.editorView.dispatch({
          changes: { from: 0, to: currentValue.length, insert: this.value }
        });
      }
    }
    this.skipNextUpdate = false;

    if (changes['language'] && !changes['language'].firstChange) {
      this.recreateEditor();
    }

    if (changes['variableTooltip'] && !changes['variableTooltip'].firstChange) {
      this.recreateEditor();
    }
  }

  ngOnDestroy(): void {
    this.editorView?.destroy();
    this.observer?.disconnect();
  }

  private isDarkMode(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  private getThemeExtensions(): Extension[] {
    if (this.isDarkMode()) {
      return [oneDark, syntaxHighlighting(darkHighlighting)];
    }
    return [lightTheme, syntaxHighlighting(lightHighlighting)];
  }

  private observeThemeChanges(): void {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          this.updateTheme();
        }
      }
    });

    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  private updateTheme(): void {
    if (!this.editorView) return;
    this.editorView.dispatch({
      effects: this.themeCompartment.reconfigure(this.getThemeExtensions())
    });
  }

  private initEditor(): void {
    const extensions: Extension[] = [
      highlightActiveLine(),
      history(),
      closeBrackets(),
      keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          this.skipNextUpdate = true;
          this.valueChange.emit(update.state.doc.toString());
        }
      }),
      this.themeCompartment.of(this.getThemeExtensions()),
    ];

    if (this.showLineNumbers) {
      extensions.push(lineNumbers(), highlightActiveLineGutter());
    }

    if (this.foldable) {
      extensions.push(foldGutter());
    }

    if (this.language === 'json') {
      extensions.push(json());
    } else if (this.language === 'javascript') {
      extensions.push(
        javascript(),
        autocompletion({
          override: [scriptCompletions],
        })
      );
    }

    if (this.placeholder) {
      extensions.push(cmPlaceholder(this.placeholder));
    }

    if (this.readonly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    if (this.variableTooltip) {
      extensions.push(variableTooltip(this.variableTooltip), variableTooltipTheme);
    }

    const state = EditorState.create({
      doc: this.value,
      extensions
    });

    this.editorView = new EditorView({
      state,
      parent: this.editorContainer.nativeElement
    });
  }

  private recreateEditor(): void {
    this.editorView?.destroy();
    this.initEditor();
  }

  formatJson(): boolean {
    if (!this.editorView) return false;

    const content = this.editorView.state.doc.toString();
    if (!content.trim()) return false;

    try {
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      this.editorView.dispatch({
        changes: { from: 0, to: content.length, insert: formatted }
      });
      this.skipNextUpdate = true;
      this.valueChange.emit(formatted);
      return true;
    } catch {
      return false;
    }
  }

  focus(): void {
    this.editorView?.focus();
  }
}
