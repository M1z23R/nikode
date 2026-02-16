import { Injectable } from '@angular/core';
import { RunnerConfig, RunnerRequestResult, RunnerSummary } from '../models/runner.model';

export interface ReportData {
  summary: RunnerSummary;
  results: RunnerRequestResult[];
  config: RunnerConfig;
  targetName: string;
  startTime?: number;
  endTime?: number;
}

export interface ReportOptions {
  includeResponseBodies: boolean;
}

@Injectable({ providedIn: 'root' })
export class ReportGeneratorService {
  generateHtmlReport(data: ReportData, options: ReportOptions): string {
    const { summary, results, config, targetName, startTime, endTime } = data;
    const startDate = startTime ? new Date(startTime).toLocaleString() : 'N/A';
    const endDate = endTime ? new Date(endTime).toLocaleString() : 'N/A';

    const resultsHtml = results.map((result, index) => {
      const statusClass = result.status;
      const statusIcon = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '○';
      const methodClass = result.method.toLowerCase();
      const statusCode = result.response?.statusCode ?? '-';
      const duration = result.duration ?? '-';

      const assertionsHtml = result.assertions?.length
        ? `<div class="assertions">
            ${result.assertions.map(a => `
              <div class="assertion ${a.passed ? 'passed' : 'failed'}">
                <span class="assertion-icon">${a.passed ? '✓' : '✗'}</span>
                <span class="assertion-name">${this.escapeHtml(a.name)}</span>
                ${a.message ? `<span class="assertion-message">${this.escapeHtml(a.message)}</span>` : ''}
              </div>
            `).join('')}
          </div>`
        : '';

      const errorHtml = result.error
        ? `<div class="error">${this.escapeHtml(result.error)}</div>`
        : '';

      const responseBodyHtml = options.includeResponseBodies && result.response?.body
        ? `<div class="response-body">
            <details>
              <summary>Response Body (${this.formatSize(result.response.size)})</summary>
              <pre>${this.escapeHtml(this.truncateBody(result.response.body))}</pre>
            </details>
          </div>`
        : '';

      const responseHeadersHtml = options.includeResponseBodies && result.response?.headers
        ? `<div class="response-headers">
            <details>
              <summary>Response Headers</summary>
              <pre>${this.escapeHtml(JSON.stringify(result.response.headers, null, 2))}</pre>
            </details>
          </div>`
        : '';

      const hasDetails = result.error || result.assertions?.length || (options.includeResponseBodies && result.response);

      return `
        <tr class="result-row ${statusClass}" data-index="${index}">
          <td class="status-cell">
            <span class="status-icon status-${statusClass}">${statusIcon}</span>
          </td>
          <td class="method-cell">
            <span class="method method-${methodClass}">${result.method}</span>
          </td>
          <td class="name-cell">${this.escapeHtml(result.requestName)}</td>
          <td class="iteration-cell">${result.iteration + 1}</td>
          <td class="status-code-cell">
            <span class="status-code ${(result.response?.statusCode ?? 0) < 400 ? 'success' : 'error'}">${statusCode}</span>
          </td>
          <td class="duration-cell">${duration}${typeof duration === 'number' ? 'ms' : ''}</td>
          <td class="assertions-cell">${result.assertions?.length ?? 0}</td>
        </tr>
        ${hasDetails ? `
        <tr class="details-row" data-index="${index}">
          <td colspan="7">
            <div class="details-content">
              ${errorHtml}
              ${assertionsHtml}
              ${responseHeadersHtml}
              ${responseBodyHtml}
            </div>
          </td>
        </tr>
        ` : ''}
      `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report - ${this.escapeHtml(targetName)}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.5;
      color: #333;
      background: #f5f5f5;
      padding: 2rem;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
    }

    .header h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }

    .header .meta {
      font-size: 0.875rem;
      opacity: 0.9;
    }

    .summary {
      display: flex;
      gap: 1rem;
      padding: 1.5rem 2rem;
      background: #fafafa;
      border-bottom: 1px solid #eee;
      flex-wrap: wrap;
    }

    .summary-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1rem 1.5rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      min-width: 100px;
    }

    .summary-stat .value {
      font-size: 2rem;
      font-weight: 600;
    }

    .summary-stat .label {
      font-size: 0.75rem;
      color: #666;
      text-transform: uppercase;
    }

    .summary-stat.passed .value { color: #2e7d32; }
    .summary-stat.failed .value { color: #c62828; }
    .summary-stat.skipped .value { color: #757575; }

    .config-section {
      padding: 1rem 2rem;
      background: #fafafa;
      border-bottom: 1px solid #eee;
      font-size: 0.875rem;
      color: #666;
    }

    .config-section span {
      margin-right: 2rem;
    }

    .results-table {
      width: 100%;
      border-collapse: collapse;
    }

    .results-table th {
      background: #f5f5f5;
      padding: 0.75rem 1rem;
      text-align: left;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: #666;
      border-bottom: 1px solid #eee;
    }

    .results-table td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #eee;
      vertical-align: middle;
    }

    .result-row {
      cursor: pointer;
    }

    .result-row:hover {
      background: #fafafa;
    }

    .result-row.failed {
      background: #fff5f5;
    }

    .result-row.failed:hover {
      background: #ffebee;
    }

    .status-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      font-weight: 600;
      font-size: 0.875rem;
    }

    .status-passed { background: #e8f5e9; color: #2e7d32; }
    .status-failed { background: #ffebee; color: #c62828; }
    .status-skipped { background: #f5f5f5; color: #757575; }

    .method {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 3px;
      font-size: 0.75rem;
      font-weight: 600;
      min-width: 4rem;
      text-align: center;
    }

    .method-get { background: #e3f2fd; color: #1565c0; }
    .method-post { background: #e8f5e9; color: #2e7d32; }
    .method-put { background: #fff3e0; color: #ef6c00; }
    .method-patch { background: #fce4ec; color: #c2185b; }
    .method-delete { background: #ffebee; color: #c62828; }
    .method-head { background: #f3e5f5; color: #7b1fa2; }
    .method-options { background: #e0f7fa; color: #00838f; }

    .status-code {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 3px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .status-code.success { background: #e8f5e9; color: #2e7d32; }
    .status-code.error { background: #ffebee; color: #c62828; }

    .details-row {
      display: none;
    }

    .details-row.expanded {
      display: table-row;
    }

    .details-content {
      padding: 1rem;
      background: #fafafa;
    }

    .error {
      padding: 0.75rem;
      background: #ffebee;
      color: #c62828;
      border-radius: 4px;
      margin-bottom: 0.75rem;
      font-size: 0.875rem;
    }

    .assertions {
      margin-bottom: 0.75rem;
    }

    .assertion {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.75rem;
      border-radius: 4px;
      font-size: 0.875rem;
      margin-bottom: 0.25rem;
    }

    .assertion.passed { background: #e8f5e9; color: #2e7d32; }
    .assertion.failed { background: #ffebee; color: #c62828; }

    .assertion-icon { font-weight: 600; }
    .assertion-name { font-weight: 500; }
    .assertion-message { margin-left: auto; font-size: 0.75rem; opacity: 0.8; }

    .response-body, .response-headers {
      margin-top: 0.75rem;
    }

    .response-body details, .response-headers details {
      background: white;
      border: 1px solid #eee;
      border-radius: 4px;
    }

    .response-body summary, .response-headers summary {
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .response-body pre, .response-headers pre {
      padding: 0.75rem;
      background: #f5f5f5;
      font-size: 0.75rem;
      overflow-x: auto;
      max-height: 300px;
      overflow-y: auto;
      margin: 0;
      border-top: 1px solid #eee;
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .container {
        box-shadow: none;
      }

      .details-row {
        display: table-row !important;
      }

      .result-row {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Test Report: ${this.escapeHtml(targetName)}</h1>
      <div class="meta">
        <div>Started: ${startDate}</div>
        <div>Completed: ${endDate}</div>
      </div>
    </div>

    <div class="summary">
      <div class="summary-stat">
        <span class="value">${summary.total}</span>
        <span class="label">Total</span>
      </div>
      <div class="summary-stat passed">
        <span class="value">${summary.passed}</span>
        <span class="label">Passed</span>
      </div>
      <div class="summary-stat failed">
        <span class="value">${summary.failed}</span>
        <span class="label">Failed</span>
      </div>
      <div class="summary-stat skipped">
        <span class="value">${summary.skipped}</span>
        <span class="label">Skipped</span>
      </div>
      <div class="summary-stat">
        <span class="value">${this.formatDuration(summary.duration)}</span>
        <span class="label">Duration</span>
      </div>
    </div>

    <div class="config-section">
      <span><strong>Mode:</strong> ${config.mode}</span>
      <span><strong>Iterations:</strong> ${config.iterations}</span>
      <span><strong>Delay:</strong> ${config.delayMs}ms</span>
      <span><strong>Stop on Error:</strong> ${config.stopOnError ? 'Yes' : 'No'}</span>
    </div>

    <table class="results-table">
      <thead>
        <tr>
          <th style="width: 50px">Status</th>
          <th style="width: 80px">Method</th>
          <th>Name</th>
          <th style="width: 80px">Iteration</th>
          <th style="width: 80px">Status Code</th>
          <th style="width: 100px">Duration</th>
          <th style="width: 100px">Assertions</th>
        </tr>
      </thead>
      <tbody>
        ${resultsHtml}
      </tbody>
    </table>
  </div>

  <script>
    document.querySelectorAll('.result-row').forEach(row => {
      row.addEventListener('click', () => {
        const index = row.dataset.index;
        const detailsRow = document.querySelector('.details-row[data-index="' + index + '"]');
        if (detailsRow) {
          detailsRow.classList.toggle('expanded');
        }
      });
    });
  </script>
</body>
</html>`;
  }

  generateCsvReport(data: ReportData, options: ReportOptions): string {
    const { results } = data;

    const baseHeaders = [
      'Iteration',
      'Request Name',
      'Method',
      'Status',
      'Status Code',
      'Duration (ms)',
      'Error',
      'Assertion Count',
      'Assertions Passed',
      'Assertions Failed',
      'Response Size'
    ];

    const headers = options.includeResponseBodies
      ? [...baseHeaders, 'Response Headers', 'Response Body']
      : baseHeaders;

    const rows = results.map(result => {
      const assertionsPassed = result.assertions?.filter(a => a.passed).length ?? 0;
      const assertionsFailed = result.assertions?.filter(a => !a.passed).length ?? 0;

      const baseRow = [
        result.iteration + 1,
        result.requestName,
        result.method,
        result.status,
        result.response?.statusCode ?? '',
        result.duration ?? '',
        result.error ?? '',
        result.assertions?.length ?? 0,
        assertionsPassed,
        assertionsFailed,
        result.response?.size ?? ''
      ];

      if (options.includeResponseBodies) {
        const responseHeaders = result.response?.headers
          ? JSON.stringify(result.response.headers)
          : '';
        const responseBody = result.response?.body
          ? this.truncateBody(result.response.body)
          : '';

        return [...baseRow, responseHeaders, responseBody];
      }

      return baseRow;
    });

    const csvLines = [
      headers.map(h => this.escapeCsvField(String(h))).join(','),
      ...rows.map(row => row.map(cell => this.escapeCsvField(String(cell))).join(','))
    ];

    return csvLines.join('\n');
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private escapeCsvField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  private formatBody(body: string): string {
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return body;
    }
  }

  private truncateBody(body: string, maxLength = 10240): string {
    const formatted = this.formatBody(body);
    if (formatted.length <= maxLength) return formatted;
    return formatted.slice(0, maxLength) + '... [truncated]';
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
