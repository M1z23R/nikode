# Nikode

A modern API client for developers, built with Angular 21 + Electron.

## Features

- **Multi-collection support**: Open and work with multiple collections simultaneously
- **File-based storage**: Each collection is stored as `nikode.json` in a user-chosen directory
- **Environment variables**: Define variables per environment with `{{variable}}` syntax
- **Secret management**: Secrets are stored separately in `~/.config/nikode/secrets.json`
- **Request builder**: Full-featured request editor with params, headers, body, and pre/post scripts
- **Response viewer**: Detailed response display with body, headers, cookies, and timing
- **File watching**: Automatic reload when collection files change externally
- **Import/Export**: Support for importing and exporting collections

## Project Structure

```
nikode/
├── electron/              # Electron main process
│   ├── main.js            # App entry point
│   ├── preload.js         # Preload script for IPC
│   ├── services/          # Backend services
│   │   ├── file-service.js
│   │   ├── file-watcher.js
│   │   ├── http-client.js
│   │   └── secrets-service.js
│   └── utils/
│
├── src/                   # Angular application
│   └── app/
│       ├── core/          # Services and models
│       ├── features/      # UI components
│       │   ├── console/
│       │   ├── environments/
│       │   ├── history/
│       │   ├── request-editor/
│       │   ├── response-viewer/
│       │   ├── runner/
│       │   ├── settings/
│       │   └── sidebar/
│       └── shared/        # Reusable components
│
└── shared/                # Shared types between Electron and Angular
    └── ipc-types.ts
```

## Development

### Prerequisites

- Node.js 20+
- npm 10+

### Install Dependencies

```bash
npm install
```

### Development Mode

Run frontend and Electron separately for hot reload:

```bash
# Terminal 1: Angular dev server (port 4200)
npm start

# Terminal 2: Electron in dev mode
npm run electron:dev
```

### Build

```bash
# Build and run Electron app
npm run electron:start

# Build distributable package
npm run electron:build
```

## Collection Format

Collections are stored as `nikode.json`:

```json
{
  "name": "My API Collection",
  "version": "1.0.0",
  "environments": [
    {
      "id": "env-1",
      "name": "local",
      "variables": [
        { "key": "baseUrl", "value": "http://localhost:3000", "enabled": true },
        { "key": "apiKey", "value": "", "enabled": true, "secret": true }
      ]
    }
  ],
  "activeEnvironmentId": "env-1",
  "items": [
    {
      "id": "req-1",
      "type": "request",
      "name": "Get Users",
      "method": "GET",
      "url": "{{baseUrl}}/users",
      "headers": [
        { "key": "Authorization", "value": "Bearer {{apiKey}}", "enabled": true }
      ],
      "body": { "type": "none" },
      "scripts": { "pre": "", "post": "" }
    }
  ]
}
```

## Tech Stack

- **Frontend**: Angular 21, CodeMirror 6, ngx-ui
- **Backend**: Electron 40
- **Build**: electron-builder

## License

MIT
