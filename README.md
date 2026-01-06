# AppTrack Browser Extension

Save job applications with one click. Auto-extract job details and sync to your [AppTrack](https://apptrack.ing) dashboard.

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
# Install dependencies
npm install

# Start development server with HMR
npm run dev
```

### Load Extension in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run test` | Run unit tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Check TypeScript types |
| `npm run format` | Format code with Prettier |

### Project Structure

```
src/
├── background/     # Service worker
├── content/        # Content script for job extraction
├── popup/          # React popup UI
├── shared/         # Shared utilities and types
│   ├── types/      # TypeScript type definitions
│   ├── utils/      # Utility functions
│   └── constants.ts
└── manifest.ts     # Extension manifest

e2e/                # Playwright E2E tests
```

## Tech Stack

- **Build**: Vite + CRXJS
- **UI**: React 19 + Tailwind CSS
- **Language**: TypeScript (strict mode)
- **Testing**: Vitest + Playwright
- **Cross-browser**: webextension-polyfill

## License

MIT
