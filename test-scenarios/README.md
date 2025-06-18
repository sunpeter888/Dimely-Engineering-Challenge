# Test Scenarios

Your Dimely implementation should handle these realistic scenarios. **Start simple and build up complexity** - you don't need to implement everything at once.

💡 **Recommended Approach**: Start with Bronze level to get your system working, then add Silver level complexity. Only tackle Gold level if you have extra time and want to show off advanced skills.

## 🥉 Bronze Level - Start Here

### 0. Simple New Business (Warmup)
- **File**: `../sample-data/new-business-simple.json`
- **Expected Outcome**: Basic account creation and subscription setup
- **Key Tests**:
  - Parse JSON correctly
  - Validate required fields
  - Generate simple review sheet
  - Handle one-time charges vs recurring subscriptions

## 🥈 Silver Level - Core Scenarios

> **💡 Note**: Silver and Gold levels require mock API data to simulate existing Recurly accounts. The `mock-apis/` folder contains simulated responses that your system should use instead of real API calls.

### 1. New Business - Clean Case
- **File**: `../sample-data/new-business-opportunity.json`
- **Expected Outcome**: Create new Recurly account, set up subscriptions, handle one-time charges
- **Key Tests**:
  - Account creation with correct billing info
  - Monthly recurring subscriptions setup
  - One-time charges (setup fee, professional services)
  - Proper billing start date

### 2. Renewal with Changes
- **File**: `../sample-data/renewal-opportunity.json`
- **Mock Data**: `../mock-apis/recurly-account-beta-industries.json`
- **Expected Outcome**: Update existing subscription, handle price changes, modify billing frequency
- **Key Tests**:
  - Price increase handling
  - Billing frequency change (monthly → quarterly)
  - Adding new services
  - Proper transition timing

### 3. Insertion Order with Complex Proration
- **File**: `../sample-data/insertion-order-opportunity.json`
- **Mock Data**: Use the insertion order's `recurly_account_code` to simulate fetching existing billing state
- **Expected Outcome**: Add services mid-term with sophisticated proration calculations
- **Key Tests**:
  - **Subscription vs Non-Subscription Classification**: Correctly identify which items affect base subscription vs add-ons
  - **Multi-Method Proration**: Calculate both day-based and month-based proration accurately
  - **Immediate vs Scheduled Billing**: Determine what gets invoiced immediately vs added to next billing cycle
  - **Outstanding Invoice Processing**: Handle existing outstanding invoices in the calculation
  - **Service Activation Timing**: Coordinate billing with service activation dates

**Mock Data Usage Example:**
```typescript
// The insertion order has: "recurly_account_code": "gamma_solutions"
// Your system should simulate: getCurrentAccountState("gamma_solutions")
// By loading mock data or creating simulated existing billing state
const existingBilling = {
  current_subscription: { amount: 8000, plan: "existing_plan" },
  next_billing_date: "2024-11-01",
  outstanding_invoices: [{ id: "INV-001456", amount: 8000 }]
};
```

## 🥇 Gold Level - Advanced Scenarios

### 4. Conversion Order with Refund Processing
- **File**: `../sample-data/conversion-order-opportunity.json`
- **Mock Data**: `../mock-apis/recurly-account-delta-self-service.json`
- **Expected Outcome**: Seamlessly transition self-serve to direct sales with accurate refunds
- **Key Tests**:
  - **Precise Refund Calculation**: Day-based proration for unused subscription time
  - **Service Continuity Management**: Zero-downtime transition with overlap periods
  - **Account Upgrade Processing**: Complex workflow for account tier changes
  - **Payment Method Transition**: From automatic card billing to NET-30 invoicing
  - **Data Migration Validation**: Ensure account settings and history are preserved
  - **Backdated Conversion Handling**: Support for conversions with retroactive start dates

## Edge Cases to Consider (Gold Level)

### Data Quality Issues
- **Missing required fields** in opportunity data
- **Inconsistent dates** (start date after end date)
- **Invalid pricing** (negative amounts, missing prices)
- **Duplicate line items** with same product codes
- **Mismatched account information** between CRM and Recurly

### Billing Complexities
- **Overlapping subscriptions** (existing subscription conflicts with new one)
- **Failed payment methods** on existing accounts
- **Existing credits or refunds** that need to be considered
- **Multiple currencies** (opportunity in EUR, existing account in USD)
- **Tax considerations** for different states/countries

### Timing Edge Cases
- **Backdated contracts** (start date in the past)
- **Weekend/holiday start dates** (should billing start on business day?)
- **Contract gaps** (new contract starts after old one ends)
- **Immediate start dates** (contract effective today)

### Integration Challenges
- **Recurly API failures** (account not found, subscription creation fails)
- **Rate limiting** (too many API calls)
- **Partial failures** (account created but subscription fails)
- **Data sync issues** (CRM data doesn't match Recurly state)

## Advanced Scenarios

### Sophisticated Proration Calculations
- **Contract Mid-Term Changes**: Handle insertion orders that start mid-month with complex proration
- **Multiple Payment Frequencies**: Annual, quarterly, monthly billing alignment for proration
- **Outstanding Invoice Integration**: Factor existing unpaid invoices into proration calculations
- **Subscription vs Add-on Billing**: Different proration logic for base subscription changes vs add-ons

### Complex Account Transitions
- **Self-Serve to Enterprise Upgrades**: Handle seamless transitions with refund calculations
- **Backdated Conversions**: Process conversions with retroactive effective dates
- **Service Continuity Requirements**: Ensure zero-downtime during billing transitions
- **Payment Method Migrations**: Credit card to invoice billing transitions

### Real-World Billing Scenarios
- **Outstanding Invoice Processing**: Handle accounts with unpaid balances during changes
- **Credit Application Logic**: Apply refunds and credits accurately across billing cycles
- **Multi-Entity Billing**: Parent/child account relationships with complex billing hierarchies
- **Usage-Based Components**: Handle overage charges and variable consumption billing

### Enterprise Integration Challenges
- **Approval Workflow Management**: Multi-stage approval processes with different stakeholders
- **Audit Trail Requirements**: Complete tracking of all billing changes and approvals
- **System Integration Points**: Coordinate between Recurly, Salesforce, Google Sheets, and Slack
- **Error Recovery Scenarios**: Handle partial failures and system rollback requirements

## Your Implementation Should Handle

1. **Complex Proration Algorithms** - Implement both day-based and month-based proration calculations
2. **Multi-Stage Processing** - Handle order processing workflows with approval gates
3. **Data Classification Logic** - Distinguish between subscription consumption vs non-subscription items
4. **Integration Resilience** - Handle failures across multiple external systems gracefully
5. **Billing State Management** - Track and validate complex billing state transitions
6. **Audit and Compliance** - Maintain complete audit trails for financial operations

## Success Criteria

Your solution should demonstrate enterprise-level complexity handling:

### Core Functionality
- **Accurate Proration**: Implement sophisticated proration calculations that match real billing scenarios
- **Order Type Logic**: Handle the unique business logic for each of the four order types
- **Data Validation**: Comprehensive validation that prevents billing errors
- **Integration Patterns**: Show how you'd integrate with multiple external systems

### Architecture & Design
- **Scalable Design**: Structure that can handle high-volume order processing
- **Error Recovery**: Robust error handling with rollback capabilities
- **Workflow Management**: Support for multi-stage approval processes
- **Extensibility**: Easy to add new order types and billing scenarios

### Production Readiness
- **Monitoring & Observability**: Comprehensive logging and error tracking
- **Performance**: Efficient processing of complex billing calculations
- **Security**: Proper handling of sensitive financial data
- **Testing**: Thorough test coverage for complex business logic

Remember: This system handles real money and customer billing - precision and reliability are paramount! 