# Dimely Engineering Challenge

## Background

Welcome to the Dimely engineering challenge! Dimely automates backoffice finance workflows for B2B SaaS companies. A workflow that you're going to work on is our contract to billing workflow for customers that use a subscription based billing platform.

### The Real System

The production Dimely system is a complex AI agent that:

1. **Processes contract PDFs** using LLMs to extract line items, pricing, and terms
2. **Classifies order types** and applies specific business logic for each type
3. **Performs intelligent proration calculations** for mid-term subscription changes
4. **Integrates with multiple systems** (Recurly, Salesforce, Dimely, Google Sheets, Slack)
5. **Manages approval workflows** with human oversight before billing execution
6. **Handles complex billing scenarios** like subscription vs non-subscription items, refunds, and account transitions

### Your Challenge

Build a simplified version of this system that demonstrates your understanding of complex business logic, system integration, and data processing. While you won't build the full AI-powered PDF processing, you should focus on:

1. **Processing structured opportunity data** with complex line items and terms
2. **Implementing sophisticated billing logic** for different order types
3. **Handling proration calculations** for mid-term changes
4. **Managing data validation and error handling** for real-world edge cases
5. **Creating human-readable output** for approval workflows

### Order Types

Dimely handles four types of orders, each with sophisticated billing logic:

1. **New Business Orders** - Create new subscriptions with prepaid credits, plan selection based on payment frequency, and initial account setup
2. **Renewal Orders** - Extend existing subscriptions with add-on continuity, renewal pricing, and term management
3. **Insertion Orders** - Add services or credits mid-term with complex proration calculations, subscription vs non-subscription classification, and immediate invoicing
4. **Conversion Orders** - Transition self-serve customers to direct sales with credit/refund handling, subscription replacement, and backdated conversions

## Your Challenge

Build a simplified billing automation system that demonstrates your understanding of complex business logic and system architecture. 

**Start simple and build up** - this is an **architecture and problem-solving exercise**, not a race to implement everything.

## Success Criteria

### 🥉 **Bronze** (Minimum Viable)
- Process **one order type** (recommend starting with New Business)
- Parse and validate input data
- Generate a basic review sheet with billing actions
- Handle basic error scenarios

### 🥈 **Silver** (Target)
- Process **2 order types** (New Business + one other)
- Implement proration calculations for insertion orders
- Comprehensive data validation
- Clear error handling and edge cases

### 🥇 **Gold** (Exceptional)
- Process **all 4 order types** with sophisticated business logic
- Advanced proration algorithms (day-based and month-based)
- Comprehensive error handling and rollback scenarios
- Production-ready architecture patterns

**Remember**: We'd rather see one order type implemented excellently than all four implemented poorly.

## Expected Deliverable

Your system should take JSON input (like the samples in `sample-data/`) and produce a review sheet for the ops team:

```json
{
  "order_id": "opp_001",
  "order_type": "new_business", 
  "account_name": "Acme Corp",
  "total_actions": 3,
  "estimated_impact": 120000,
  "actions": [
    {
      "type": "create_account",
      "description": "Create new Recurly account for Acme Corp",
      "risk_level": "low",
      "requires_review": false
    },
    {
      "type": "create_subscription", 
      "description": "Set up Professional Plan subscription ($5000/month)",
      "amount_cents": 500000,
      "risk_level": "low",
      "requires_review": false
    },
    {
      "type": "charge_one_time",
      "description": "Setup fee charge",
      "amount_cents": 500000,
      "risk_level": "medium", 
      "requires_review": true,
      "notes": ["High-value one-time charge"]
    }
  ],
  "warnings": ["High-value one-time charges require manual review"],
  "manual_review_required": true,
  "generated_at": "2024-06-17T18:00:00Z"
}
```

**Output can be**: JSON file, CLI output, simple web interface, or API response - your choice!

## Key Concepts

- **Proration**: Partial billing for partial time periods
- **Review Sheet**: Human-readable summary of billing changes for manual approval
- **Mock APIs**: The `mock-apis/` folder contains simulated Recurly responses for testing non-new-business scenarios

## Order Types

1. **New Business** - Create new subscriptions and accounts
2. **Renewal** - Extend existing subscriptions with pricing updates
3. **Insertion Order** - Add services mid-term with proration
4. **Conversion Order** - Transition self-serve to direct sales with refunds 

### Core Requirements

Your system should:

1. **Process complex order data** with sophisticated line item classification (subscription vs non-subscription)
2. **Implement proration logic** for mid-term changes with day-based and month-based calculations
3. **Handle multiple billing scenarios** including immediate invoicing, subscription updates, and credit applications
4. **Manage order-specific workflows** with different business logic for each order type
5. **Generate detailed review sheets** for manual approval workflows
6. **Validate data integrity** and handle real-world edge cases gracefully

### What We're Looking For

- **Complex business logic implementation** - How do you handle sophisticated billing scenarios?
- **Algorithm design** - Can you implement accurate proration and billing calculations?
- **System architecture** - How do you structure a system with multiple integration points?
- **Data modeling** - How do you represent complex relationships between orders, subscriptions, and billing items?
- **Error handling** - How do you manage the complexity of real-world billing edge cases?
- **Code quality** - Production-ready code that handles enterprise billing scenarios

### Getting Started

```bash
# Option 1: Use the TypeScript starter (optional)
cd starter-code && npm install && npm run dev ../sample-data/new-business-simple.json

# Option 2: Build from scratch in your language of choice
mkdir my-solution && cd my-solution
```

### Resources
- `sample-data/` - Example opportunity JSON files
- `mock-apis/` - Mock Recurly API responses (needed for non-new-business orders)
- `test-scenarios/` - Description of Bronze/Silver/Gold levels
- `starter-code/` - Optional TypeScript scaffolding

### Submission Guidelines

- **Time expectation**: 4-6 hours (don't spend more than 8)
- **Quality over quantity**: Better to implement one order type well than all four poorly
- **Include a brief README** explaining:
  - What you implemented (Bronze/Silver/Gold level)
  - Key design decisions and trade-offs
  - How to run your code
  - What you'd do next with more time
- **Add some tests** for your core logic - doesn't need to be comprehensive
- **Document assumptions** about business rules or edge cases

### Questions?

If you have questions, make reasonable assumptions and document them. Part of the challenge is dealing with ambiguity - something you'll face regularly in a founding engineering role.

Good luck! We're excited to see your approach to this complex but realistic problem. 
