import { BillingEngine } from '../engines/BillingEngine';
import { RecurlyClient } from '../clients/RecurlyClient';
import { Opportunity, RecurlyState } from '../types';

// Mock RecurlyClient
jest.mock('../clients/RecurlyClient');

describe('BillingEngine', () => {
  let billingEngine: BillingEngine;
  let mockRecurlyClient: jest.Mocked<RecurlyClient>;

  beforeEach(() => {
    mockRecurlyClient = new RecurlyClient({
      apiKey: 'test-key',
      baseUrl: 'https://test.recurly.com',
      useMockData: true,
    }) as jest.Mocked<RecurlyClient>;
    
    // Mock the async methods to return predictable mock data
    mockRecurlyClient.createAccount = jest.fn().mockImplementation(async (data) => ({
      account_code: data.account_code || 'mock_account',
      email: data.email || 'mock@example.com',
      first_name: 'Mock',
      last_name: 'User',
      company_name: data.company_name || 'Mock Company',
      state: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    mockRecurlyClient.createSubscription = jest.fn().mockImplementation(async (accountCode, data) => ({
      uuid: `mock_sub_${Date.now()}`,
      plan_code: data.plan_code || 'mock_plan',
      state: 'active',
      unit_amount_in_cents: data.unit_amount_in_cents || 0,
      quantity: data.quantity || 1,
      current_period_started_at: new Date().toISOString(),
      current_period_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      started_at: new Date().toISOString(),
      collection_method: data.collection_method || 'automatic',
      net_terms: data.net_terms || 0,
    }));
    mockRecurlyClient.updateSubscription = jest.fn().mockImplementation(async (subId, data) => ({
      uuid: subId,
      plan_code: data.plan_code || 'updated_plan',
      state: 'active',
      unit_amount_in_cents: data.new_unit_amount_in_cents || 0,
      quantity: data.new_quantity || 1,
      current_period_started_at: new Date().toISOString(),
      current_period_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      started_at: new Date().toISOString(),
      collection_method: 'automatic',
      net_terms: 0,
    }));
    mockRecurlyClient.cancelSubscription = jest.fn().mockResolvedValue(undefined);

    billingEngine = new BillingEngine(mockRecurlyClient);
  });

  describe('generateActions - New Business', () => {
    it('should generate correct actions for new business opportunity', async () => {
      const opportunity: Opportunity = {
        id: 'opp_001',
        type: 'new_business',
        account_name: 'Test Corp',
        account_id: 'acc_123',
        opportunity_name: 'Test New Business',
        close_date: '2024-10-15',
        amount: 12000,
        contract_start_date: '2024-11-01',
        contract_end_date: '2024-12-31',
        billing_frequency: 'monthly',
        payment_terms: 'net_30',
        line_items: [
          {
            id: 'li_001',
            product_name: 'Professional Plan',
            product_code: 'PRO_PLAN',
            quantity: 1,
            unit_price: 1000,
            total_price: 1000,
            billing_period: 'monthly',
            description: 'Monthly professional subscription',
          },
          {
            id: 'li_002',
            product_name: 'Setup Fee',
            product_code: 'SETUP_FEE',
            quantity: 1,
            unit_price: 5000,
            total_price: 5000,
            billing_period: 'one_time',
            description: 'One-time setup fee',
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

      const actions = await billingEngine.generateActions(opportunity, null);

      expect(actions).toHaveLength(3);
      
      // Check account creation
      const accountAction = actions.find(a => a.type === 'create_account');
      expect(accountAction).toBeDefined();
      expect(accountAction?.description).toContain('Test Corp');
      expect(accountAction?.risk_level).toBe('low');
      expect(accountAction?.requires_review).toBe(false);
      expect(accountAction?.details).toHaveProperty('account_code', 'acc_123');
      expect(accountAction?.details).toHaveProperty('company_name', 'Test Corp');

      // Check subscription creation
      const subscriptionAction = actions.find(a => a.type === 'create_subscription');
      expect(subscriptionAction).toBeDefined();
      expect(subscriptionAction?.description).toContain('Professional Plan');
      expect(subscriptionAction?.amount_in_cents).toBe(100000);
      expect(subscriptionAction?.details).toHaveProperty('plan_code', 'PRO_PLAN');
      expect(subscriptionAction?.details).toHaveProperty('state', 'active');

      // Check one-time charge
      const chargeAction = actions.find(a => a.type === 'charge_one_time');
      expect(chargeAction).toBeDefined();
      expect(chargeAction?.description).toContain('Setup Fee');
      expect(chargeAction?.amount_in_cents).toBe(500000);
      expect(chargeAction?.requires_review).toBe(true);
      expect(chargeAction?.risk_level).toBe('medium');
    });

    it('should handle high-value one-time charges with appropriate risk levels', async () => {
      const opportunity: Opportunity = {
        id: 'opp_002',
        type: 'new_business',
        account_name: 'High Value Corp',
        account_id: 'acc_456',
        opportunity_name: 'High Value New Business',
        close_date: '2024-10-15',
        amount: 50000,
        contract_start_date: '2024-11-01',
        contract_end_date: '2024-12-31',
        billing_frequency: 'monthly',
        payment_terms: 'net_30',
        line_items: [
          {
            id: 'li_003',
            product_name: 'Enterprise Setup',
            product_code: 'ENT_SETUP',
            quantity: 1,
            unit_price: 50000,
            total_price: 50000,
            billing_period: 'one_time',
            description: 'Enterprise setup and onboarding',
          },
        ],
        contact_info: {
          primary_contact: 'Jane Doe',
          email: 'jane@highvalue.com',
          billing_address: {
            company: 'High Value Corp',
            address_line_1: '456 High St',
            city: 'High City',
            state: 'NY',
            postal_code: '10001',
            country: 'US',
          },
        },
        sales_rep: 'Bob Smith',
      };

      const actions = await billingEngine.generateActions(opportunity, null);

      const chargeAction = actions.find(a => a.type === 'charge_one_time');
      expect(chargeAction?.risk_level).toBe('high');
      expect(chargeAction?.requires_review).toBe(true);
      expect(chargeAction?.notes).toContain('High-value one-time charge');
    });
  });

  describe('generateActions - Renewal', () => {
    const mockRecurlyState: RecurlyState = {
      account: {
        account_code: 'test_account',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        company_name: 'Test Corp',
        state: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-10-15T00:00:00Z',
      },
      subscriptions: [
        {
          uuid: 'sub_001',
          plan_code: 'PRO_PLAN',
          state: 'active',
          unit_amount_in_cents: 80000, // $800
          quantity: 1,
          current_period_started_at: '2024-10-01T00:00:00Z',
          current_period_ends_at: '2024-10-31T23:59:59Z',
          started_at: '2024-01-01T00:00:00Z',
          collection_method: 'automatic',
          net_terms: 0,
        },
      ],
      invoices: [],
      transactions: [],
    };

    it('should generate correct actions for renewal opportunity', async () => {
      const opportunity: Opportunity = {
        id: 'opp_003',
        type: 'renewal',
        account_name: 'Test Corp',
        account_id: 'acc_123',
        recurly_account_code: 'test_account',
        opportunity_name: 'Test Renewal',
        close_date: '2024-10-15',
        amount: 12000,
        contract_start_date: '2024-11-01',
        contract_end_date: '2024-12-31',
        billing_frequency: 'monthly',
        payment_terms: 'net_30',
        line_items: [
          {
            id: 'li_004',
            product_name: 'Professional Plan',
            product_code: 'PRO_PLAN',
            quantity: 1,
            unit_price: 1000, // Increased from $800
            total_price: 1000,
            billing_period: 'monthly',
            description: 'Renewed professional subscription',
            previous_price: 800,
            price_change_reason: 'Annual price increase',
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

      const actions = await billingEngine.generateActions(opportunity, mockRecurlyState);

      expect(actions).toHaveLength(1);
      
      const updateAction = actions[0];
      expect(updateAction.type).toBe('update_subscription');
      expect(updateAction.description).toContain('Professional Plan');
      expect(updateAction.amount_in_cents).toBe(100000);
      expect(updateAction.requires_review).toBe(true);
      expect(updateAction.risk_level).toBe('low');
      expect(updateAction.notes).toContain('Annual price increase');
      expect(updateAction.details).toHaveProperty('plan_code', 'PRO_PLAN');
      expect(updateAction.details).toHaveProperty('uuid', 'sub_001');
    });

    it('should handle missing Recurly account for renewal', async () => {
      const opportunity: Opportunity = {
        id: 'opp_004',
        type: 'renewal',
        account_name: 'Missing Corp',
        account_id: 'acc_789',
        opportunity_name: 'Missing Account Renewal',
        close_date: '2024-10-15',
        amount: 1000,
        contract_start_date: '2024-11-01',
        contract_end_date: '2024-12-31',
        billing_frequency: 'monthly',
        payment_terms: 'net_30',
        line_items: [
          {
            id: 'li_005',
            product_name: 'Basic Plan',
            product_code: 'BASIC_PLAN',
            quantity: 1,
            unit_price: 1000,
            total_price: 1000,
            billing_period: 'monthly',
            description: 'Basic subscription',
          },
        ],
        contact_info: {
          primary_contact: 'John Doe',
          email: 'john@missing.com',
          billing_address: {
            company: 'Missing Corp',
            address_line_1: '789 Missing St',
            city: 'Missing City',
            state: 'TX',
            postal_code: '75001',
            country: 'US',
          },
        },
        sales_rep: 'Jane Smith',
      };

      const actions = await billingEngine.generateActions(opportunity, null);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('create_account');
      expect(actions[0].description).toContain('ERROR');
      expect(actions[0].risk_level).toBe('high');
      expect(actions[0].requires_review).toBe(true);
    });
  });

  describe('generateActions - Insertion Order', () => {
    const mockRecurlyState: RecurlyState = {
      account: {
        account_code: 'gamma_solutions',
        email: 'david@gammasolutions.com',
        first_name: 'David',
        last_name: 'Park',
        company_name: 'Gamma Solutions LLC',
        state: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-10-15T00:00:00Z',
      },
      subscriptions: [
        {
          uuid: 'sub_gamma_001',
          plan_code: 'pro_plan_monthly',
          state: 'active',
          unit_amount_in_cents: 500000,
          quantity: 1,
          current_period_started_at: '2024-10-01T00:00:00Z',
          current_period_ends_at: '2024-10-31T23:59:59Z',
          started_at: '2024-01-01T00:00:00Z',
          collection_method: 'automatic',
          net_terms: 0,
        },
      ],
      invoices: [],
      transactions: [],
    };

    it('should generate correct actions for insertion order with proration', async () => {
      const opportunity: Opportunity = {
        id: 'opp_005',
        type: 'insertion_order',
        account_name: 'Gamma Solutions',
        account_id: 'acc_11111',
        recurly_account_code: 'gamma_solutions',
        opportunity_name: 'Gamma Solutions - Q3 Upsell',
        close_date: '2024-09-15',
        amount: 6000,
        contract_start_date: '2024-10-01',
        contract_end_date: '2024-12-31',
        billing_frequency: 'monthly',
        payment_terms: 'net_30',
        line_items: [
          {
            id: 'li_008',
            product_name: 'Advanced Segmentation',
            product_code: 'ADV_SEGMENT',
            quantity: 1,
            unit_price: 2000,
            total_price: 6000,
            billing_period: 'monthly',
            description: 'Advanced user segmentation features',
            item_classification: 'subscription_consumption',
            proration_needed: true,
            months_remaining: 3,
            affects_base_subscription: true,
          },
        ],
        contact_info: {
          primary_contact: 'David Park',
          email: 'david@gammasolutions.com',
          billing_address: {
            company: 'Gamma Solutions LLC',
            address_line_1: '789 Tech Center Dr',
            city: 'Seattle',
            state: 'WA',
            postal_code: '98109',
            country: 'US',
          },
        },
        sales_rep: 'Lisa Wang',
      };

      const actions = await billingEngine.generateActions(opportunity, mockRecurlyState);

      expect(actions).toHaveLength(1);
      
      const prorationAction = actions[0];
      expect(prorationAction.type).toBe('prorate_charges');
      expect(prorationAction.description).toContain('Advanced Segmentation');
      expect(prorationAction.requires_review).toBe(true);
      expect(prorationAction.risk_level).toBe('medium');
      expect(prorationAction.notes).toContain('Proration calculation - verify dates and amounts');
      expect(prorationAction.notes).toContain('Classification: subscription_consumption');
    });

    it('should handle outstanding invoices in insertion orders', async () => {
      const opportunity: Opportunity = {
        id: 'opp_006',
        type: 'insertion_order',
        account_name: 'Gamma Solutions',
        account_id: 'acc_11111',
        recurly_account_code: 'gamma_solutions',
        opportunity_name: 'Gamma Solutions - With Outstanding',
        close_date: '2024-09-15',
        amount: 8000,
        contract_start_date: '2024-10-01',
        contract_end_date: '2024-12-31',
        billing_frequency: 'monthly',
        payment_terms: 'net_30',
        outstanding_invoices: {
          has_outstanding: true,
          invoice_ids: ['INV-2024-001456'],
          total_outstanding: 8000,
          requires_processing: true,
        },
        line_items: [
          {
            id: 'li_009',
            product_name: 'API Overages',
            product_code: 'API_OVERAGE',
            quantity: 5000,
            unit_price: 0.001,
            total_price: 5000,
            billing_period: 'monthly',
            description: 'Additional API calls',
            item_classification: 'non_subscription_consumption',
            proration_needed: true,
            months_remaining: 3,
          },
        ],
        contact_info: {
          primary_contact: 'David Park',
          email: 'david@gammasolutions.com',
          billing_address: {
            company: 'Gamma Solutions LLC',
            address_line_1: '789 Tech Center Dr',
            city: 'Seattle',
            state: 'WA',
            postal_code: '98109',
            country: 'US',
          },
        },
        sales_rep: 'Lisa Wang',
      };

      const actions = await billingEngine.generateActions(opportunity, mockRecurlyState);

      expect(actions).toHaveLength(2);
      
      const invoiceAction = actions.find(a => a.type === 'create_invoice');
      expect(invoiceAction).toBeDefined();
      expect(invoiceAction?.description).toContain('Process outstanding invoices');
      expect(invoiceAction?.amount_in_cents).toBe(800000);
      expect(invoiceAction?.notes).toContain('Outstanding invoices must be processed before new charges');
    });
  });

  describe('generateActions - Conversion Order', () => {
    const mockRecurlyState: RecurlyState = {
      account: {
        account_code: 'delta_self_service',
        email: 'alex@deltacorp.com',
        first_name: 'Alex',
        last_name: 'Chen',
        company_name: 'Delta Corp',
        state: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-10-15T00:00:00Z',
      },
      subscriptions: [
        {
          uuid: 'sub_delta_001',
          plan_code: 'self_service_plan',
          state: 'active',
          unit_amount_in_cents: 200000, // $2000
          quantity: 1,
          current_period_started_at: '2024-10-01T00:00:00Z',
          current_period_ends_at: '2024-10-31T23:59:59Z',
          started_at: '2024-01-01T00:00:00Z',
          collection_method: 'automatic',
          net_terms: 0,
        },
      ],
      invoices: [],
      transactions: [],
    };

    it('should generate correct actions for conversion order', async () => {
      const opportunity: Opportunity = {
        id: 'opp_007',
        type: 'conversion_order',
        account_name: 'Delta Corp',
        account_id: 'acc_22222',
        recurly_account_code: 'delta_self_service',
        opportunity_name: 'Delta Corp - Self Service to Enterprise',
        close_date: '2024-10-15',
        amount: 50000,
        contract_start_date: '2024-11-01',
        contract_end_date: '2024-12-31',
        billing_frequency: 'monthly',
        payment_terms: 'net_30',
        billing_transition: {
          credit_amount_due: 1000,
          credit_calculation: 'Unused self-service period: 15 days',
          from_payment_method: 'credit_card',
          to_payment_method: 'invoice',
        },
        line_items: [
          {
            id: 'li_010',
            product_name: 'Enterprise Plan',
            product_code: 'ENT_PLAN',
            quantity: 1,
            unit_price: 2500,
            total_price: 2500,
            billing_period: 'monthly',
            description: 'Enterprise subscription',
            replaces_self_service: true,
          },
        ],
        contact_info: {
          primary_contact: 'Alex Chen',
          email: 'alex@deltacorp.com',
          billing_address: {
            company: 'Delta Corp',
            address_line_1: '456 Enterprise Ave',
            city: 'Enterprise City',
            state: 'CA',
            postal_code: '90210',
            country: 'US',
          },
        },
        sales_rep: 'Sarah Johnson',
      };

      const actions = await billingEngine.generateActions(opportunity, mockRecurlyState);

      expect(actions).toHaveLength(3);
      
      // Check subscription cancellation
      const cancelAction = actions.find(a => a.type === 'cancel_subscription');
      expect(cancelAction).toBeDefined();
      expect(cancelAction?.description).toContain('Cancel self-service subscription');
      expect(cancelAction?.risk_level).toBe('medium');

      // Check credit application
      const creditAction = actions.find(a => a.type === 'apply_credit');
      expect(creditAction).toBeDefined();
      expect(creditAction?.description).toContain('Apply credit for unused self-service period');
      expect(creditAction?.amount_in_cents).toBe(100000);
      expect(creditAction?.requires_review).toBe(true);

      // Check new subscription creation
      const createAction = actions.find(a => a.type === 'create_subscription');
      expect(createAction).toBeDefined();
      expect(createAction?.description).toContain('Enterprise Plan');
      expect(createAction?.details.collection_method).toBe('manual');
      expect(createAction?.details.net_terms).toBe(30);
      expect(createAction?.details).toHaveProperty('plan_code', 'ENT_PLAN');
    });
  });

  describe('proration calculations', () => {
    it('should calculate proration correctly for different scenarios', () => {
      // This would test the private calculateAdvancedProration method
      // We can test it indirectly through the insertion order scenarios
      const opportunity: Opportunity = {
        id: 'opp_008',
        type: 'insertion_order',
        account_name: 'Test Corp',
        account_id: 'acc_123',
        recurly_account_code: 'test_account',
        opportunity_name: 'Test Proration',
        close_date: '2099-10-15', // Far future date
        amount: 3000,
        contract_start_date: '2099-10-15', // Far future date
        contract_end_date: '2099-12-31', // Far future date
        billing_frequency: 'monthly',
        payment_terms: 'net_30',
        line_items: [
          {
            id: 'li_011',
            product_name: 'Test Service',
            product_code: 'TEST_SVC',
            quantity: 1,
            unit_price: 1000,
            total_price: 3000,
            billing_period: 'monthly',
            description: 'Test service with proration',
            proration_needed: true,
            months_remaining: 2.5,
          },
        ],
        contact_info: {
          primary_contact: 'John Doe',
          email: 'john@test.com',
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

      const mockState: RecurlyState = {
        account: {
          account_code: 'test_account',
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
          company_name: 'Test Corp',
          state: 'active',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-10-15T00:00:00Z',
        },
        subscriptions: [],
        invoices: [],
        transactions: [],
      };

      return billingEngine.generateActions(opportunity, mockState).then(actions => {
        const prorationAction = actions.find(a => a.type === 'prorate_charges');
        expect(prorationAction).toBeDefined();
        expect(prorationAction?.amount_in_cents).toBeGreaterThan(0);
      });
    });
  });
}); 