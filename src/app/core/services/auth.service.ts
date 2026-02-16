import { Injectable, signal, computed, NgZone, inject } from '@angular/core';
import { IPC_CHANNELS, AuthTokens, AuthCallbackData, AuthErrorData, isIpcError } from '@shared/ipc-types';
import { User, AuthProvider } from '../models/auth.model';
import { environment } from '../../../environments/environment';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry

type AuthCallback = () => void | Promise<void>;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private ngZone = inject(NgZone);

  private _user = signal<User | null>(null);
  private _isLoading = signal(false);
  private _error = signal<string | null>(null);

  private refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  private tokens: AuthTokens | null = null;
  private authCallbackHandler: ((data: AuthCallbackData) => void) | null = null;
  private authErrorHandler: ((data: AuthErrorData) => void) | null = null;
  private onLoginCallbacks: AuthCallback[] = [];
  private onLogoutCallbacks: AuthCallback[] = [];

  readonly user = this._user.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    this.setupAuthCallbackListener();
    await this.restoreSession();
  }

  private setupAuthCallbackListener(): void {
    this.authCallbackHandler = (data: AuthCallbackData) => {
      this.ngZone.run(() => {
        this.handleAuthCallback(data);
      });
    };
    window.electronAPI.on(IPC_CHANNELS.AUTH_CALLBACK, this.authCallbackHandler);

    this.authErrorHandler = (data: AuthErrorData) => {
      this.ngZone.run(() => {
        this._isLoading.set(false);
        this._error.set(data.message);
      });
    };
    window.electronAPI.on(IPC_CHANNELS.AUTH_ERROR, this.authErrorHandler);
  }

  private async handleAuthCallback(data: AuthCallbackData): Promise<void> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      const expiresAt = data.expiresIn
        ? Date.now() + data.expiresIn * 1000
        : Date.now() + 3600 * 1000; // Default 1 hour

      const tokens: AuthTokens = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt,
      };

      await this.saveTokens(tokens);
      await this.fetchUserProfile();
      this.scheduleTokenRefresh();
      await this.notifyLogin();
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : 'Authentication failed');
      this._user.set(null);
    } finally {
      this._isLoading.set(false);
    }
  }

  async login(provider: AuthProvider): Promise<void> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      const response = await fetch(`${environment.apiBaseUrl}/auth/${provider}/consent`);
      if (!response.ok) {
        throw new Error('Failed to get consent URL');
      }

      const { url } = await response.json();
      // Open the consent URL in the default browser
      window.open(url, '_blank');
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : 'Failed to start login');
      this._isLoading.set(false);
    }
  }

  async logout(): Promise<void> {
    this._isLoading.set(true);

    try {
      if (this.tokens) {
        await fetch(`${environment.apiBaseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.tokens.accessToken}`,
          },
        }).catch(() => {
          // Ignore logout errors - we'll clear local state anyway
        });
      }

      await this.clearTokens();
      this._user.set(null);
      this._error.set(null);
      await this.notifyLogout();
    } finally {
      this._isLoading.set(false);
    }
  }

  getAccessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  onLogin(callback: AuthCallback): void {
    this.onLoginCallbacks.push(callback);
  }

  onLogout(callback: AuthCallback): void {
    this.onLogoutCallbacks.push(callback);
  }

  private async notifyLogin(): Promise<void> {
    for (const callback of this.onLoginCallbacks) {
      try {
        await callback();
      } catch (err) {
        console.error('Auth login callback error:', err);
      }
    }
  }

  private async notifyLogout(): Promise<void> {
    for (const callback of this.onLogoutCallbacks) {
      try {
        await callback();
      } catch (err) {
        console.error('Auth logout callback error:', err);
      }
    }
  }

  private async restoreSession(): Promise<void> {
    this._isLoading.set(true);

    try {
      const result = await window.electronAPI.invoke(IPC_CHANNELS.AUTH_GET_TOKENS);
      if (isIpcError(result) || !result.data) {
        return;
      }

      this.tokens = result.data;

      // Check if tokens are expired
      if (this.tokens.expiresAt < Date.now()) {
        await this.refreshTokens();
      } else {
        await this.fetchUserProfile();
        this.scheduleTokenRefresh();
        await this.notifyLogin();
      }
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : 'Failed to restore session');
    } finally {
      this._isLoading.set(false);
    }
  }

  private async fetchUserProfile(): Promise<void> {
    if (!this.tokens) {
      return;
    }

    const response = await fetch(`${environment.apiBaseUrl}/users/me`, {
      headers: {
        Authorization: `Bearer ${this.tokens.accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        await this.refreshTokens();
        return;
      }
      throw new Error('Failed to fetch user profile');
    }

    const user: User = await response.json();
    this._user.set(user);
  }

  private async refreshTokens(): Promise<void> {
    if (!this.tokens) {
      return;
    }

    try {
      const response = await fetch(`${environment.apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: this.tokens.refreshToken,
        }),
      });

      if (!response.ok) {
        // Refresh failed - clear session
        await this.clearTokens();
        this._user.set(null);
        return;
      }

      const data = await response.json();
      const expiresAt = data.expiresIn
        ? Date.now() + data.expiresIn * 1000
        : Date.now() + 3600 * 1000;

      const newTokens: AuthTokens = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt,
      };

      await this.saveTokens(newTokens);
      await this.fetchUserProfile();
      this.scheduleTokenRefresh();
    } catch {
      await this.clearTokens();
      this._user.set(null);
    }
  }

  private scheduleTokenRefresh(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    if (!this.tokens) {
      return;
    }

    const timeUntilRefresh = this.tokens.expiresAt - Date.now() - TOKEN_REFRESH_BUFFER_MS;

    if (timeUntilRefresh <= 0) {
      // Refresh immediately
      this.refreshTokens();
    } else {
      this.refreshTimeout = setTimeout(() => {
        this.ngZone.run(() => {
          this.refreshTokens();
        });
      }, timeUntilRefresh);
    }
  }

  private async saveTokens(tokens: AuthTokens): Promise<void> {
    this.tokens = tokens;
    await window.electronAPI.invoke(IPC_CHANNELS.AUTH_SAVE_TOKENS, tokens);
  }

  private async clearTokens(): Promise<void> {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
    this.tokens = null;
    await window.electronAPI.invoke(IPC_CHANNELS.AUTH_CLEAR_TOKENS);
  }
}
