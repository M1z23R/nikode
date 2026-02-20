import { Component, input, inject } from '@angular/core';
import { CheckboxComponent, InputComponent } from '@m1z23r/ngx-ui';
import { OpenRequest } from '../../../core/models/request.model';
import { WorkspaceService } from '../../../core/services/workspace.service';

@Component({
  selector: 'app-polling-panel',
  imports: [CheckboxComponent, InputComponent],
  template: `
    <div class="polling-panel">
      @if (request().polling) {
        <div class="polling-warning">
          Polling is currently active. Stop polling before changing configuration.
        </div>
      }
      <div class="setting-item">
        <ui-checkbox
          [checked]="request().pollingEnabled"
          (checkedChange)="onEnabledChange($event)"
          [disabled]="request().polling">
          Enable polling
        </ui-checkbox>
      </div>
      @if (request().pollingEnabled) {
        <div class="setting-item">
          <ui-input
            type="number"
            label="Interval (seconds)"
            hint="Time between requests (minimum 1 second)"
            [value]="'' + request().pollingInterval"
            (valueChange)="onIntervalChange($event)"
            [disabled]="request().polling" />
        </div>
        <div class="setting-item">
          <ui-input
            type="number"
            label="Max iterations"
            hint="Maximum number of requests to send (0 = unlimited)"
            [value]="'' + request().pollingMaxIterations"
            (valueChange)="onMaxIterationsChange($event)"
            [disabled]="request().polling" />
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      padding: 1rem;
    }

    .polling-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-width: 400px;
    }

    .polling-warning {
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      background: var(--ui-warning-bg, rgba(234, 179, 8, 0.1));
      color: var(--ui-warning-text, #ca8a04);
      font-size: 0.8125rem;
      border: 1px solid var(--ui-warning-border, rgba(234, 179, 8, 0.3));
    }
  `]
})
export class PollingPanelComponent {
  request = input.required<OpenRequest>();

  private workspace = inject(WorkspaceService);

  onEnabledChange(enabled: boolean): void {
    this.workspace.updateRequest(this.request().id, { pollingEnabled: enabled });
  }

  onIntervalChange(value: string | number): void {
    const interval = Math.max(1, parseInt(String(value), 10) || 1);
    this.workspace.updateRequest(this.request().id, { pollingInterval: interval });
  }

  onMaxIterationsChange(value: string | number): void {
    const max = Math.max(0, parseInt(String(value), 10) || 0);
    this.workspace.updateRequest(this.request().id, { pollingMaxIterations: max });
  }
}
