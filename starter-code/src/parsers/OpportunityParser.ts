import { z } from 'zod';
import { Opportunity, ValidationError } from '../types';

const LineItemSchema = z.object({
  id: z.string(),
  product_name: z.string(),
  product_code: z.string(),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  total_price: z.number().nonnegative(),
  billing_period: z.enum(['monthly', 'quarterly', 'annually', 'one_time']),
  description: z.string(),
  previous_price: z.number().optional(),
  price_change_reason: z.string().optional(),
  is_new_product: z.boolean().optional(),
  proration_needed: z.boolean().optional(),
  months_remaining: z.number().optional(),
  replaces_self_service: z.boolean().optional(),
  self_service_credit_needed: z.boolean().optional(),
  is_new_service: z.boolean().optional(),
  item_classification: z.enum(['subscription_consumption', 'non_subscription_consumption', 'one_time_service']).optional(),
  affects_base_subscription: z.boolean().optional(),
  immediate_invoice: z.boolean().optional(),
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
  conversion_date: z.string().optional(),
  previous_contract: z.any().optional(),
  existing_contract: z.any().optional(),
  existing_self_service: z.any().optional(),
  renewal_notes: z.array(z.string()).optional(),
  insertion_notes: z.array(z.string()).optional(),
  conversion_notes: z.array(z.string()).optional(),
  proration_details: z.any().optional(),
  billing_transition: z.any().optional(),
  outstanding_invoices: z.any().optional(),
});

export class OpportunityParser {
  parse(data: unknown): { opportunity?: Opportunity; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    
    try {
      const result = OpportunitySchema.safeParse(data);
      
      if (!result.success) {
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
} 