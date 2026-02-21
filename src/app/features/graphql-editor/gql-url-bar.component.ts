import { Component, inject, input } from '@angular/core';
import { ButtonComponent } from '@m1z23r/ngx-ui';
import { GraphQLService } from '../../core/services/graphql.service';
import { OpenGraphQLRequest } from '../../core/models/graphql.model';
import { TemplateInputWrapperComponent } from '../../shared/components/template-input-wrapper.component';

@Component({
  selector: 'app-gql-url-bar',
  imports: [ButtonComponent, TemplateInputWrapperComponent],
  template: `
    <div class="url-bar">
      <div class="method-badge">GQL</div>
      <app-template-input
        class="url-input"
        [value]="request().url"
        (valueChange)="onUrlChange($event)"
        placeholder="https://api.example.com/graphql"
        [collectionPath]="request().collectionPath">
        <ng-template #suffix>
          <div class="suffix-buttons">
          <ui-button
            variant="ghost"
            size="sm"
            (clicked)="fetchSchema()"
            [disabled]="!request().url || request().schemaLoading"
            title="Fetch Schema">
            @if (request().schemaLoading) {
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner">
                <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/>
              </svg>
            } @else {
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            }
          </ui-button>
          <ui-button
            variant="ghost"
            size="sm"
            (clicked)="save()"
            [disabled]="!request().dirty"
            title="Save">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          </ui-button>
          <ui-button
            variant="ghost"
            size="sm"
            color="primary"
            (clicked)="send()"
            [disabled]="!request().url || !request().query || request().loading"
            title="Send">
            @if (request().loading) {
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner">
                <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/>
              </svg>
            } @else {
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            }
          </ui-button>
          </div>
        </ng-template>
      </app-template-input>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }

    .url-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      min-width: 0;
    }

    .method-badge {
      padding: 0.375rem 0.75rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      background-color: color-mix(in srgb, var(--ui-primary) 15%, transparent);
      color: var(--ui-primary);
      flex-shrink: 0;
    }

    .url-input {
      flex: 1;
      min-width: 0;
    }

    .suffix-buttons {
      display: flex;
      gap: 0.25rem;
      align-items: center;
    }

    .spinner {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class GqlUrlBarComponent {
  private graphqlService = inject(GraphQLService);

  request = input.required<OpenGraphQLRequest>();

  onUrlChange(url: string): void {
    this.graphqlService.updateRequest(this.request().id, { url });
  }

  send(): void {
    this.graphqlService.sendRequest(this.request().id);
  }

  save(): void {
    this.graphqlService.saveRequest(this.request().id);
  }

  fetchSchema(): void {
    this.graphqlService.fetchSchema(this.request().id);
  }
}
