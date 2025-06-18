import { Opportunity, RecurlyState, BillingAction, BillingActionType } from '../types';
import { RecurlyClient } from '../clients/RecurlyClient';

export class BillingEngine {
  constructor(private recurlyClient: RecurlyClient) {}

  /**
   * Generate billing actions based on opportunity and current Recurly state
   */
  async generateActions(opportunity: Opportunity, recurlyState: RecurlyState | null): Promise<BillingAction[]> {
    const actions: BillingAction[] = [];

    switch (opportunity.type) {
      case 'new_business':
        actions.push(...this.generateNewBusinessActions(opportunity));
        break;
      case 'renewal':
        actions.push(...this.generateRenewalActions(opportunity, recurlyState));
        break;
      case 'insertion_order':
        actions.push(...this.generateInsertionOrderActions(opportunity, recurlyState));
        break;
      case 'conversion_order':
        actions.push(...this.generateConversionActions(opportunity, recurlyState));
        break;
    }

    return actions;
  }

  /**
   * Generate actions for new business opportunities
   */
  private generateNewBusinessActions(opportunity: Opportunity): BillingAction[] {
    const actions: BillingAction[] = [];

    // Create new account
    actions.push({
      type: 'create_account',
      description: `Create new Recurly account for ${opportunity.account_name}`,
      details: {
        account_code: opportunity.account_id,
        company_name: opportunity.contact_info.billing_address.company,
        email: opportunity.contact_info.email,
        billing_address: opportunity.contact_info.billing_address,
      },
      requires_review: false,
      risk_level: 'low',
    });

    // Handle line items
    opportunity.line_items.forEach(item => {
      if (item.billing_period === 'one_time') {
        actions.push({
          type: 'charge_one_time',
          description: `One-time charge: ${item.product_name}`,
          details: {
            product_code: item.product_code,
            amount_in_cents: item.total_price * 100,
            description: item.description,
          },
          amount_in_cents: item.total_price * 100,
          effective_date: opportunity.contract_start_date,
          requires_review: item.total_price > 1000,
          risk_level: item.total_price > 5000 ? 'high' : 'medium',
        });
      } else {
        actions.push({
          type: 'create_subscription',
          description: `Create subscription: ${item.product_name}`,
          details: {
            plan_code: item.product_code,
            unit_amount_in_cents: item.unit_price * 100,
            quantity: item.quantity,
            billing_period: item.billing_period,
          },
          amount_in_cents: item.total_price * 100,
          effective_date: opportunity.contract_start_date,
          requires_review: false,
          risk_level: 'low',
        });
      }
    });

    return actions;
  }

  /**
   * Generate actions for renewal opportunities
   */
  private generateRenewalActions(opportunity: Opportunity, recurlyState: RecurlyState | null): BillingAction[] {
    const actions: BillingAction[] = [];

    if (!recurlyState) {
      actions.push({
        type: 'create_account',
        description: `ERROR: Renewal opportunity but no existing Recurly account found`,
        details: {},
        requires_review: true,
        risk_level: 'high',
        notes: ['Manual intervention required - account should exist for renewal'],
      });
      return actions;
    }

    // Update existing subscriptions or create new ones
    opportunity.line_items.forEach(item => {
      const existingSubscription = recurlyState.subscriptions.find(
        sub => sub.plan_code === item.product_code || sub.plan_code.includes(item.product_code)
      );

      if (existingSubscription) {
        actions.push({
          type: 'update_subscription',
          description: `Update subscription: ${item.product_name}`,
          details: {
            subscription_id: existingSubscription.uuid,
            new_unit_amount_in_cents: item.unit_price * 100,
            new_quantity: item.quantity,
            previous_amount: existingSubscription.unit_amount_in_cents,
          },
          amount_in_cents: item.total_price * 100,
          effective_date: opportunity.contract_start_date,
          requires_review: item.previous_price !== undefined,
          risk_level: item.previous_price && item.unit_price > item.previous_price ? 'medium' : 'low',
          notes: item.price_change_reason ? [item.price_change_reason] : undefined,
        });
      } else {
        actions.push({
          type: 'create_subscription',
          description: `Create new subscription: ${item.product_name}`,
          details: {
            plan_code: item.product_code,
            unit_amount_in_cents: item.unit_price * 100,
            quantity: item.quantity,
          },
          amount_in_cents: item.total_price * 100,
          effective_date: opportunity.contract_start_date,
          requires_review: true,
          risk_level: 'medium',
          notes: ['New product added during renewal'],
        });
      }
    });

    return actions;
  }

  /**
   * Generate actions for insertion order opportunities
   */
  private generateInsertionOrderActions(opportunity: Opportunity, recurlyState: RecurlyState | null): BillingAction[] {
    const actions: BillingAction[] = [];

    if (!recurlyState) {
      actions.push({
        type: 'create_account',
        description: `ERROR: Insertion order opportunity but no existing Recurly account found`,
        details: {},
        requires_review: true,
        risk_level: 'high',
        notes: ['Manual intervention required - account should exist for insertion order'],
      });
      return actions;
    }

    opportunity.line_items.forEach(item => {
      if (item.billing_period === 'one_time') {
        actions.push({
          type: 'charge_one_time',
          description: `One-time charge: ${item.product_name}`,
          details: {
            product_code: item.product_code,
            amount_in_cents: item.total_price * 100,
          },
          amount_in_cents: item.total_price * 100,
          requires_review: false,
          risk_level: 'low',
        });
      } else if (item.proration_needed) {
        actions.push({
          type: 'prorate_charges',
          description: `Prorate charges for: ${item.product_name}`,
          details: {
            product_code: item.product_code,
            monthly_amount: item.unit_price * 100,
            months_remaining: item.months_remaining || 0,
            proration_date: opportunity.contract_start_date,
          },
          amount_in_cents: this.calculateProration(item.unit_price, item.months_remaining || 0),
          effective_date: opportunity.contract_start_date,
          requires_review: true,
          risk_level: 'medium',
          notes: ['Proration calculation - verify dates and amounts'],
        });
      }
    });

    return actions;
  }

  /**
   * Generate actions for self-service conversion opportunities
   */
  private generateConversionActions(opportunity: Opportunity, recurlyState: RecurlyState | null): BillingAction[] {
    const actions: BillingAction[] = [];

    if (!recurlyState) {
      actions.push({
        type: 'create_account',
        description: `ERROR: Conversion opportunity but no existing Recurly account found`,
        details: {},
        requires_review: true,
        risk_level: 'high',
        notes: ['Manual intervention required - self-service account should exist'],
      });
      return actions;
    }

    // Cancel existing self-service subscriptions
    recurlyState.subscriptions.forEach(subscription => {
      if (subscription.state === 'active') {
        actions.push({
          type: 'cancel_subscription',
          description: `Cancel self-service subscription: ${subscription.plan_code}`,
          details: {
            subscription_id: subscription.uuid,
            cancellation_date: opportunity.contract_start_date,
          },
          requires_review: false,
          risk_level: 'medium',
          notes: ['Ensure no service interruption during transition'],
        });
      }
    });

    // Apply credit for unused self-service time
    if (opportunity.billing_transition?.credit_amount_due) {
      actions.push({
        type: 'apply_credit',
        description: `Apply credit for unused self-service period`,
        details: {
          credit_amount_in_cents: opportunity.billing_transition.credit_amount_due * 100,
          description: opportunity.billing_transition.credit_calculation,
        },
        amount_in_cents: opportunity.billing_transition.credit_amount_due * 100,
        requires_review: true,
        risk_level: 'medium',
        notes: ['Verify credit calculation is correct'],
      });
    }

    // Create new enterprise subscriptions
    opportunity.line_items.forEach(item => {
      actions.push({
        type: 'create_subscription',
        description: `Create enterprise subscription: ${item.product_name}`,
        details: {
          plan_code: item.product_code,
          unit_amount_in_cents: item.unit_price * 100,
          quantity: item.quantity,
          collection_method: 'manual', // Switch to invoicing
          net_terms: 30,
        },
        amount_in_cents: item.total_price * 100,
        effective_date: opportunity.contract_start_date,
        requires_review: false,
        risk_level: 'low',
      });
    });

    return actions;
  }

  /**
   * Calculate prorated amount for partial periods
   */
  private calculateProration(monthlyAmount: number, monthsRemaining: number): number {
    // Simple daily proration calculation
    const dailyRate = monthlyAmount / 30;
    const daysRemaining = monthsRemaining * 30;
    return Math.round(dailyRate * daysRemaining * 100); // Return in cents
  }
} 