import { Component, inject, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  SelectComponent,
  OptionComponent,
  CheckboxComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef,
  DialogService,
  SpinnerComponent,
  ToastService,
} from '@m1z23r/ngx-ui';
import { RunnerService } from '../../core/services/runner.service';
import { UnifiedCollectionService } from '../../core/services/unified-collection.service';
import { ApiService } from '../../core/services/api.service';
import { ReportGeneratorService } from '../../core/services/report-generator.service';
import { DataFile } from '../../core/models/runner.model';
import { ExportReportDialogComponent, ExportReportResult } from '../../shared/dialogs/export-report.dialog';
import { isIpcError } from '@shared/ipc-types';

export interface RunnerDialogData {
  collectionPath: string;
  targetId: string | null;
  targetType: 'collection' | 'folder' | 'request';
  targetName: string;
}

@Component({
  selector: 'app-runner-dialog',
  imports: [
    ModalComponent,
    ButtonComponent,
    InputComponent,
    SelectComponent,
    OptionComponent,
    CheckboxComponent,
    SpinnerComponent,
  ],
  template: `
    <ui-modal [title]="'Run: ' + data.targetName" size="lg">
      <div class="runner-content">
        <!-- Configuration Panel -->
        @if (!isRunning() && status() === 'idle') {
          <div class="config-section">
            <h4>Configuration</h4>
            <div class="config-grid">
              <ui-select label="Execution Mode" [value]="mode()" (valueChange)="onModeChange($any($event))">
                <ui-option value="sequential">Sequential</ui-option>
                <ui-option value="parallel">Parallel</ui-option>
              </ui-select>

              <ui-select label="Environment" [value]="selectedEnvironmentId()" (valueChange)="onEnvironmentChange($any($event))">
                <ui-option [value]="null">Use Active</ui-option>
                @for (env of environments(); track env.id) {
                  <ui-option [value]="env.id">{{ env.name }}</ui-option>
                }
              </ui-select>

              <ui-input
                label="Iterations"
                type="number"
                [value]="iterations().toString()"
                (valueChange)="onIterationsChange($any($event))"
                min="1"
                max="1000" />

              <ui-input
                label="Delay (ms)"
                type="number"
                [value]="delayMs().toString()"
                (valueChange)="onDelayChange($any($event))"
                min="0"
                max="60000" />
            </div>

            <div class="config-row">
              <ui-checkbox
                [checked]="stopOnError()"
                (checkedChange)="onStopOnErrorChange($event)">
                Stop on first error
              </ui-checkbox>
            </div>

            <!-- Data File -->
            <div class="data-file-section">
              <label class="data-file-label">Data File (CSV/JSON)</label>
              @if (dataFile()) {
                <div class="data-file-info">
                  <span class="data-file-name">{{ dataFile()!.name }}</span>
                  <span class="data-file-count">{{ dataFile()!.data.length }} rows</span>
                  <ui-button variant="ghost" size="sm" (clicked)="removeDataFile()">Remove</ui-button>
                </div>
              } @else {
                <input
                  #fileInput
                  type="file"
                  accept=".json,.csv"
                  (change)="onFileSelected($event)"
                  class="hidden" />
                <ui-button variant="ghost" size="sm" (clicked)="fileInput.click()">
                  Choose File
                </ui-button>
              }
            </div>
          </div>

          <!-- Requests Selection -->
          <div class="requests-section">
            <div class="requests-header">
              <h4>Requests ({{ selectedCount() }}/{{ requests().length }})</h4>
              <div class="requests-actions">
                <ui-button variant="ghost" size="sm" (clicked)="selectAll()">Select All</ui-button>
                <ui-button variant="ghost" size="sm" (clicked)="deselectAll()">Deselect All</ui-button>
              </div>
            </div>
            <div class="requests-list">
              @for (request of requests(); track request.id) {
                <div class="request-item" (click)="toggleRequest(request.id)">
                  <ui-checkbox [checked]="request.selected" />
                  <span class="request-method method-{{ request.method.toLowerCase() }}">{{ request.method }}</span>
                  <span class="request-name">{{ request.name }}</span>
                  @if (request.path.length > 0) {
                    <span class="request-path">{{ request.path.join(' / ') }}</span>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- Running / Results Panel -->
        @if (status() !== 'idle') {
          <div class="results-section">
            <!-- Summary -->
            <div class="summary-bar">
              <div class="summary-stat">
                <span class="stat-value">{{ summary().total }}</span>
                <span class="stat-label">Total</span>
              </div>
              <div class="summary-stat passed">
                <span class="stat-value">{{ summary().passed }}</span>
                <span class="stat-label">Passed</span>
              </div>
              <div class="summary-stat failed">
                <span class="stat-value">{{ summary().failed }}</span>
                <span class="stat-label">Failed</span>
              </div>
              <div class="summary-stat skipped">
                <span class="stat-value">{{ summary().skipped }}</span>
                <span class="stat-label">Skipped</span>
              </div>
              @if (summary().duration > 0) {
                <div class="summary-stat">
                  <span class="stat-value">{{ formatDuration(summary().duration) }}</span>
                  <span class="stat-label">Duration</span>
                </div>
              }
            </div>

            <!-- Progress -->
            @if (isRunning()) {
              <div class="progress-section">
                <div class="progress-info">
                  <ui-spinner size="sm" />
                  <span>
                    Running iteration {{ currentIteration() + 1 }}/{{ runner.config().iterations }}
                    - Request {{ currentRequestIndex() + 1 }}/{{ selectedCount() }}
                  </span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" [style.width.%]="progressPercent()"></div>
                </div>
              </div>
            }

            <!-- Results List -->
            <div class="results-list">
              @for (result of results(); track $index) {
                <div class="result-item" [class.expanded]="expandedResults().has($index)" (click)="toggleResultExpand($index)">
                  <div class="result-header">
                    <span class="result-status status-{{ result.status }}">
                      @switch (result.status) {
                        @case ('passed') { ✓ }
                        @case ('failed') { ✗ }
                        @case ('skipped') { ○ }
                        @case ('running') { ● }
                        @default { ○ }
                      }
                    </span>
                    <span class="request-method method-{{ result.method.toLowerCase() }}">{{ result.method }}</span>
                    <span class="result-name">{{ result.requestName }}</span>
                    @if (summary().iterations > 1) {
                      <span class="result-iteration">#{{ result.iteration + 1 }}</span>
                    }
                    @if (result.response) {
                      <span class="result-status-code" [class.success]="result.response.statusCode < 400">
                        {{ result.response.statusCode }}
                      </span>
                    }
                    @if (result.duration) {
                      <span class="result-duration">{{ result.duration }}ms</span>
                    }
                  </div>
                  @if (expandedResults().has($index) && (result.error || result.response || result.assertions?.length)) {
                    <div class="result-details">
                      @if (result.error) {
                        <div class="result-error">{{ result.error }}</div>
                      }
                      @if (result.assertions && result.assertions.length > 0) {
                        <div class="assertions-list">
                          @for (assertion of result.assertions; track assertion.name) {
                            <div class="assertion-item" [class.passed]="assertion.passed" [class.failed]="!assertion.passed">
                              <span class="assertion-icon">{{ assertion.passed ? '✓' : '✗' }}</span>
                              <span class="assertion-name">{{ assertion.name }}</span>
                              @if (assertion.message) {
                                <span class="assertion-message">{{ assertion.message }}</span>
                              }
                            </div>
                          }
                        </div>
                      }
                      @if (result.response) {
                        <div class="result-response">
                          <pre>{{ formatResponseBody(result.response.body) }}</pre>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>

      <ng-container footer>
        @if (status() === 'idle') {
          <ui-button variant="ghost" (clicked)="close()">Cancel</ui-button>
          <ui-button color="primary" (clicked)="run()" [disabled]="selectedCount() === 0">
            Run ({{ selectedCount() }} requests)
          </ui-button>
        } @else if (isRunning()) {
          <ui-button color="danger" (clicked)="stop()">Stop</ui-button>
        } @else {
          <ui-button variant="ghost" (clicked)="reset()">Run Again</ui-button>
          <ui-button variant="ghost" (clicked)="exportReport()">Export Report</ui-button>
          <ui-button color="primary" (clicked)="close()">Done</ui-button>
        }
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .runner-content {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      max-height: 70vh;
      overflow-y: auto;
    }

    h4 {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--ui-text-secondary);
    }

    .config-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .config-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }

    .config-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .data-file-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .data-file-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--ui-text);
    }

    .data-file-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      background: var(--ui-bg-secondary);
      border-radius: 6px;
    }

    .data-file-name {
      font-weight: 500;
    }

    .data-file-count {
      color: var(--ui-text-muted);
      font-size: 0.875rem;
    }

    .hidden {
      display: none;
    }

    .requests-section {
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      overflow: hidden;
    }

    .requests-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: var(--ui-bg-secondary);
      border-bottom: 1px solid var(--ui-border);

      h4 {
        margin: 0;
      }
    }

    .requests-actions {
      display: flex;
      gap: 0.5rem;
    }

    .requests-list {
      max-height: 250px;
      overflow-y: auto;
    }

    .request-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 1rem;
      cursor: pointer;
      border-bottom: 1px solid var(--ui-border);

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: var(--ui-bg-secondary);
      }
    }

    .request-method {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
      min-width: 3.5rem;
      text-align: center;
    }

    .method-get { background: #e3f2fd; color: #1565c0; }
    .method-post { background: #e8f5e9; color: #2e7d32; }
    .method-put { background: #fff3e0; color: #ef6c00; }
    .method-patch { background: #fce4ec; color: #c2185b; }
    .method-delete { background: #ffebee; color: #c62828; }
    .method-head { background: #f3e5f5; color: #7b1fa2; }
    .method-options { background: #e0f7fa; color: #00838f; }

    .request-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .request-path {
      color: var(--ui-text-muted);
      font-size: 0.75rem;
    }

    .results-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .summary-bar {
      display: flex;
      gap: 1.5rem;
      padding: 1rem;
      background: var(--ui-bg-secondary);
      border-radius: 8px;
    }

    .summary-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;

      .stat-value {
        font-size: 1.5rem;
        font-weight: 600;
      }

      .stat-label {
        font-size: 0.75rem;
        color: var(--ui-text-muted);
      }

      &.passed .stat-value { color: #2e7d32; }
      &.failed .stat-value { color: #c62828; }
      &.skipped .stat-value { color: #757575; }
    }

    .progress-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .progress-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: var(--ui-text-secondary);
    }

    .progress-bar {
      height: 4px;
      background: var(--ui-border);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--ui-primary);
      transition: width 0.2s ease;
    }

    .results-list {
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      max-height: 300px;
      overflow-y: auto;
    }

    .result-item {
      border-bottom: 1px solid var(--ui-border);
      cursor: pointer;

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: var(--ui-bg-secondary);
      }
    }

    .result-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 1rem;
    }

    .result-status {
      width: 1.25rem;
      height: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      border-radius: 50%;

      &.status-passed {
        background: #e8f5e9;
        color: #2e7d32;
      }

      &.status-failed {
        background: #ffebee;
        color: #c62828;
      }

      &.status-skipped {
        background: #f5f5f5;
        color: #757575;
      }

      &.status-running {
        background: #e3f2fd;
        color: #1565c0;
      }
    }

    .result-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .result-iteration {
      color: var(--ui-text-muted);
      font-size: 0.75rem;
    }

    .result-status-code {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: 3px;
      background: #ffebee;
      color: #c62828;

      &.success {
        background: #e8f5e9;
        color: #2e7d32;
      }
    }

    .result-duration {
      color: var(--ui-text-muted);
      font-size: 0.75rem;
    }

    .result-details {
      padding: 0 1rem 1rem 3rem;
    }

    .result-error {
      padding: 0.75rem;
      background: #ffebee;
      color: #c62828;
      border-radius: 4px;
      font-size: 0.875rem;
    }

    .result-response {
      pre {
        margin: 0;
        padding: 0.75rem;
        background: var(--ui-bg);
        border: 1px solid var(--ui-border);
        border-radius: 4px;
        font-size: 0.75rem;
        overflow-x: auto;
        max-height: 200px;
        overflow-y: auto;
      }
    }

    .assertions-list {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-bottom: 0.75rem;
    }

    .assertion-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.75rem;
      border-radius: 4px;
      font-size: 0.875rem;

      &.passed {
        background: #e8f5e9;
        color: #2e7d32;
      }

      &.failed {
        background: #ffebee;
        color: #c62828;
      }
    }

    .assertion-icon {
      font-weight: 600;
      width: 1rem;
    }

    .assertion-name {
      font-weight: 500;
    }

    .assertion-message {
      margin-left: auto;
      font-size: 0.75rem;
      opacity: 0.8;
    }
  `],
})
export class RunnerDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<void>;
  readonly data = inject(DIALOG_DATA) as RunnerDialogData;
  readonly runner = inject(RunnerService);
  private unifiedCollectionService = inject(UnifiedCollectionService);
  private dialogService = inject(DialogService);
  private api = inject(ApiService);
  private toastService = inject(ToastService);
  private reportGenerator = inject(ReportGeneratorService);

  // Local state for form fields
  mode = signal<'sequential' | 'parallel'>('sequential');
  selectedEnvironmentId = signal<string | null>(null);
  iterations = signal(1);
  delayMs = signal(0);
  stopOnError = signal(false);
  dataFile = signal<DataFile | null>(null);
  expandedResults = signal<Set<number>>(new Set());

  // Computed from runner service
  readonly status = this.runner.status;
  readonly requests = this.runner.requests;
  readonly results = this.runner.results;
  readonly summary = this.runner.summary;
  readonly isRunning = this.runner.isRunning;
  readonly currentIteration = this.runner.currentIteration;
  readonly currentRequestIndex = this.runner.currentRequestIndex;

  readonly selectedCount = computed(() =>
    this.requests().filter(r => r.selected).length
  );

  readonly progressPercent = computed(() => {
    const config = this.runner.config();
    const totalRequests = this.selectedCount() * config.iterations;
    const completed = this.results().length;
    return totalRequests > 0 ? (completed / totalRequests) * 100 : 0;
  });

  readonly environments = computed(() => {
    const col = this.unifiedCollectionService.getCollection(this.data.collectionPath);
    return col?.collection.environments || [];
  });

  constructor() {
    // Initialize the runner
    this.runner.initialize(
      this.data.collectionPath,
      this.data.targetId,
      this.data.targetType
    );
  }

  onModeChange(mode: unknown): void {
    const modeStr = String(mode) as 'sequential' | 'parallel';
    this.mode.set(modeStr);
    this.runner.updateConfig({ mode: modeStr });
  }

  onEnvironmentChange(envId: unknown): void {
    const id = envId === null || envId === 'null' ? null : String(envId);
    this.selectedEnvironmentId.set(id);
    this.runner.updateConfig({ environmentId: id });
  }

  onIterationsChange(value: unknown): void {
    const num = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (!isNaN(num) && num > 0) {
      this.iterations.set(num);
      this.runner.updateConfig({ iterations: num });
    }
  }

  onDelayChange(value: unknown): void {
    const num = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (!isNaN(num) && num >= 0) {
      this.delayMs.set(num);
      this.runner.updateConfig({ delayMs: num });
    }
  }

  onStopOnErrorChange(value: boolean): void {
    this.stopOnError.set(value);
    this.runner.updateConfig({ stopOnError: value });
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const dataFile = await this.runner.loadDataFile(file);
      this.dataFile.set(dataFile);
      this.runner.updateConfig({ dataFile });

      // Update iterations to match data rows if more than 1
      if (dataFile.data.length > 1) {
        this.iterations.set(dataFile.data.length);
        this.runner.updateConfig({ iterations: dataFile.data.length });
      }
    } catch (error) {
      console.error('Failed to parse data file:', error);
      alert('Failed to parse data file. Please ensure it is valid JSON or CSV.');
    }

    // Reset input
    input.value = '';
  }

  removeDataFile(): void {
    this.dataFile.set(null);
    this.runner.updateConfig({ dataFile: undefined });
    this.iterations.set(1);
    this.runner.updateConfig({ iterations: 1 });
  }

  toggleRequest(requestId: string): void {
    this.runner.toggleRequest(requestId);
  }

  selectAll(): void {
    this.runner.selectAll();
  }

  deselectAll(): void {
    this.runner.deselectAll();
  }

  toggleResultExpand(index: number): void {
    this.expandedResults.update(set => {
      const newSet = new Set(set);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }

  run(): void {
    this.runner.run(this.data.collectionPath);
  }

  stop(): void {
    this.runner.stop();
  }

  reset(): void {
    this.runner.reset();
    this.expandedResults.set(new Set());
  }

  close(): void {
    this.dialogRef.close();
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  formatResponseBody(body: string): string {
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return body.slice(0, 1000) + (body.length > 1000 ? '...' : '');
    }
  }

  async exportReport(): Promise<void> {
    // Open format selection dialog
    const dialogRef = this.dialogService.open<ExportReportDialogComponent, void, ExportReportResult | undefined>(
      ExportReportDialogComponent
    );
    const result = await dialogRef.afterClosed();

    if (!result) return;

    // Generate report content
    const state = this.runner.runnerState();
    const reportData = {
      summary: this.summary(),
      results: this.results(),
      config: this.runner.config(),
      targetName: this.data.targetName,
      startTime: state.startTime,
      endTime: state.endTime,
    };

    const content = result.format === 'html'
      ? this.reportGenerator.generateHtmlReport(reportData, { includeResponseBodies: result.includeResponseBodies })
      : this.reportGenerator.generateCsvReport(reportData, { includeResponseBodies: result.includeResponseBodies });

    // Show save dialog
    const extension = result.format === 'html' ? 'html' : 'csv';
    const filterName = result.format === 'html' ? 'HTML Files' : 'CSV Files';
    const defaultName = `${this.data.targetName.replace(/[^a-zA-Z0-9]/g, '_')}_report.${extension}`;

    const saveResult = await this.api.showSaveDialog({
      title: 'Save Report',
      defaultPath: defaultName,
      filters: [{ name: filterName, extensions: [extension] }]
    });

    if (isIpcError(saveResult) || saveResult.data.canceled || !saveResult.data.filePath) {
      return;
    }

    // Write file
    const writeResult = await this.api.writeFile(saveResult.data.filePath, content);

    if (isIpcError(writeResult)) {
      this.toastService.error('Failed to save report: ' + writeResult.error.message);
      return;
    }

    this.toastService.success('Report exported successfully');
  }
}
