import { KeyValue } from './collection.model';
import { GraphQLSchema } from 'graphql';

export interface CachedGraphQLSchema {
  schema: GraphQLSchema;
  fetchedAt: number;
  url: string;
}

export interface GraphQLRequest {
  url: string;
  query: string;
  variables?: string;
  operationName?: string;
  headers: Record<string, string>;
}

export interface GraphQLResponse {
  statusCode: number;
  statusText: string;
  data?: unknown;
  errors?: GraphQLError[];
  extensions?: Record<string, unknown>;
  time: number;
  size: number;
  headers: Record<string, string>;
  rawBody: string;
}

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

export interface OpenGraphQLRequest {
  id: string;
  collectionPath: string;
  itemId: string;
  name: string;
  url: string;
  query: string;
  variables: string;
  operationName: string;
  headers: KeyValue[];
  response: GraphQLResponse | null;
  loading: boolean;
  schemaLoading: boolean;
  dirty: boolean;
}

export function createOpenGraphQLRequest(
  collectionPath: string,
  itemId: string,
  name: string,
  url: string,
  query: string,
  variables: string,
  operationName: string,
  headers: KeyValue[]
): OpenGraphQLRequest {
  return {
    id: `${collectionPath}:${itemId}`,
    collectionPath,
    itemId,
    name,
    url,
    query,
    variables,
    operationName,
    headers,
    response: null,
    loading: false,
    schemaLoading: false,
    dirty: false,
  };
}
