import { Injectable, inject } from '@angular/core';
import { ToastService } from '@m1z23r/ngx-ui';
import { UnifiedCollectionService } from './unified-collection.service';
import { CollectionSchema, SchemaType, UnifiedCollection } from '../models/collection.model';

@Injectable({ providedIn: 'root' })
export class SchemaService {
  private unifiedCollectionService = inject(UnifiedCollectionService);
  private toastService = inject(ToastService);

  private getUnifiedCollection(collectionPath: string): UnifiedCollection | undefined {
    return this.unifiedCollectionService.getCollection(collectionPath);
  }

  getSchemas(collectionPath: string): CollectionSchema[] {
    const col = this.getUnifiedCollection(collectionPath);
    return col?.collection.schemas ?? [];
  }

  getSchema(collectionPath: string, schemaId: string): CollectionSchema | undefined {
    return this.getSchemas(collectionPath).find(s => s.id === schemaId);
  }

  getSchemaByName(collectionPath: string, name: string): CollectionSchema | undefined {
    return this.getSchemas(collectionPath).find(s => s.name === name);
  }

  addSchema(collectionPath: string, name: string, type: SchemaType = 'json'): void {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) return;

    const schemas = col.collection.schemas ?? [];
    if (schemas.some(s => s.name === name)) {
      this.toastService.error(`Schema "${name}" already exists`);
      return;
    }

    const defaultContent = type === 'json'
      ? '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}'
      : '';

    const newSchema: CollectionSchema = {
      id: `schema-${Date.now()}`,
      name,
      type,
      content: defaultContent
    };

    this.unifiedCollectionService.updateCollection(collectionPath, {
      ...col.collection,
      schemas: [...schemas, newSchema]
    });
  }

  updateSchema(collectionPath: string, schemaId: string, updates: Partial<CollectionSchema>): void {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) return;

    const schemas = col.collection.schemas ?? [];

    if (updates.name !== undefined) {
      const existing = schemas.find(s => s.name === updates.name && s.id !== schemaId);
      if (existing) {
        this.toastService.error(`Schema "${updates.name}" already exists`);
        return;
      }
    }

    this.unifiedCollectionService.updateCollection(collectionPath, {
      ...col.collection,
      schemas: schemas.map(s => s.id === schemaId ? { ...s, ...updates } : s)
    });
  }

  deleteSchema(collectionPath: string, schemaId: string): void {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) return;

    const schemas = col.collection.schemas ?? [];
    this.unifiedCollectionService.updateCollection(collectionPath, {
      ...col.collection,
      schemas: schemas.filter(s => s.id !== schemaId)
    });
  }
}
