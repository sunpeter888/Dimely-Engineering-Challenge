import { z } from 'zod';
import { Opportunity, ValidationError, OrderType } from '../types';

// Zod schemas for validation
const LineItemSchema = z.object({
  id: z.string(),
  product_name: z.string(),
  product_code: z.string(),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  total_price: z.number().nonnegative(),
  billing_period: z.enum(['monthly', 'quarterly', 'annually', 'one_time']),
  description: z.string(),
  // Optional fields
  previous_price: z.number().optional(),
  price_change_reason: z.string().optional(),
  is_new_product: z.boolean().optional(),
  proration_needed: z.boolean().optional(),
  months_remaining: z.number().optional(),
  replaces_self_service: z.boolean().optional(),
  self_service_credit_needed: z.boolean().optional(),
  is_new_service: z.boolean().optional(),
});

const ContactInfoSchema = z.object({
  primary_contact: z.string(),
  email: z.string().email(),
  billing_address: z.object({
    company: z.string(),
    address_line_1: z.string(),
    address_line_2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postal_code: z.string(),
    country: z.string(),
  }),
});

const OpportunitySchema = z.object({
  id: z.string(),
  type: z.enum(['new_business', 'renewal', 'insertion_order', 'conversion_order']),
  account_name: z.string(),
  account_id: z.string(),
  recurly_account_code: z.string().optional(),
  opportunity_name: z.string(),
  close_date: z.string(),
  amount: z.number().positive(),
  contract_start_date: z.string(),
  contract_end_date: z.string(),
  billing_frequency: z.enum(['monthly', 'quarterly', 'annually']),
  payment_terms: z.string(),
  line_items: z.array(LineItemSchema).min(1),
  contact_info: ContactInfoSchema,
  sales_rep: z.string(),
  notes: z.string().optional(),
  // Type-specific fields - using any for flexibility
  previous_contract: z.any().optional(),
  existing_contract: z.any().optional(),
  existing_self_service: z.any().optional(),
  renewal_notes: z.array(z.string()).optional(),
  upsell_notes: z.array(z.string()).optional(),
  conversion_notes: z.array(z.string()).optional(),
  proration_details: z.any().optional(),
  billing_transition: z.any().optional(),
});

export class OpportunityParser {
  /**
   * Parse and validate opportunity data from JSON
   */
  parse(data: unknown): { opportunity?: Opportunity; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    
    try {
      // First, validate with Zod schema
      const result = OpportunitySchema.safeParse(data);
      
      if (!result.success) {
        // Convert Zod errors to our ValidationError format
        result.error.issues.forEach((issue: any) => {
          errors.push({
            field: issue.path.join('.'),
            message: issue.message,
            value: issue.path.reduce((obj: any, key: any) => obj?.[key], data),
          });
        });
        return { errors };
      }

      const opportunity = result.data as Opportunity;
      
      // Additional business logic validation
      const businessLogicErrors = this.validateBusinessLogic(opportunity);
      errors.push(...businessLogicErrors);
      
      if (errors.length > 0) {
        return { errors };
      }
      
      return { opportunity, errors: [] };
      
    } catch (error) {
      errors.push({
        field: 'root',
        message: `Failed to parse opportunity: ${error instanceof Error ? error.message : 'Unknown error'}`,
        value: data,
      });
      return { errors };
    }
  }

  /**
   * Validate business logic rules
   */
  private validateBusinessLogic(opportunity: Opportunity): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Date validation - contract start should be after close date
    const closeDate = new Date(opportunity.close_date);
    const startDate = new Date(opportunity.contract_start_date);
    const endDate = new Date(opportunity.contract_end_date);
    
    if (startDate < closeDate) {
      errors.push({
        field: 'contract_start_date',
        message: 'Contract start date cannot be before close date',
        value: opportunity.contract_start_date,
      });
    }
    
    if (endDate <= startDate) {
      errors.push({
        field: 'contract_end_date',
        message: 'Contract end date must be after start date',
        value: opportunity.contract_end_date,
      });
    }
    
    // Line item validation
    const totalLineItems = opportunity.line_items.reduce((sum, item) => sum + item.total_price, 0);
    if (Math.abs(totalLineItems - opportunity.amount) > 0.01) {
      errors.push({
        field: 'amount',
        message: `Opportunity amount (${opportunity.amount}) does not match sum of line items (${totalLineItems})`,
        value: opportunity.amount,
      });
    }
    
    // Type-specific validation
    switch (opportunity.type) {
      case 'renewal':
        if (!opportunity.recurly_account_code) {
          errors.push({
            field: 'recurly_account_code',
            message: 'Renewal opportunities must have existing Recurly account code',
            value: opportunity.recurly_account_code,
          });
        }
        break;
        
      case 'insertion_order':
        if (!opportunity.recurly_account_code) {
          errors.push({
            field: 'recurly_account_code',
            message: 'Insertion order opportunities must have existing Recurly account code',
            value: opportunity.recurly_account_code,
          });
        }
        break;
        
      case 'conversion_order':
        if (!opportunity.recurly_account_code) {
          errors.push({
            field: 'recurly_account_code',
            message: 'Conversion order opportunities must have existing Recurly account code',
            value: opportunity.recurly_account_code,
          });
        }
        break;
    }
    
    return errors;
  }

  /**
   * Check if opportunity has any line items requiring proration
   */
  requiresProration(opportunity: Opportunity): boolean {
    return opportunity.line_items.some(item => item.proration_needed === true);
  }

  /**
   * Get order type-specific requirements
   */
  getRequirements(type: OrderType): string[] {
    switch (type) {
      case 'new_business':
        return ['Create new Recurly account', 'Set up new subscriptions', 'Handle one-time charges'];
      case 'renewal':
        return ['Update existing subscription', 'Handle price changes', 'Manage billing frequency changes'];
      case 'insertion_order':
        return ['Add new subscription items', 'Calculate proration', 'Handle immediate charges'];
      case 'conversion_order':
        return ['Cancel self-service subscription', 'Create enterprise subscription', 'Apply credits'];
      default:
        return [];
    }
  }
} 