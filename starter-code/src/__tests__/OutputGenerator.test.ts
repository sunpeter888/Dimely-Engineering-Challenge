import { OutputGenerator } from '../generators/OutputGenerator';
import { Opportunity, BillingAction } from '../types';

describe('OutputGenerator', () => {
  let generator: OutputGenerator;

  beforeEach(() => {
    generator = new OutputGenerator();
  });

  it('should generate a review sheet', () => {
    const opportunity: Opportunity = {
      id: 'opp_001',
      type: 'new_business',
      account_name: 'Test Corp',
      account_id: 'acc_123',
      opportunity_name: 'Test Opp',
      close_date: '2024-10-15',
      amount: 1000,
      contract_start_date: '2024-11-01',
      contract_end_date: '2024-12-31',
      billing_frequency: 'monthly',
      payment_terms: 'net_30',
      line_items: [],
      contact_info: {
        primary_contact: 'John Doe',
        email: 'john@test.com',
        billing_address: {
          company: 'Test Corp',
          address_line_1: '123 St',
          city: 'City',
          state: 'CA',
          postal_code: '12345',
          country: 'US',
        },
      },
      sales_rep: 'Jane',
    };

    const actions: BillingAction[] = [
      {
        type: 'create_account',
        description: 'Create account',
        details: {},
        requires_review: false,
        risk_level: 'low',
      },
    ];

    const sheet = generator.generateReviewSheet(opportunity, actions);

    expect(sheet.opportunity_id).toBe('opp_001');
    expect(sheet.billing_actions).toHaveLength(1);
  });
});

