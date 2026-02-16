import { Injectable, signal, OnDestroy } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NetworkStatusService implements OnDestroy {
  private _isOnline = signal(navigator.onLine);

  readonly isOnline = this._isOnline.asReadonly();

  private onlineHandler = () => this._isOnline.set(true);
  private offlineHandler = () => this._isOnline.set(false);

  constructor() {
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
  }
}
