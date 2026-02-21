import { Directive, inject, input, effect, TemplateRef, ViewContainerRef } from '@angular/core';
import { FlagsService } from '../../core/services/flags.service';

@Directive({
  selector: '[featureFlag]',
  standalone: true,
})
export class FeatureFlagDirective {
  private flagsService = inject(FlagsService);
  private templateRef = inject(TemplateRef<unknown>);
  private viewContainer = inject(ViewContainerRef);
  private hasView = false;

  featureFlag = input.required<string>();

  constructor() {
    effect(() => {
      const enabled = this.flagsService.flags().get(this.featureFlag()) ?? false;

      if (enabled && !this.hasView) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.hasView = true;
      } else if (!enabled && this.hasView) {
        this.viewContainer.clear();
        this.hasView = false;
      }
    });
  }
}
