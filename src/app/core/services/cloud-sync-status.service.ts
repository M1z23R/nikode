import { Injectable, signal, computed } from '@angular/core';

export type CloudSyncState = 'idle' | 'syncing' | 'success' | 'error';

export interface CloudSyncStatus {
  state: CloudSyncState;
  message?: string;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class CloudSyncStatusService {
  private status = signal<CloudSyncStatus>({
    state: 'idle',
    timestamp: Date.now()
  });

  private clearTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly currentStatus = this.status.asReadonly();

  readonly state = computed(() => this.status().state);
  readonly message = computed(() => this.status().message);

  syncing(message = 'Syncing...'): void {
    this.clearAutoReset();
    this.status.set({
      state: 'syncing',
      message,
      timestamp: Date.now()
    });
  }

  success(message = 'Synced'): void {
    this.status.set({
      state: 'success',
      message,
      timestamp: Date.now()
    });
    this.scheduleReset();
  }

  error(message = 'Sync failed'): void {
    this.status.set({
      state: 'error',
      message,
      timestamp: Date.now()
    });
    this.scheduleReset(5000);
  }

  idle(): void {
    this.clearAutoReset();
    this.status.set({
      state: 'idle',
      timestamp: Date.now()
    });
  }

  private scheduleReset(delay = 3000): void {
    this.clearAutoReset();
    this.clearTimeout = setTimeout(() => {
      this.status.set({
        state: 'idle',
        timestamp: Date.now()
      });
    }, delay);
  }

  private clearAutoReset(): void {
    if (this.clearTimeout) {
      clearTimeout(this.clearTimeout);
      this.clearTimeout = null;
    }
  }
}
