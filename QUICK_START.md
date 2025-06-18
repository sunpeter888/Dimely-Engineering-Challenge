# Quick Start Guide

**New to this project? Start here for a fast overview.**

## What You're Building
A billing automation system that takes order data (JSON) and generates a review sheet for the ops team.

## Success Levels
- 🥉 **Bronze**: Process one order type, generate basic review sheet
- 🥈 **Silver**: Handle 2 order types + proration calculations  
- 🥇 **Gold**: All order types + advanced error handling

## 5-Minute Start
```bash
# 1. Look at the simple example
cat sample-data/new-business-simple.json

# 2. Try the TypeScript starter (optional)
cd starter-code
npm install
npm run dev ../sample-data/new-business-simple.json

# 3. Or build your own solution in any language!
```

## Expected Output
Your system should produce something like:
```json
{
  "order_id": "opp_simple_001",
  "actions": [
    {"type": "create_account", "description": "Create account for Simple Corp"},
    {"type": "create_subscription", "amount_cents": 400000},
    {"type": "charge_one_time", "amount_cents": 500000, "requires_review": true}
  ],
  "manual_review_required": true
}
```

## Progression Path
1. **Start simple**: `new-business-simple.json` → Parse JSON, validate, generate output
2. **Add complexity**: `insertion-order-opportunity.json` → Proration calculations
3. **Polish**: Error handling, edge cases, additional order types

## Key Files
- `README.md` - Full challenge details
- `sample-data/new-business-simple.json` - Easiest starting point
- `test-scenarios/README.md` - Bronze/Silver/Gold progression
- `starter-code/` - Optional TypeScript structure

**Remember**: Quality over quantity. Better to do one thing well than everything poorly! 