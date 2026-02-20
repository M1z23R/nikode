import { Injectable, inject, signal, computed } from '@angular/core';
import { isIpcError } from '@shared/ipc-types';
import { ApiService } from './api.service';
import { Cookie } from '../models/request.model';

@Injectable({ providedIn: 'root' })
export class CookieJarService {
  private api = inject(ApiService);

  private cookieCache = signal<Map<string, Cookie[]>>(new Map());

  async loadCookies(collectionPath: string): Promise<Cookie[]> {
    const result = await this.api.getCookies(collectionPath);
    if (isIpcError(result)) {
      return [];
    }

    const cookies = result.data;
    this.cookieCache.update(cache => {
      const updated = new Map(cache);
      updated.set(collectionPath, cookies);
      return updated;
    });
    return cookies;
  }

  getCookies(collectionPath: string): Cookie[] {
    return this.cookieCache().get(collectionPath) || [];
  }

  async deleteCookie(collectionPath: string, name: string, domain: string, path: string): Promise<void> {
    const cookies = this.getCookies(collectionPath).filter(
      c => !(c.name === name && c.domain.toLowerCase() === domain.toLowerCase() && c.path === path)
    );

    const result = await this.api.saveCookies(collectionPath, cookies);
    if (!isIpcError(result)) {
      this.cookieCache.update(cache => {
        const updated = new Map(cache);
        updated.set(collectionPath, cookies);
        return updated;
      });
    }
  }

  async clearCookies(collectionPath: string): Promise<void> {
    const result = await this.api.clearCookies(collectionPath);
    if (!isIpcError(result)) {
      this.cookieCache.update(cache => {
        const updated = new Map(cache);
        updated.set(collectionPath, []);
        return updated;
      });
    }
  }

  cookieCount(collectionPath: string): number {
    return this.getCookies(collectionPath).length;
  }
}
