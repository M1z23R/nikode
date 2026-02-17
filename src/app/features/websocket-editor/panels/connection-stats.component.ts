import { Component, input, signal, effect, OnDestroy } from '@angular/core';
import { OpenWebSocketConnection } from '../../../core/models/websocket.model';

@Component({
  selector: 'app-connection-stats',
  template: `
    <div class="stats">
      <div class="stat-item">
        <span class="stat-label">Status:</span>
        <span class="stat-value status" [class]="connection().status">
          {{ getStatusText() }}
        </span>
      </div>
      @if (connection().status === 'connected' && connection().stats.connectedAt) {
        <div class="stat-item">
          <span class="stat-label">Duration:</span>
          <span class="stat-value">{{ duration() }}</span>
        </div>
      }
      <div class="stat-item">
        <span class="stat-label">Sent:</span>
        <span class="stat-value">{{ connection().stats.messagesSent }} ({{ formatSize(connection().stats.bytesSent) }})</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Received:</span>
        <span class="stat-value">{{ connection().stats.messagesReceived }} ({{ formatSize(connection().stats.bytesReceived) }})</span>
      </div>
    </div>
  `,
  styles: [`
    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .stat-item {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.75rem;
    }

    .stat-label {
      color: var(--ui-text-muted);
    }

    .stat-value {
      font-weight: 500;
    }

    .status {
      padding: 0.125rem 0.375rem;
      border-radius: 4px;

      &.disconnected {
        background-color: rgba(107, 114, 128, 0.15);
        color: var(--ui-text-muted);
      }

      &.connecting, &.reconnecting {
        background-color: rgba(245, 158, 11, 0.15);
        color: var(--ui-warning);
      }

      &.connected {
        background-color: rgba(16, 185, 129, 0.15);
        color: var(--ui-success);
      }

      &.error {
        background-color: rgba(239, 68, 68, 0.15);
        color: var(--ui-error);
      }
    }
  `]
})
export class ConnectionStatsComponent implements OnDestroy {
  connection = input.required<OpenWebSocketConnection>();

  duration = signal('0:00');
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start/stop duration timer based on connection status
    effect(() => {
      const conn = this.connection();
      if (conn.status === 'connected' && conn.stats.connectedAt) {
        this.startDurationTimer(conn.stats.connectedAt);
      } else {
        this.stopDurationTimer();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopDurationTimer();
  }

  private startDurationTimer(connectedAt: number): void {
    this.stopDurationTimer();
    this.updateDuration(connectedAt);
    this.intervalId = setInterval(() => {
      this.updateDuration(connectedAt);
    }, 1000);
  }

  private stopDurationTimer(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private updateDuration(connectedAt: number): void {
    const seconds = Math.floor((Date.now() - connectedAt) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      this.duration.set(`${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
    } else {
      this.duration.set(`${minutes}:${String(seconds % 60).padStart(2, '0')}`);
    }
  }

  getStatusText(): string {
    const status = this.connection().status;
    switch (status) {
      case 'disconnected': return 'Disconnected';
      case 'connecting': return 'Connecting...';
      case 'connected': return 'Connected';
      case 'reconnecting': return 'Reconnecting...';
      case 'error': return 'Error';
      default: return status;
    }
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
