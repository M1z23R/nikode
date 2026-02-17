import { Collection, CollectionItem, Environment } from './collection.model';

export type ConflictType =
  | 'update'           // Both sides modified the same item differently
  | 'delete-local'     // Local deleted, remote updated
  | 'delete-remote';   // Local updated, remote deleted

export type ItemType = 'item' | 'environment';

export interface ItemConflict {
  id: string;
  type: ConflictType;
  itemType: ItemType;
  path: string[];                    // Breadcrumb path for display (e.g., ["Folder A", "Get Users"])
  baseVersion?: CollectionItem | Environment;
  localVersion?: CollectionItem | Environment;
  remoteVersion?: CollectionItem | Environment;
}

export interface MergeResult {
  merged: Collection;
  conflicts: ItemConflict[];
  autoMergedCount: number;           // Number of changes auto-merged
}

export type ResolutionChoice =
  | 'keep-local'
  | 'keep-remote'
  | 'keep-both';                     // Only valid for update conflicts

export interface ConflictResolution {
  conflictId: string;
  choice: ResolutionChoice;
}

export interface MergeSession {
  base: Collection;
  local: Collection;
  remote: Collection;
  result?: MergeResult;
  resolutions: ConflictResolution[];
}
