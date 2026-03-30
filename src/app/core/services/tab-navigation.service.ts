import { Injectable, inject, NgZone, OnDestroy, effect } from '@angular/core';
import { TabsService } from '@m1z23r/ngx-ui';

@Injectable({ providedIn: 'root' })
export class TabNavigationService implements OnDestroy {
  private tabsService = inject(TabsService);
  private ngZone = inject(NgZone);

  private history: string[] = [];
  private currentIndex = -1;
  private skipNextRecord = false;

  private boundMouseHandler = this.handleMouseButton.bind(this);

  constructor() {
    // Track tab activations for history (back/forward navigation)
    effect(() => {
      const activeId = this.tabsService.activeTabId();
      if (!activeId) return;

      if (this.skipNextRecord) {
        this.skipNextRecord = false;
        return;
      }

      // Don't record duplicate consecutive entries
      if (this.history[this.currentIndex] === activeId) return;

      // Truncate forward history and push new entry
      this.history = this.history.slice(0, this.currentIndex + 1);
      this.history.push(activeId);
      this.currentIndex = this.history.length - 1;
    });

    // Listen for mouse back/forward buttons outside Angular zone
    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('mouseup', this.boundMouseHandler);
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('mouseup', this.boundMouseHandler);
  }

  goBack(): void {
    this.navigateHistory(-1);
  }

  goForward(): void {
    this.navigateHistory(1);
  }

  goToNextTab(): void {
    this.cycleTab(1);
  }

  goToPreviousTab(): void {
    this.cycleTab(-1);
  }

  private navigateHistory(direction: -1 | 1): void {
    let targetIndex = this.currentIndex + direction;

    // Skip over tabs that have been closed
    while (targetIndex >= 0 && targetIndex < this.history.length) {
      const tabId = this.history[targetIndex];
      if (this.tabsService.getTab(tabId)) {
        this.currentIndex = targetIndex;
        this.skipNextRecord = true;
        this.tabsService.activateById(tabId);
        return;
      }
      targetIndex += direction;
    }
  }

  private cycleTab(direction: 1 | -1): void {
    const tabs = this.tabsService.tabs();
    if (tabs.length < 2) return;

    const activeId = this.tabsService.activeTabId();
    const currentIdx = tabs.findIndex(t => t.id === activeId);
    if (currentIdx === -1) return;

    const nextIdx = (currentIdx + direction + tabs.length) % tabs.length;
    this.tabsService.activateById(tabs[nextIdx].id);
  }

  private handleMouseButton(event: MouseEvent): void {
    if (event.button === 3) {
      event.preventDefault();
      this.ngZone.run(() => this.goBack());
    } else if (event.button === 4) {
      event.preventDefault();
      this.ngZone.run(() => this.goForward());
    }
  }
}
