import { Component, input, inject, computed } from '@angular/core';
import { OpenRequest } from '../../../core/models/request.model';
import { EnvironmentService } from '../../../core/services/environment.service';
import { extractVariableNames } from '../../../core/utils/variable-resolver';
import { GetPipe } from '../../../shared/pipes/get.pipe';

@Component({
  selector: 'app-variables-panel',
  imports: [GetPipe],
  template: `
    <div class="variables-panel">
      <div class="info">
        <p>Variables used in this request:</p>
      </div>

      @if (usedVariables().length === 0) {
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
            @for (varName of usedVariables(); track varName) {
              <tr>
                <td><code>{{ '{{' + varName + '}}' }}</code></td>
                <td>
                  @let value = resolvedVariables() | get: varName;
                  @if (value !== undefined) {
                    <code>{{ value }}</code>
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
  request = input.required<OpenRequest>();

  private environmentService = inject(EnvironmentService);

  usedVariables = computed(() => {
    const req = this.request();
    const allText = [
      req.url,
      ...req.headers.map(h => h.value),
      req.body.content || ''
    ].join(' ');

    return extractVariableNames(allText);
  });

  resolvedVariables = computed(() => {
    return this.environmentService.resolveVariables(this.request().collectionPath);
  });
}
