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
}
