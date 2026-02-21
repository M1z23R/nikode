import { Injectable, inject, computed } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class FlagsService {
  private authService = inject(AuthService);

  flags = computed(() => {
    const user = this.authService.user();
    const flagMap = new Map<string, boolean>();

    const isAdmin = user?.global_role === 'super_admin' || user?.global_role === 'admin';

    // Admin-only flags
    flagMap.set('admin-settings', isAdmin);
    flagMap.set('user-management', isAdmin);
    flagMap.set('publish-template', isAdmin);

    // Auth-required flags
    flagMap.set('profile', user != null);

    return flagMap;
  });

  isEnabled(flag: string): boolean {
    return this.flags().get(flag) ?? false;
  }
}
