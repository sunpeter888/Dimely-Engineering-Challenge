import { Opportunity, RecurlyState, BillingAction, LineItem } from '../types';
import { RecurlyClient } from '../clients/RecurlyClient';
import { differenceInDays } from 'date-fns';

export class BillingEngine {
  constructor(private recurlyClient: RecurlyClient) {}

  /**
   * Generate billing actions based on opportunity and current Recurly state
   */
  async generateActions(opportunity: Opportunity, recurlyState: RecurlyState | null): Promise<BillingAction[]> {
    const actions: BillingAction[] = [];

    switch (opportunity.type) {
      case 'new_business':
        actions.push(...(await this.generateNewBusinessActions(opportunity)));
        break;
      case 'renewal':
        actions.push(...(await this.generateRenewalActions(opportunity, recurlyState)));
        break;
      case 'insertion_order':
        actions.push(...(await this.generateInsertionOrderActions(opportunity, recurlyState)));
        break;
      case 'conversion_order':
        actions.push(...(await this.generateConversionActions(opportunity, recurlyState)));
        break;
    }

    return actions;
  }

  /**
   * Generate actions for new business opportunities
   */
  private async generateNewBusinessActions(opportunity: Opportunity): Promise<BillingAction[]> {
    const actions: BillingAction[] = [];

    // Create new account (simulate API call)
    const createdAccount = await this.recurlyClient.createAccount({
      account_code: opportunity.account_id,
      company_name: opportunity.contact_info.billing_address.company,
      email: opportunity.contact_info.email,
    });
    actions.push({
      type: 'create_account',
      description: `Create new Recurly account for ${opportunity.account_name}`,
      details: createdAccount,
      requires_review: false,
      risk_level: 'low',
    });

    // Handle line items
    for (const item of opportunity.line_items) {
      if (item.billing_period === 'one_time') {
        const riskLevel = this.calculateRiskLevel(item.total_price);
        actions.push({
          type: 'charge_one_time',
          description: `One-time charge: ${item.product_name}`,
          details: {
            product_code: item.product_code,
            amount_in_cents: item.total_price * 100,
            description: item.description,
            quantity: item.quantity,
          },
          amount_in_cents: item.total_price * 100,
          effective_date: opportunity.contract_start_date,
          requires_review: item.total_price > 1000,
          risk_level: riskLevel,
          notes: item.total_price > 5000 ? ['High-value one-time charge'] : undefined,
        });
      } else {
        // Simulate subscription creation
        const createdSub = await this.recurlyClient.createSubscription(opportunity.account_id, {
          plan_code: item.product_code,
          unit_amount_in_cents: item.unit_price * 100,
          quantity: item.quantity,
          billing_period: item.billing_period,
          start_date: opportunity.contract_start_date,
          end_date: opportunity.contract_end_date,
        });
        actions.push({
          type: 'create_subscription',
          description: `Create subscription: ${item.product_name} (${item.billing_period})`,
          details: createdSub,
          amount_in_cents: item.total_price * 100,
          effective_date: opportunity.contract_start_date,
          requires_review: false,
          risk_level: 'low',
        });
      }
    }

    return actions;
  }

  /**
   * Generate actions for renewal opportunities
   */
  private async generateRenewalActions(opportunity: Opportunity, recurlyState: RecurlyState | null): Promise<BillingAction[]> {
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
    for (const item of opportunity.line_items) {
      const existingSubscription = this.findMatchingSubscription(recurlyState, item);

      if (existingSubscription) {
        const priceChange = item.unit_price - (existingSubscription.unit_amount_in_cents / 100);
        const riskLevel = this.calculateRiskLevel(Math.abs(priceChange));
        // Simulate update subscription
        const updatedSub = await this.recurlyClient.updateSubscription(existingSubscription.uuid, {
          plan_code: item.product_code,
          new_unit_amount_in_cents: item.unit_price * 100,
          new_quantity: item.quantity,
        });
        actions.push({
          type: 'update_subscription',
          description: `Update subscription: ${item.product_name}`,
          details: updatedSub,
          amount_in_cents: item.total_price * 100,
          effective_date: opportunity.contract_start_date,
          requires_review: Math.abs(priceChange) > 100,
          risk_level: riskLevel,
          notes: item.price_change_reason ? [item.price_change_reason] : undefined,
        });
      } else {
        // Simulate new subscription
        const createdSub = await this.recurlyClient.createSubscription(opportunity.account_id, {
          plan_code: item.product_code,
          unit_amount_in_cents: item.unit_price * 100,
          quantity: item.quantity,
          billing_period: item.billing_period,
        });
        actions.push({
          type: 'create_subscription',
          description: `Create new subscription: ${item.product_name}`,
          details: createdSub,
          amount_in_cents: item.total_price * 100,
          effective_date: opportunity.contract_start_date,
          requires_review: true,
          risk_level: 'medium',
          notes: ['New product added during renewal'],
        });
      }
    }

    return actions;
  }

  /**
   * Generate actions for insertion order opportunities
   */
  private async generateInsertionOrderActions(opportunity: Opportunity, recurlyState: RecurlyState | null): Promise<BillingAction[]> {
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

    // Handle outstanding invoices first
    if (opportunity.outstanding_invoices?.has_outstanding) {
      actions.push({
        type: 'create_invoice',
        description: `Process outstanding invoices: $${opportunity.outstanding_invoices.total_outstanding}`,
        details: {
          invoice_ids: opportunity.outstanding_invoices.invoice_ids,
          total_amount: opportunity.outstanding_invoices.total_outstanding,
        },
        amount_in_cents: (opportunity.outstanding_invoices?.total_outstanding || 0) * 100,
        requires_review: true,
        risk_level: 'medium',
        notes: ['Outstanding invoices must be processed before new charges'],
      });
    }

    for (const item of opportunity.line_items) {
      if (item.billing_period === 'one_time') {
        const riskLevel = this.calculateRiskLevel(item.total_price);
        actions.push({
          type: 'charge_one_time',
          description: `One-time charge: ${item.product_name}`,
          details: {
            product_code: item.product_code,
            amount_in_cents: item.total_price * 100,
            immediate_invoice: item.immediate_invoice || false,
          },
          amount_in_cents: item.total_price * 100,
          effective_date: opportunity.contract_start_date,
          requires_review: item.total_price > 1000,
          risk_level: riskLevel,
          notes: item.immediate_invoice ? ['Immediate invoicing required'] : undefined,
        });
      } else if (item.proration_needed) {
        const prorationAmount = this.calculateAdvancedProration(
          item,
          opportunity.contract_start_date,
          opportunity.contract_end_date,
          opportunity.billing_frequency
        );
        actions.push({
          type: 'prorate_charges',
          description: `Prorate charges for: ${item.product_name}`,
          details: {
            product_code: item.product_code,
            monthly_amount: item.unit_price * 100,
            months_remaining: item.months_remaining || 0,
            proration_date: opportunity.contract_start_date,
            proration_amount: prorationAmount,
            item_classification: item.item_classification,
            affects_base_subscription: item.affects_base_subscription,
          },
          amount_in_cents: prorationAmount,
          effective_date: opportunity.contract_start_date,
          requires_review: true,
          risk_level: 'medium',
          notes: [
            'Proration calculation - verify dates and amounts',
            `Classification: ${item.item_classification || 'unknown'}`,
          ],
        });
      } else {
        // Simulate subscription creation
        const createdSub = await this.recurlyClient.createSubscription(opportunity.account_id, {
          plan_code: item.product_code,
          unit_amount_in_cents: item.unit_price * 100,
          quantity: item.quantity,
          billing_period: item.billing_period,
          item_classification: item.item_classification,
        });
        actions.push({
          type: 'create_subscription',
          description: `Add subscription: ${item.product_name}`,
          details: createdSub,
          amount_in_cents: item.total_price * 100,
          effective_date: opportunity.contract_start_date,
          requires_review: false,
          risk_level: 'low',
        });
      }
    }

    return actions;
  }

  /**
   * Generate actions for self-service conversion opportunities
   */
  private async generateConversionActions(opportunity: Opportunity, recurlyState: RecurlyState | null): Promise<BillingAction[]> {
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
    for (const subscription of recurlyState.subscriptions) {
      if (subscription.state === 'active') {
        await this.recurlyClient.cancelSubscription(subscription.uuid);
        actions.push({
          type: 'cancel_subscription',
          description: `Cancel self-service subscription: ${subscription.plan_code}`,
          details: {
            subscription_id: subscription.uuid,
            cancellation_date: opportunity.contract_start_date,
            current_amount: subscription.unit_amount_in_cents,
          },
          requires_review: false,
          risk_level: 'medium',
          notes: ['Ensure no service interruption during transition'],
        });
      }
    }

    // Apply credit for unused self-service time
    if (opportunity.billing_transition?.credit_amount_due) {
      actions.push({
        type: 'apply_credit',
        description: `Apply credit for unused self-service period`,
        details: {
          credit_amount_in_cents: opportunity.billing_transition.credit_amount_due * 100,
          description: opportunity.billing_transition.credit_calculation,
          credit_reason: 'Self-service to enterprise conversion',
        },
        amount_in_cents: opportunity.billing_transition.credit_amount_due * 100,
        requires_review: true,
        risk_level: 'medium',
        notes: ['Verify credit calculation is correct'],
      });
    }

    // Create new enterprise subscriptions
    for (const item of opportunity.line_items) {
      const createdSub = await this.recurlyClient.createSubscription(opportunity.account_id, {
        plan_code: item.product_code,
        unit_amount_in_cents: item.unit_price * 100,
        quantity: item.quantity,
        collection_method: 'manual', // Switch to invoicing
        net_terms: 30,
        replaces_self_service: item.replaces_self_service || false,
      });
      actions.push({
        type: 'create_subscription',
        description: `Create enterprise subscription: ${item.product_name}`,
        details: createdSub,
        amount_in_cents: item.total_price * 100,
        effective_date: opportunity.contract_start_date,
        requires_review: false,
        risk_level: 'low',
      });
    }

    return actions;
  }

  /**
   * Find matching subscription for a line item
   */
  private findMatchingSubscription(recurlyState: RecurlyState, lineItem: LineItem) {
    return recurlyState.subscriptions.find(sub => 
      sub.plan_code === lineItem.product_code || 
      sub.plan_code.includes(lineItem.product_code) ||
      lineItem.product_code.includes(sub.plan_code)
    );
  }

  /**
   * Calculate risk level based on amount
   */
  private calculateRiskLevel(amount: number): 'low' | 'medium' | 'high' {
    if (amount <= 1000) return 'low';
    if (amount <= 5000) return 'medium';
    return 'high';
  }

  /**
   * Advanced proration calculation with day-based and month-based options
   */
  private calculateAdvancedProration(
    lineItem: LineItem,
    startDate: string,
    endDate: string,
    billingFrequency: string
  ): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    const effectiveStart = start < now ? now : start;
    const daysRemaining = differenceInDays(end, effectiveStart);
    if (daysRemaining <= 0) {
      return 0;
    }
    const dailyRate = (lineItem.unit_price * lineItem.quantity) / 30;
    const dayBasedProration = dailyRate * daysRemaining;
    const monthsRemaining = Math.ceil(daysRemaining / 30);
    const monthBasedProration = lineItem.unit_price * lineItem.quantity * monthsRemaining;
    const prorationAmount = Math.min(dayBasedProration, monthBasedProration);
    return Math.round(prorationAmount * 100); // Return in cents
  }
} 