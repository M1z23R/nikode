import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { APP_VERSION } from './core/tokens/version.token';
import packageJson from '../../package.json';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: APP_VERSION, useValue: packageJson.version }
  ]
};
