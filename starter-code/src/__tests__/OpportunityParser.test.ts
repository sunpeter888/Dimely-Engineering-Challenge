import { OpportunityParser } from '../parsers/OpportunityParser';

describe('OpportunityParser', () => {
  let parser: OpportunityParser;

  beforeEach(() => {
    parser = new OpportunityParser();
  });

  describe('parse', () => {
    it('should successfully parse a valid new business opportunity', () => {
      const validOpportunity = {
        id: 'opp_001',
        type: 'new_business',
        account_name: 'Test Corp',
        account_id: 'acc_123',
        opportunity_name: 'Test Opportunity',
        close_date: '2024-10-15',
        amount: 12000,
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
            total_price: 12000,
            billing_period: 'monthly',
            description: 'Test product description',
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
      expect(result.opportunity?.account_name).toBe('Test Corp');
    });

    it('should return validation errors for invalid opportunity', () => {
      const invalidOpportunity = {
        id: 'opp_001',
        type: 'invalid_type',
        // Missing required fields
      };

      const result = parser.parse(invalidOpportunity);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.opportunity).toBeUndefined();
    });

    it('should validate business logic - contract dates', () => {
      const opportunityWithInvalidDates = {
        id: 'opp_001',
        type: 'new_business',
        account_name: 'Test Corp',
        account_id: 'acc_123',
        opportunity_name: 'Test Opportunity',
        close_date: '2024-10-15',
        amount: 1000,
        contract_start_date: '2024-10-01', // Before close date
        contract_end_date: '2024-09-30', // Before start date
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
            description: 'Test product description',
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

      const result = parser.parse(opportunityWithInvalidDates);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.field === 'contract_start_date')).toBe(true);
      expect(result.errors.some(e => e.field === 'contract_end_date')).toBe(true);
    });

    it('should validate line item totals match opportunity amount', () => {
      const opportunityWithMismatchedTotals = {
        id: 'opp_001',
        type: 'new_business',
        account_name: 'Test Corp',
        account_id: 'acc_123',
        opportunity_name: 'Test Opportunity',
        close_date: '2024-10-15',
        amount: 5000, // Different from line item total
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
            total_price: 1000, // Total is 1000, but opportunity amount is 5000
            billing_period: 'monthly',
            description: 'Test product description',
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

      const result = parser.parse(opportunityWithMismatchedTotals);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.field === 'amount')).toBe(true);
    });
  });

  describe('requiresProration', () => {
    it('should return true when opportunity has line items requiring proration', () => {
      const opportunity = {
        line_items: [
          {
            id: 'li_001',
            proration_needed: true,
            product_name: 'Test Product',
            product_code: 'TEST_PROD',
            quantity: 1,
            unit_price: 1000,
            total_price: 1000,
            billing_period: 'monthly' as const,
            description: 'Test product description',
          },
        ],
      } as any;

      expect(parser.requiresProration(opportunity)).toBe(true);
    });

    it('should return false when no line items require proration', () => {
      const opportunity = {
        line_items: [
          {
            id: 'li_001',
            proration_needed: false,
            product_name: 'Test Product',
            product_code: 'TEST_PROD',
            quantity: 1,
            unit_price: 1000,
            total_price: 1000,
            billing_period: 'monthly' as const,
            description: 'Test product description',
          },
        ],
      } as any;

      expect(parser.requiresProration(opportunity)).toBe(false);
    });
  });

  describe('getRequirements', () => {
    it('should return correct requirements for new business', () => {
      const requirements = parser.getRequirements('new_business');
      expect(requirements).toContain('Create new Recurly account');
      expect(requirements).toContain('Set up new subscriptions');
      expect(requirements).toContain('Handle one-time charges');
    });

    it('should return correct requirements for renewal', () => {
      const requirements = parser.getRequirements('renewal');
      expect(requirements).toContain('Update existing subscription');
      expect(requirements).toContain('Handle price changes');
      expect(requirements).toContain('Manage billing frequency changes');
    });

    it('should return correct requirements for insertion order', () => {
      const requirements = parser.getRequirements('insertion_order');
      expect(requirements).toContain('Add new subscription items');
      expect(requirements).toContain('Calculate proration');
      expect(requirements).toContain('Handle immediate charges');
    });

    it('should return correct requirements for conversion order', () => {
      const requirements = parser.getRequirements('conversion_order');
      expect(requirements).toContain('Cancel self-service subscription');
      expect(requirements).toContain('Create enterprise subscription');
      expect(requirements).toContain('Apply credits');
    });
  });
}); 