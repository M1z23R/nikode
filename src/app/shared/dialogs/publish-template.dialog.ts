import { Component, inject, signal } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef,
  ToastService
} from '@m1z23r/ngx-ui';
import { TemplateService, PublishTemplateRequest } from '../../core/services/template.service';
import { Collection } from '../../core/models/collection.model';

export interface PublishTemplateDialogData {
  collectionName: string;
  collection: Collection;
}

export interface PublishTemplateDialogResult {
  success: boolean;
}

@Component({
  selector: 'app-publish-template-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent],
  template: `
    <ui-modal title="Publish as Template" size="sm">
      <p class="dialog-description">
        Publish "{{ data.collectionName }}" as a cloud template for all users.
      </p>

      <div class="form-group">
        <ui-input
          label="Template Name"
          placeholder="My API Template"
          [(value)]="name"
        />
      </div>

      <div class="form-group">
        <ui-input
          label="Description"
          placeholder="A brief description of what this template contains..."
          [(value)]="description"
        />
      </div>

      <div class="form-group">
        <ui-input
          label="Category"
          placeholder="API, Testing, etc."
          [(value)]="category"
        />
      </div>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()" [disabled]="publishing()">Cancel</ui-button>
        <ui-button color="primary" (clicked)="submit()" [loading]="publishing()">Publish</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .dialog-description {
      margin: 0 0 1rem 0;
      color: var(--ui-text-secondary);
      font-size: var(--ui-font-sm);
    }

    .form-group {
      margin-bottom: 1rem;
    }
  `]
})
export class PublishTemplateDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<PublishTemplateDialogResult | undefined>;
  readonly data = inject(DIALOG_DATA) as PublishTemplateDialogData;
  private templateService = inject(TemplateService);
  private toastService = inject(ToastService);

  name = signal(this.data.collectionName);
  description = signal('');
  category = signal('API');
  publishing = signal(false);

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  async submit(): Promise<void> {
    const nameVal = this.name().trim();
    if (!nameVal) {
      this.toastService.error('Template name is required');
      return;
    }

    this.publishing.set(true);

    try {
      const request: PublishTemplateRequest = {
        name: nameVal,
        description: this.description().trim(),
        category: this.category().trim() || 'API',
        data: {
          items: this.data.collection.items,
        },
      };

      await this.templateService.publish(request);
      this.toastService.success('Template published successfully');
      this.dialogRef.close({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish template';
      this.toastService.error(message);
    } finally {
      this.publishing.set(false);
    }
  }
}
