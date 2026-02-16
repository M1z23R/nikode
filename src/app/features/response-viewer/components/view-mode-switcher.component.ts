import { Component, input, output, computed } from '@angular/core';

export type ViewMode = 'raw' | 'pretty' | 'preview';

@Component({
  selector: 'app-view-mode-switcher',
  standalone: true,
  template: `
    <div class="view-mode-switcher">
      @for (m of availableModes(); track m) {
        <button
          class="mode-btn"
          [class.active]="mode() === m"
          (click)="modeChange.emit(m)">
          {{ modeLabel(m) }}
        </button>
      }
    </div>
  `,
  styles: [`
    .view-mode-switcher {
      display: flex;
      gap: 2px;
      background: var(--ui-bg-subtle);
      border: 1px solid var(--ui-border);
      border-radius: 4px;
      padding: 2px;
    }

    .mode-btn {
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 500;
      border: none;
      background: transparent;
      color: var(--ui-text-muted);
      cursor: pointer;
      border-radius: 3px;
      transition: all 0.15s ease;

      &:hover {
        color: var(--ui-text);
      }

      &.active {
        background: var(--ui-bg);
        color: var(--ui-text);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }
    }
  `]
})
export class ViewModeSwitcherComponent {
  mode = input<ViewMode>('pretty');
  modes = input<ViewMode[]>(['raw', 'pretty']);

  modeChange = output<ViewMode>();

  availableModes = computed(() => this.modes());

  modeLabel(m: ViewMode): string {
    switch (m) {
      case 'raw': return 'Raw';
      case 'pretty': return 'Pretty';
      case 'preview': return 'Preview';
    }
  }
}
