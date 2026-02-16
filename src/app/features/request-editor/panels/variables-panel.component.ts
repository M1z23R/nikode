import { Component, Input, inject } from '@angular/core';
import { OpenRequest } from '../../../core/models/request.model';
import { EnvironmentService } from '../../../core/services/environment.service';
import { extractVariableNames } from '../../../core/utils/variable-resolver';

@Component({
  selector: 'app-variables-panel',
  template: `
    <div class="variables-panel">
      <div class="info">
        <p>Variables used in this request:</p>
      </div>

      @if (usedVariables.length === 0) {
        <div class="no-variables">
          <p>No variables used. Use <code>{{ '{{variableName}}' }}</code> syntax in URL, headers, or body.</p>
        </div>
      } @else {
        <table class="variables-table">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Resolved Value</th>
            </tr>
          </thead>
          <tbody>
            @for (varName of usedVariables; track varName) {
              <tr>
                <td><code>{{ '{{' + varName + '}}' }}</code></td>
                <td>
                  @if (resolvedVariables[varName] !== undefined) {
                    <code>{{ resolvedVariables[varName] }}</code>
                  } @else {
                    <span class="unresolved">Not defined</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      padding: 1rem;
    }

    .variables-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .info {
      color: var(--ui-text-secondary);
      font-size: 0.875rem;
    }

    .no-variables {
      padding: 2rem;
      text-align: center;
      color: var(--ui-text-muted);
      font-size: 0.875rem;

      code {
        background-color: var(--ui-bg-secondary);
        padding: 0.125rem 0.375rem;
        border-radius: 4px;
        font-size: 0.875rem;
      }
    }

    .variables-table {
      width: 100%;
      border-collapse: collapse;

      th, td {
        padding: 0.5rem;
        text-align: left;
        border-bottom: 1px solid var(--ui-border);
      }

      th {
        font-weight: 500;
        font-size: 0.75rem;
        text-transform: uppercase;
        color: var(--ui-text-secondary);
      }

      code {
        background-color: var(--ui-bg-secondary);
        padding: 0.125rem 0.375rem;
        border-radius: 4px;
        font-size: 0.875rem;
      }
    }

    .unresolved {
      color: var(--ui-warning);
      font-style: italic;
      font-size: 0.875rem;
    }
  `]
})
export class VariablesPanelComponent {
  @Input({ required: true }) request!: OpenRequest;

  private environmentService = inject(EnvironmentService);

  get usedVariables(): string[] {
    const allText = [
      this.request.url,
      ...this.request.headers.map(h => h.value),
      this.request.body.content || ''
    ].join(' ');

    return extractVariableNames(allText);
  }

  get resolvedVariables(): Record<string, string> {
    return this.environmentService.resolveVariables(this.request.collectionPath);
  }
}
