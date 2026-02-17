import { KeyValue } from './collection.model';

export type WebSocketConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface WebSocketMessage {
  id: string;
  timestamp: number;
  direction: 'sent' | 'received';
  type: 'text' | 'binary' | 'open' | 'close' | 'error';
  data?: string;
  size: number;
  error?: string;
  closeCode?: number;
  closeReason?: string;
}

export interface WebSocketStats {
  connectedAt?: number;
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
}

export interface WebSocketSavedMessage {
  id: string;
  name: string;
  type: 'text' | 'binary';
  content: string;
}

export interface OpenWebSocketConnection {
  id: string;
  collectionPath: string;
  itemId: string;
  name: string;
  url: string;
  headers: KeyValue[];
  protocols: string[];
  autoReconnect: boolean;
  reconnectInterval: number;
  status: WebSocketConnectionStatus;
  messages: WebSocketMessage[];
  stats: WebSocketStats;
  dirty: boolean;
  errorMessage?: string;
  savedMessages: WebSocketSavedMessage[];
}

// IPC request/response types
export interface WebSocketConnectRequest {
  connectionId: string;
  url: string;
  headers?: Record<string, string>;
  protocols?: string[];
}

export interface WebSocketSendRequest {
  connectionId: string;
  type: 'text' | 'binary';
  data: string;
}

export interface WebSocketDisconnectRequest {
  connectionId: string;
  code?: number;
  reason?: string;
}

export interface WebSocketConnectedEvent {
  connectionId: string;
  protocol?: string;
}

export interface WebSocketMessageEvent {
  connectionId: string;
  type: 'text' | 'binary';
  data: string;
  size: number;
}

export interface WebSocketCloseEvent {
  connectionId: string;
  code: number;
  reason: string;
  wasClean: boolean;
}

export interface WebSocketErrorEvent {
  connectionId: string;
  message: string;
}
