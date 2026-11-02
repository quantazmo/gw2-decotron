# Decotron 2000 - Guild Wars 2 Decoration Editor

[![Deploy to GitHub Pages](https://github.com/quantazmo/gw2-decotron/actions/workflows/publish.yaml/badge.svg)](https://github.com/quantazmo/gw2-decotron/actions/workflows/publish.yaml)

https://quantazmo.github.io/gw2-decotron/

This website is a browser-based tool for loading, editing, and exporting homestead and guild hall decoration layouts for the Guild Wars 2 video game.

## Project Summary

- Load homestead or guild hall layout file(s)
- Search, sort, edit, and remove decorations
- Export selected layers back to XML files

## Tech Stack

- TypeScript (ES modules)
- Vitest for unit/integration testing
- Playwright for end-to-end testing

## Repository Layout

```text
src/
  application/      # Commands, handlers, app services
  domain/           # Core entities and business rules
  infrastructure/   # Repositories, adapters, API integration
  ui/               # UI components and state wiring

tests/              # Unit, integration, and UI-oriented tests
e2e/                # Playwright end-to-end tests
docs/               # Architecture and feature documentation
```

## Quick Start

### 1. Prerequisites

- Node.js 18+ (recommended)
- npm
- A modern browser (Chrome, Edge, Firefox, Safari)

### 2. Install dependencies

```bash
npm install
```

### 3. Run the app locally

Serve the repository root as a static site, then open it in a browser.

```bash
npm start
```

## Running Tests

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

Coverage:

```bash
npm run test:coverage
```

End-to-end tests:

```bash
npx playwright test
```

## Documentation

- [Architecture](docs/architecture.md)
- [Domain Model](docs/domain-model.md)
- [Coordinate Systems](docs/coordinate-systems.md)
- [Adding Features](docs/adding-features.md)

## License

This project is licensed under the MIT License.
See [LICENSE](LICENSE).
