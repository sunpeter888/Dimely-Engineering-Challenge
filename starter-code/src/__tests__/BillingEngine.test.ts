import { BillingEngine } from '../engines/BillingEngine';
import { RecurlyClient } from '../clients/RecurlyClient';
import { Opportunity } from '../types';

describe('BillingEngine', () => {
  let engine: BillingEngine;
  let mockClient: RecurlyClient;

  beforeEach(() => {
    mockClient = new RecurlyClient({
      apiKey: 'test',
      baseUrl: 'test',
      useMockData: true,
    });
    engine = new BillingEngine(mockClient);
  });

  it('should generate actions for new business opportunity', async () => {
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
      line_items: [
        {
          id: 'li_001',
          product_name: 'Test Product',
          product_code: 'TEST',
          quantity: 1,
          unit_price: 1000,
          total_price: 1000,
          billing_period: 'monthly',
          description: 'Test',
        },
      ],
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

    const actions = await engine.generateActions(opportunity, null);

    expect(actions.length).toBeGreaterThan(0);
  });
});

