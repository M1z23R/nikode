import { Injectable, signal } from '@angular/core';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  timestamp: Date;
}

@Injectable({ providedIn: 'root' })
export class ConsoleService {
  private nextId = 0;
  private logs = signal<LogEntry[]>([]);

  readonly entries = this.logs.asReadonly();

  log(message: string, level: LogLevel = 'info'): void {
    const entry: LogEntry = {
      id: this.nextId++,
      level,
      message,
      timestamp: new Date()
    };
    this.logs.update(entries => [...entries, entry]);
  }

  info(message: string): void {
    this.log(message, 'info');
  }

  warn(message: string): void {
    this.log(message, 'warn');
  }

  error(message: string): void {
    this.log(message, 'error');
  }

  debug(message: string): void {
    this.log(message, 'debug');
  }

  clear(): void {
    this.logs.set([]);
  }

  exportAsJson(): void {
    const data = this.logs().map(entry => ({
      level: entry.level,
      message: entry.message,
      timestamp: entry.timestamp.toISOString()
    }));
    this.downloadFile(JSON.stringify(data, null, 2), 'console-logs.json', 'application/json');
  }

  exportAsText(): void {
    const lines = this.logs().map(entry => {
      const timestamp = entry.timestamp.toISOString().replace('T', ' ').slice(0, 23);
      return `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
    });
    this.downloadFile(lines.join('\n'), 'console-logs.txt', 'text/plain');
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
