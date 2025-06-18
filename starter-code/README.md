# Starter Code

This directory contains a basic TypeScript structure to help you get started. **You are not required to use this structure** - feel free to use any language, framework, or architecture you prefer.

## Structure

```
starter-code/
├── src/
│   ├── types/
│   │   └── index.ts       # Type definitions for opportunities, billing actions, etc.
│   ├── parsers/
│   │   └── OpportunityParser.ts  # Logic to parse and validate opportunities
│   ├── clients/
│   │   └── RecurlyClient.ts      # Mock/real Recurly API client
│   ├── engines/
│   │   └── BillingEngine.ts      # Core logic to determine billing actions
│   ├── generators/
│   │   └── OutputGenerator.ts    # Generate review sheets/billing instructions
│   └── index.ts           # Entry point
├── __tests__/
│   ├── OpportunityParser.test.ts
│   ├── BillingEngine.test.ts
│   └── integration.test.ts
├── package.json
├── tsconfig.json
└── jest.config.js
```

## Getting Started

### Option 1: Use This TypeScript Structure

```bash
# Install dependencies
npm install

# Run the example (start with simple case)
npm run dev ../sample-data/new-business-simple.json

# Or try the full new business case
npm run dev ../sample-data/new-business-opportunity.json

# Build the project
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Option 2: Start From Scratch

Create your own project structure in any language you prefer:
- Python
- Java/Spring Boot  
- Go
- C#/.NET
- Ruby on Rails
- Or any other technology you're comfortable with

## Key Components to Consider

### 1. Data Models
- How will you represent opportunities, line items, billing actions?
- What validation rules do you need?

### 2. Business Logic Engine
- How do you determine what billing actions are needed?
- How do you handle the different opportunity types?
- What about edge cases and error scenarios?

### 3. External Integrations
- How do you interact with Recurly APIs?
- How do you handle API failures or rate limits?
- How do you use mock data to simulate existing billing state?

### 4. Output Format
- How do you present the billing instructions for human review?
- What information does the ops team need to make a decision?

### 5. Testing Strategy
- How do you test complex billing scenarios?
- How do you mock external dependencies?

## Example Flow

```typescript
// Pseudocode for the main flow
async function processOpportunity(opportunityData: unknown): Promise<ProcessingResult> {
  // 1. Parse and validate opportunity
  const { opportunity, errors } = parser.parse(opportunityData);
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  // 2. Get current billing state from Recurly (or mock data)
  const currentState = await recurlyClient.getAccountState(opportunity.recurly_account_code);
  
  // 3. Determine what billing actions are needed
  const billingActions = await billingEngine.generateActions(opportunity, currentState);
  
  // 4. Generate review sheet for ops team
  const reviewSheet = outputGenerator.generateReviewSheet(opportunity, billingActions);
  
  return { success: true, review_sheet: reviewSheet };
}
```

## Tips

- **Start simple** - Get the happy path working first (Bronze level)
- **Use mock data** - The provided RecurlyClient already handles mock/real data switching
- **Test early** - Write tests for your core logic, especially proration calculations
- **Handle errors gracefully** - Think about what can go wrong with billing data
- **Document your assumptions** - What business rules did you assume?
- **Keep it readable** - Code quality matters for a founding engineer role

## Mock Data Integration

The provided `RecurlyClient` already handles mock data for you:

```typescript
// Automatically uses mock data in development
const recurlyClient = new RecurlyClient({
  apiKey: 'mock-key',
  baseUrl: 'mock-url', 
  useMockData: true,  // Set to false for real API
  mockDataPath: '../mock-apis'
});

// This will load ../mock-apis/recurly-account-beta-industries.json
const billing = await recurlyClient.getAccountState('beta_industries');
```

## Questions to Consider

- How do you ensure data consistency across Recurly operations?
- What happens if an opportunity is processed multiple times?
- How do you handle timezone differences in billing dates?
- What's your strategy for handling Recurly API changes?
- How would you add support for a new opportunity type?

Good luck! Remember to focus on demonstrating your architectural thinking and problem-solving approach. 