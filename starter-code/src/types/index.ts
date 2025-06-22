// Core order types
export type OrderType = 'new_business' | 'renewal' | 'insertion_order' | 'conversion_order';

export interface LineItem {
  id: string;
  product_name: string;
  product_code: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  billing_period: 'monthly' | 'quarterly' | 'annually' | 'one_time';
  description: string;
  // Line item classification for billing logic
  item_classification?: 'subscription_consumption' | 'non_subscription_consumption' | 'one_time_service';
  // Optional fields for specific scenarios
  previous_price?: number;
  price_change_reason?: string;
  is_new_product?: boolean;
  proration_needed?: boolean;
  months_remaining?: number;
  affects_base_subscription?: boolean;
  immediate_invoice?: boolean;
  replaces_self_service?: boolean;
  self_service_credit_needed?: boolean;
  is_new_service?: boolean;
}

export interface ContactInfo {
  primary_contact: string;
  email: string;
  billing_address: {
    company: string;
    address_line_1: string;
    address_line_2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
}

export interface Opportunity {
  id: string;
  type: OrderType;
  account_name: string;
  account_id: string;
  recurly_account_code?: string;
  opportunity_name: string;
  close_date: string;
  amount: number;
  contract_start_date: string;
  contract_end_date: string;
  billing_frequency: 'monthly' | 'quarterly' | 'annually';
  payment_terms: string;
  line_items: LineItem[];
  contact_info: ContactInfo;
  sales_rep: string;
  notes?: string;
  // Order-specific fields
  previous_contract?: any;
  existing_contract?: any;
  existing_self_service?: any;
  renewal_notes?: string[];
  insertion_notes?: string[];
  conversion_notes?: string[];
  proration_details?: ProrationDetails;
  billing_transition?: BillingTransition;
  outstanding_invoices?: OutstandingInvoices;
}

// Enhanced type definitions for order-specific data
export interface ProrationDetails {
  current_period_end?: string;
  next_invoice_date?: string;
  upsell_start_date?: string;
  contract_end_date?: string;
  payment_frequency?: string;
  months_to_prorate?: number;
  days_to_prorate?: number;
  proration_methods?: {
    day_based?: string;
    month_based?: string;
  };
  billing_scenarios?: {
    immediate_invoice?: string;
    subscription_update?: string;
    future_billing?: string;
  };
}

export interface BillingTransition {
  credit_amount_due?: number;
  credit_calculation?: string;
  from_payment_method?: string;
  to_payment_method?: string;
  transition_date?: string;
}

export interface OutstandingInvoices {
  has_outstanding: boolean;
  invoice_ids?: string[];
  total_outstanding?: number;
  requires_processing?: boolean;
}

// Recurly API response types
export interface RecurlyAccount {
  account_code: string;
  email: string;
  first_name: string;
  last_name: string;
  company_name: string;
  state: 'active' | 'closed' | 'past_due';
  created_at: string;
  updated_at: string;
  billing_info?: {
    payment_method: string;
    card_type?: string;
    last_four?: string;
    exp_month?: number;
    exp_year?: number;
  };
  address?: {
    address1: string;
    address2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
}

export interface RecurlySubscription {
  uuid: string;
  plan_code: string;
  state: 'active' | 'canceled' | 'expired' | 'future' | 'in_trial' | 'live' | 'paused' | 'past_due';
  unit_amount_in_cents: number;
  quantity: number;
  current_period_started_at: string;
  current_period_ends_at: string;
  started_at: string;
  expires_at?: string;
  collection_method: 'automatic' | 'manual';
  net_terms: number;
  add_ons?: Array<{
    add_on_code: string;
    quantity: number;
    unit_amount_in_cents: number;
  }>;
}

export interface RecurlyInvoice {
  invoice_number: string;
  state: 'pending' | 'processing' | 'past_due' | 'paid' | 'failed' | 'voided';
  total_in_cents: number;
  created_at: string;
  due_at: string;
  closed_at?: string;
  line_items: Array<{
    type: 'plan' | 'add_on' | 'adjustment' | 'credit';
    description: string;
    amount_in_cents: number;
    plan_code?: string;
    add_on_code?: string;
  }>;
}

export interface RecurlyState {
  account: RecurlyAccount;
  subscriptions: RecurlySubscription[];
  invoices: RecurlyInvoice[];
  transactions: Array<{
    type: string;
    action: string;
    amount_in_cents: number;
    status: 'success' | 'failed' | 'void' | 'pending';
    created_at: string;
    invoice_number?: string;
  }>;
  credits?: Array<{
    type: string;
    amount_in_cents: number;
    description: string;
  }>;
}

// Billing action types for output
export type BillingActionType = 
  | 'create_account'
  | 'update_account'
  | 'create_subscription'
  | 'update_subscription'
  | 'cancel_subscription'
  | 'create_invoice'
  | 'apply_credit'
  | 'charge_one_time'
  | 'prorate_charges';

export interface BillingAction {
  type: BillingActionType;
  description: string;
  details: Record<string, any>;
  amount_in_cents?: number;
  effective_date?: string;
  requires_review: boolean;
  risk_level: 'low' | 'medium' | 'high';
  notes?: string[];
}

export interface ReviewSheet {
  opportunity_id: string;
  opportunity_name: string;
  account_name: string;
  total_actions: number;
  high_risk_actions: number;
  estimated_total_impact: number;
  billing_actions: BillingAction[];
  summary: string;
  warnings: string[];
  manual_review_required: boolean;
  generated_at: string;
}

// Error handling types
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ProcessingResult {
  success: boolean;
  review_sheet?: ReviewSheet;
  errors?: ValidationError[];
  warnings?: string[];
} 

// Define interfaces for tracking created resources
export interface CreatedAccount {
  account_code: string;
  company_name: string;
  email: string;
}

export interface CreatedSubscription {
  uuid: string;
  plan_code: string;
  unit_amount_in_cents: number;
  quantity: number;
}

export interface CreatedCharge {
  type: 'charge_one_time' | 'prorate_charges';
  description: string;
  details: Record<string, unknown>;
  amount_in_cents: number;
}

export interface CreatedInvoice {
  type: 'create_invoice';
  description: string;
  details: Record<string, unknown>;
  amount_in_cents: number;
}

export interface AppliedCredit {
  type: 'apply_credit';
  description: string;
  details: Record<string, unknown>;
  amount_in_cents: number;
}

export interface CancelledSubscription {
  subscription: CreatedSubscription;
  original: {
    state: string;
    plan_code: string;
    unit_amount_in_cents: number;
    quantity: number;
  };
}

export interface UpdatedSubscription {
  subscription: CreatedSubscription;
  original: {
    unit_amount_in_cents: number;
    quantity: number;
    plan_code: string;
  };
}