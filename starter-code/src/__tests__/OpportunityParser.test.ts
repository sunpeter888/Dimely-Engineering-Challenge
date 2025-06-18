import { OpportunityParser } from '../parsers/OpportunityParser';

describe('OpportunityParser', () => {
  let parser: OpportunityParser;

  beforeEach(() => {
    parser = new OpportunityParser();
  });

  it('should parse a valid new business opportunity', () => {
    const validOpportunity = {
      id: 'opp_001',
      type: 'new_business',
      account_name: 'Test Corp',
      account_id: 'acc_123',
      opportunity_name: 'Test Opportunity',
      close_date: '2024-10-15',
      amount: 1000,
      contract_start_date: '2024-11-01',
      contract_end_date: '2024-12-31',
      billing_frequency: 'monthly',
      payment_terms: 'net_30',
      line_items: [
        {
          id: 'li_001',
          product_name: 'Test Product',
          product_code: 'TEST_PROD',
          quantity: 1,
          unit_price: 1000,
          total_price: 1000,
          billing_period: 'monthly',
          description: 'Test product',
        },
      ],
      contact_info: {
        primary_contact: 'John Doe',
        email: 'john@testcorp.com',
        billing_address: {
          company: 'Test Corp',
          address_line_1: '123 Test St',
          city: 'Test City',
          state: 'CA',
          postal_code: '12345',
          country: 'US',
        },
      },
      sales_rep: 'Jane Smith',
    };

    const result = parser.parse(validOpportunity);

    expect(result.errors).toHaveLength(0);
    expect(result.opportunity).toBeDefined();
    expect(result.opportunity?.type).toBe('new_business');
  });

  it('should return errors for invalid data', () => {
    const invalid = { id: 'opp_001' };
    const result = parser.parse(invalid);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.opportunity).toBeUndefined();
  });
});
