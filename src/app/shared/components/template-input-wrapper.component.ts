import { Component, input, model, output, inject } from '@angular/core';
import {
  TemplateInputComponent,
  VariablePopoverDirective,
  InputComponent,
  ButtonComponent,
} from '@m1z23r/ngx-ui';
import { EnvironmentService } from '../../core/services/environment.service';
import { UnifiedCollectionService } from '../../core/services/unified-collection.service';
import { DYNAMIC_VARIABLE_LIST, isDynamicVariable } from '../../core/utils/dynamic-variables';

@Component({
  selector: 'app-template-input',
  imports: [TemplateInputComponent, VariablePopoverDirective, InputComponent, ButtonComponent],
  template: `
    <ui-template-input
      [(value)]="value"
      [variables]="templateVars"
      [placeholder]="placeholder()"
      [disabled]="disabled()"
      (keydown.enter)="enterPressed.emit()">
      <ng-template
        uiVariablePopover
        let-key
        let-val="value"
        let-state="state"
        let-close="close">
        <div class="var-popover">
          <div class="var-popover-header">
            <span class="var-popover-label">{{ isDynamic(key) ? 'Dynamic Variable' : 'Variable' }}</span>
            <span class="var-popover-key">{{ key }}</span>
          </div>
          @if (isDynamic(key)) {
            <div class="var-popover-desc">{{ val }}</div>
          } @else {
            <div class="var-popover-body">
              <ui-input
                class="var-popover-input"
                [value]="val"
                (valueChange)="editValue = $event.toString()"
                placeholder="Enter value..."
                (keydown.enter)="saveVariable(key, editValue || val, close)" />
              <ui-button
                size="sm"
                variant="ghost"
                (clicked)="saveVariable(key, editValue || val, close)"
                title="Save">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
              </ui-button>
            </div>
            @if (state === 'unknown') {
              <div class="var-popover-status">Not defined in environment</div>
            } @else if (state === 'unset') {
              <div class="var-popover-status unset">Value is empty</div>
            }
          }
        </div>
      </ng-template>
    </ui-template-input>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
    }

    ui-template-input {
      width: 100%;
    }

    .var-popover {
      padding: 14px 16px;
      min-width: 240px;
      max-width: 360px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
    }

    .var-popover-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--ui-border);
    }

    .var-popover-label {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--ui-text-muted);
    }

    .var-popover-key {
      font-family: "JetBrains Mono", "Fira Code", monospace;
      font-size: 13px;
      font-weight: 600;
      color: var(--ui-text);
    }

    .var-popover-body {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .var-popover-input {
      flex: 1;
      min-width: 0;
    }

    .var-popover-desc {
      font-size: 12px;
      color: var(--ui-text-secondary);
      padding: 4px 0;
    }

    .var-popover-status {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--ui-border);
      font-size: 11px;
      color: var(--ui-danger);
      font-weight: 500;

      &.unset {
        color: var(--ui-warning);
      }
    }

  `]
})
export class TemplateInputWrapperComponent {
  value = model('');
  placeholder = input('');
  disabled = input(false);
  collectionPath = input('');
  enterPressed = output();

  private environmentService = inject(EnvironmentService);
  private unifiedCollectionService = inject(UnifiedCollectionService);

  editValue: string = '';

  get templateVars() {
    const envVars = this.environmentService.getTemplateVariables(this.collectionPath());
    return [...envVars, ...DYNAMIC_VARIABLE_LIST.map(d => ({ key: d.key, value: d.description }))];
  }

  isDynamic(key: string): boolean {
    return isDynamicVariable(key);
  }

  saveVariable(key: string, value: string, close: () => void): void {
    const trimmed = value.trim();
    const path = this.collectionPath();
    if (!trimmed || !path) return;

    const env = this.environmentService.getActiveEnvironment(path);
    if (!env) return;

    const varIndex = env.variables.findIndex(v => v.key === key && v.enabled);
    if (varIndex >= 0) {
      const variable = env.variables[varIndex];
      if (variable.secret) {
        this.environmentService.updateSecret(path, env.id, key, trimmed);
      } else {
        this.environmentService.updateVariable(path, env.id, varIndex, { value: trimmed });
      }
    } else {
      this.environmentService.addVariable(path, env.id, {
        key,
        value: trimmed,
        enabled: true,
      });
    }

    this.unifiedCollectionService.save(path);
    close();
  }
}
