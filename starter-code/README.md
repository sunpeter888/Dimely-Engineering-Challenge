# Starter Code (Optional)

This directory provides a basic TypeScript project structure. **You are not required to use this** - feel free to build in any language or framework you prefer.

## Structure

```
starter-code/
├── src/
│   ├── types/index.ts              # Type definitions
│   ├── parsers/OpportunityParser.ts
│   ├── clients/RecurlyClient.ts    # Handles mock API data
│   ├── engines/BillingEngine.ts
│   ├── generators/OutputGenerator.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Usage

```bash
npm install
npm run dev ../sample-data/new-business-simple.json
```

## What's Provided

- Type definitions for opportunities and billing actions
- RecurlyClient that can load mock data from `mock-apis/` folder
- Basic project structure and build configuration
- Empty class skeletons

## What You Need to Build

Everything else. 