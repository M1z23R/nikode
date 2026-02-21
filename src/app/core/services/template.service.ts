import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface TemplateSearchResult {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface TemplateDetail {
  id: string;
  name: string;
  description: string;
  category: string;
  data: any;
}

@Injectable({ providedIn: 'root' })
export class TemplateService {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async search(query: string, limit = 10): Promise<TemplateSearchResult[]> {
    const params = new URLSearchParams();
    if (query) {
      params.set('q', query);
    }
    params.set('limit', String(limit));

    const response = await fetch(
      `${environment.apiBaseUrl}/templates?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error('Failed to search templates');
    }

    return response.json();
  }

  searchDebounced(
    query: string,
    callback: (results: TemplateSearchResult[]) => void,
    debounceMs = 300
  ): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        const results = await this.search(query);
        callback(results);
      } catch (error) {
        console.error('Template search failed:', error);
        callback([]);
      }
    }, debounceMs);
  }

  async getById(id: string): Promise<TemplateDetail> {
    const response = await fetch(
      `${environment.apiBaseUrl}/templates/${id}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch template');
    }

    return response.json();
  }
}
