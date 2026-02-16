import { Injectable, signal } from '@angular/core';
import { HttpMethod } from '../models/collection.model';
import { ProxyRequest, ProxyResponse, Cookie } from '../models/request.model';

export type ExpandableSection = 'request' | 'response' | 'metadata';

export interface HttpLogEntry {
  id: number;
  timestamp: Date;
  request: {
    method: HttpMethod;
    url: string;
    headers: Record<string, string>;
    body?: string;
  };
  response?: {
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    size: number;
    time: number;
    cookies: Cookie[];
  };
  error?: string;
  expanded: boolean;
  expandedSections: Set<ExpandableSection>;
}

@Injectable({ providedIn: 'root' })
export class HttpLogService {
  private nextId = 0;
  private logs = signal<HttpLogEntry[]>([]);

  readonly entries = this.logs.asReadonly();

  log(request: ProxyRequest, response?: ProxyResponse, error?: string): void {
    const entry: HttpLogEntry = {
      id: this.nextId++,
      timestamp: new Date(),
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body
      },
      response: response ? {
        statusCode: response.statusCode,
        statusText: response.statusText,
        headers: response.headers,
        body: response.body,
        size: response.size,
        time: response.time,
        cookies: response.cookies
      } : undefined,
      error,
      expanded: false,
      expandedSections: new Set()
    };
    this.logs.update(entries => [entry, ...entries]);
  }

  toggle(id: number): void {
    this.logs.update(entries =>
      entries.map(e => e.id === id ? { ...e, expanded: !e.expanded } : e)
    );
  }

  toggleSection(id: number, section: ExpandableSection): void {
    this.logs.update(entries =>
      entries.map(e => {
        if (e.id !== id) return e;
        const newSections = new Set(e.expandedSections);
        if (newSections.has(section)) {
          newSections.delete(section);
        } else {
          newSections.add(section);
        }
        return { ...e, expandedSections: newSections };
      })
    );
  }

  clear(): void {
    this.logs.set([]);
  }
}
