import { differenceInDays } from 'date-fns';
import { RecurlyClient } from '../clients/RecurlyClient';
import { Opportunity, RecurlyState, BillingAction, LineItem, CreatedAccount, CreatedSubscription, CreatedCharge, UpdatedSubscription, CreatedInvoice, CancelledSubscription, AppliedCredit } from '../types';

export class BillingEngine {
  constructor(private recurlyClient: RecurlyClient) {}

  /**
   * Generate billing actions based on opportunity and current Recurly state
   */
  async generateActions(opportunity: Opportunity, recurlyState: RecurlyState | null): Promise<BillingAction[]> {
    const actions: BillingAction[] = [];

    try {
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
    } catch (error) {
      actions.push({
        type: 'error' as BillingAction['type'],
        description: `Critical error during ${opportunity.type} processing`,
        details: { error: String(error), opportunity_id: opportunity.id },
        requires_review: true,
        risk_level: 'high',
        notes: ['Processing completely failed', 'Manual intervention required'],
      });
    }

    return actions;
  }

  /**
   * Generate actions for new business opportunities with error handling and rollback
   */
  private async generateNewBusinessActions(opportunity: Opportunity): Promise<BillingAction[]> {
    const actions: BillingAction[] = [];
    let createdAccount: CreatedAccount | null = null;
    const createdSubscriptions: CreatedSubscription[] = [];
    const createdCharges: CreatedCharge[] = [];

    try {
      // Create new account (simulate API call)
      const accountResponse = await this.recurlyClient.createAccount({
        account_code: opportunity.account_id,
        company_name: opportunity.contact_info.billing_address.company,
        email: opportunity.contact_info.email,
      });
      createdAccount = {
        account_code: accountResponse.account_code,
        company_name: accountResponse.company_name,
        email: accountResponse.email,
      };
      actions.push({
        type: 'create_account',
        description: `Create new Recurly account for ${opportunity.account_name}`,
        details: accountResponse,
        requires_review: false,
        risk_level: 'low',
      });

      // Handle line items
      for (const item of opportunity.line_items) {
        try {
          if (item.billing_period === 'one_time') {
            const riskLevel = this.calculateRiskLevel(item.total_price);
            const chargeAction: CreatedCharge = {
              type: 'charge_one_time',
              description: `One-time charge: ${item.product_name}`,
              details: {
                product_code: item.product_code,
                amount_in_cents: item.total_price * 100,
                description: item.description,
                quantity: item.quantity,
              },
              amount_in_cents: item.total_price * 100,
            };
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
            createdCharges.push(chargeAction);
          } else {
            // Simulate subscription creation
            const subscriptionResponse = await this.recurlyClient.createSubscription(opportunity.account_id, {
              plan_code: item.product_code,
              unit_amount_in_cents: item.unit_price * 100,
              quantity: item.quantity,
              billing_period: item.billing_period,
              start_date: opportunity.contract_start_date,
              end_date: opportunity.contract_end_date,
            });
            const createdSub: CreatedSubscription = {
              uuid: subscriptionResponse.uuid,
              plan_code: subscriptionResponse.plan_code,
              unit_amount_in_cents: subscriptionResponse.unit_amount_in_cents,
              quantity: subscriptionResponse.quantity,
            };
            createdSubscriptions.push(createdSub);
            actions.push({
              type: 'create_subscription',
              description: `Create subscription: ${item.product_name} (${item.billing_period})`,
              details: subscriptionResponse,
              amount_in_cents: item.total_price * 100,
              effective_date: opportunity.contract_start_date,
              requires_review: false,
              risk_level: 'low',
            });
          }
        } catch (itemError) {
          // Rollback previous items in this iteration
          await this.rollbackNewBusinessItems(createdSubscriptions, createdCharges, actions);
          throw itemError; // Re-throw to trigger main rollback
        }
      }
    } catch (error) {
      // Main rollback logic
      await this.rollbackNewBusinessItems(createdSubscriptions, createdCharges, actions);
      
      // Note: Account deletion not available in RecurlyClient, manual intervention required
      if (createdAccount) {
        actions.push({
          type: 'error' as BillingAction['type'],
          description: `Account ${createdAccount.account_code} created but processing failed`,
          details: { account_code: createdAccount.account_code },
          requires_review: true,
          risk_level: 'high',
          notes: ['Manual intervention required to close/delete account', 'Rollback due to error during new business processing'],
        });
      }

      actions.push({
        type: 'error' as BillingAction['type'],
        description: 'Error during new business processing',
        details: { error: String(error), opportunity_id: opportunity.id },
        requires_review: true,
        risk_level: 'high',
        notes: ['Processing halted, rollback attempted'],
      });
    }

    return actions;
  }

  /**
   * Rollback helper for new business items
   */
  private async rollbackNewBusinessItems(
    createdSubscriptions: CreatedSubscription[], 
    createdCharges: CreatedCharge[], 
    actions: BillingAction[]
  ): Promise<void> {
    // Rollback subscriptions
    for (const sub of createdSubscriptions) {
      try {
        await this.recurlyClient.cancelSubscription(sub.uuid);
        actions.push({
          type: 'cancel_subscription',
          description: `Rollback: Cancel subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: 'high',
          notes: ['Rollback due to error during new business processing'],
        });
      } catch (rollbackError) {
        actions.push({
          type: 'cancel_subscription',
          description: `Rollback failed: Could not cancel subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: 'high',
          notes: ['Rollback failed', String(rollbackError)],
        });
      }
    }

    // Note: One-time charges typically cannot be rolled back once processed
    if (createdCharges.length > 0) {
      actions.push({
        type: 'error' as BillingAction['type'],
        description: 'One-time charges cannot be rolled back',
        details: { charges: createdCharges.map(c => c.details) },
        requires_review: true,
        risk_level: 'high',
        notes: ['Manual intervention required for charge reversals'],
      });
    }
  }

  /**
   * Generate actions for renewal opportunities with error handling and rollback
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

    const updatedSubscriptions: UpdatedSubscription[] = [];
    const createdSubscriptions: CreatedSubscription[] = [];
    const originalStates: Map<string, { unit_amount_in_cents: number; quantity: number; plan_code: string }> = new Map();

    try {
      // Update existing subscriptions or create new ones
      for (const item of opportunity.line_items) {
        const existingSubscription = this.findMatchingSubscription(recurlyState, item);

        if (existingSubscription) {
          // Store original state for potential rollback
          originalStates.set(existingSubscription.uuid, {
            unit_amount_in_cents: existingSubscription.unit_amount_in_cents,
            quantity: existingSubscription.quantity,
            plan_code: existingSubscription.plan_code,
          });

          const priceChange = item.unit_price - (existingSubscription.unit_amount_in_cents / 100);
          const riskLevel = this.calculateRiskLevel(Math.abs(priceChange));
          
          // Simulate update subscription
          const subscriptionResponse = await this.recurlyClient.updateSubscription(existingSubscription.uuid, {
            plan_code: item.product_code,
            new_unit_amount_in_cents: item.unit_price * 100,
            new_quantity: item.quantity,
          });
          const updatedSub: CreatedSubscription = {
            uuid: subscriptionResponse.uuid,
            plan_code: subscriptionResponse.plan_code,
            unit_amount_in_cents: subscriptionResponse.unit_amount_in_cents,
            quantity: subscriptionResponse.quantity,
          };
          updatedSubscriptions.push({ 
            subscription: updatedSub, 
            original: originalStates.get(existingSubscription.uuid)! 
          });
          
          actions.push({
            type: 'update_subscription',
            description: `Update subscription: ${item.product_name}`,
            details: subscriptionResponse,
            amount_in_cents: item.total_price * 100,
            effective_date: opportunity.contract_start_date,
            requires_review: Math.abs(priceChange) > 100,
            risk_level: riskLevel,
            notes: item.price_change_reason ? [item.price_change_reason] : undefined,
          });
        } else {
          // Simulate new subscription
          const subscriptionResponse = await this.recurlyClient.createSubscription(opportunity.account_id, {
            plan_code: item.product_code,
            unit_amount_in_cents: item.unit_price * 100,
            quantity: item.quantity,
            billing_period: item.billing_period,
          });
          const createdSub: CreatedSubscription = {
            uuid: subscriptionResponse.uuid,
            plan_code: subscriptionResponse.plan_code,
            unit_amount_in_cents: subscriptionResponse.unit_amount_in_cents,
            quantity: subscriptionResponse.quantity,
          };
          createdSubscriptions.push(createdSub);
          
          actions.push({
            type: 'create_subscription',
            description: `Create new subscription: ${item.product_name}`,
            details: subscriptionResponse,
            amount_in_cents: item.total_price * 100,
            effective_date: opportunity.contract_start_date,
            requires_review: true,
            risk_level: 'medium',
            notes: ['New product added during renewal'],
          });
        }
      }
    } catch (error) {
      // Rollback logic for renewal
      await this.rollbackRenewalItems(updatedSubscriptions, createdSubscriptions, actions);

      actions.push({
        type: 'error' as BillingAction['type'],
        description: 'Error during renewal processing',
        details: { error: String(error), opportunity_id: opportunity.id },
        requires_review: true,
        risk_level: 'high',
        notes: ['Processing halted, rollback attempted'],
      });
    }

    return actions;
  }

  /**
   * Rollback helper for renewal items
   */
  private async rollbackRenewalItems(
    updatedSubscriptions: UpdatedSubscription[], 
    createdSubscriptions: CreatedSubscription[], 
    actions: BillingAction[]
  ): Promise<void> {
    // Rollback updated subscriptions to original state
    for (const { subscription, original } of updatedSubscriptions) {
      try {
        await this.recurlyClient.updateSubscription(subscription.uuid, {
          plan_code: original.plan_code,
          new_unit_amount_in_cents: original.unit_amount_in_cents,
          new_quantity: original.quantity,
        });
        actions.push({
          type: 'update_subscription',
          description: `Rollback: Restore subscription ${subscription.plan_code} to original state`,
          details: { subscription_id: subscription.uuid, restored_to: original },
          requires_review: true,
          risk_level: 'high',
          notes: ['Rollback due to error during renewal processing'],
        });
      } catch (rollbackError) {
        actions.push({
          type: 'update_subscription',
          description: `Rollback failed: Could not restore subscription ${subscription.plan_code}`,
          details: { subscription_id: subscription.uuid },
          requires_review: true,
          risk_level: 'high',
          notes: ['Rollback failed', String(rollbackError)],
        });
      }
    }

    // Rollback created subscriptions
    for (const sub of createdSubscriptions) {
      try {
        await this.recurlyClient.cancelSubscription(sub.uuid);
        actions.push({
          type: 'cancel_subscription',
          description: `Rollback: Cancel subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: 'high',
          notes: ['Rollback due to error during renewal processing'],
        });
      } catch (rollbackError) {
        actions.push({
          type: 'cancel_subscription',
          description: `Rollback failed: Could not cancel subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: 'high',
          notes: ['Rollback failed', String(rollbackError)],
        });
      }
    }
  }

  /**
   * Generate actions for insertion order opportunities with error handling and rollback
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

    const createdCharges: CreatedCharge[] = [];
    const createdSubscriptions: CreatedSubscription[] = [];
    const createdInvoices: CreatedInvoice[] = [];

    try {
      // Handle outstanding invoices first
      if (opportunity.outstanding_invoices?.has_outstanding) {
        const invoiceAction: CreatedInvoice = {
          type: 'create_invoice',
          description: `Process outstanding invoices: $${opportunity.outstanding_invoices.total_outstanding}`,
          details: {
            invoice_ids: opportunity.outstanding_invoices.invoice_ids,
            total_amount: opportunity.outstanding_invoices.total_outstanding,
          },
          amount_in_cents: (opportunity.outstanding_invoices?.total_outstanding || 0) * 100,
        };
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
        createdInvoices.push(invoiceAction);
      }

      for (const item of opportunity.line_items) {
        try {
          if (item.billing_period === 'one_time') {
            const riskLevel = this.calculateRiskLevel(item.total_price);
            const chargeAction: CreatedCharge = {
              type: 'charge_one_time',
              description: `One-time charge: ${item.product_name}`,
              details: {
                product_code: item.product_code,
                amount_in_cents: item.total_price * 100,
                immediate_invoice: item.immediate_invoice || false,
              },
              amount_in_cents: item.total_price * 100,
            };
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
            createdCharges.push(chargeAction);
          } else if (item.proration_needed) {
            const prorationAmount = this.calculateAdvancedProration(
              item,
              opportunity.contract_start_date,
              opportunity.contract_end_date,
              opportunity.billing_frequency
            );
            const prorationAction: CreatedCharge = {
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
            };
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
            createdCharges.push(prorationAction);
          } else {
            // Simulate subscription creation
            const subscriptionResponse = await this.recurlyClient.createSubscription(opportunity.account_id, {
              plan_code: item.product_code,
              unit_amount_in_cents: item.unit_price * 100,
              quantity: item.quantity,
              billing_period: item.billing_period,
              item_classification: item.item_classification,
            });
            const createdSub: CreatedSubscription = {
              uuid: subscriptionResponse.uuid,
              plan_code: subscriptionResponse.plan_code,
              unit_amount_in_cents: subscriptionResponse.unit_amount_in_cents,
              quantity: subscriptionResponse.quantity,
            };
            createdSubscriptions.push(createdSub);
            
            actions.push({
              type: 'create_subscription',
              description: `Add subscription: ${item.product_name}`,
              details: subscriptionResponse,
              amount_in_cents: item.total_price * 100,
              effective_date: opportunity.contract_start_date,
              requires_review: false,
              risk_level: 'low',
            });
          }
        } catch (itemError) {
          // Rollback previous items in this iteration
          await this.rollbackInsertionOrderItems(createdSubscriptions, createdCharges, createdInvoices, actions);
          throw itemError;
        }
      }
    } catch (error) {
      // Main rollback logic
      await this.rollbackInsertionOrderItems(createdSubscriptions, createdCharges, createdInvoices, actions);

      actions.push({
        type: 'error' as BillingAction['type'],
        description: 'Error during insertion order processing',
        details: { error: String(error), opportunity_id: opportunity.id },
        requires_review: true,
        risk_level: 'high',
        notes: ['Processing halted, rollback attempted'],
      });
    }

    return actions;
  }

  /**
   * Rollback helper for insertion order items
   */
  private async rollbackInsertionOrderItems(
    createdSubscriptions: CreatedSubscription[], 
    createdCharges: CreatedCharge[], 
    createdInvoices: CreatedInvoice[], 
    actions: BillingAction[]
  ): Promise<void> {
    // Rollback subscriptions
    for (const sub of createdSubscriptions) {
      try {
        await this.recurlyClient.cancelSubscription(sub.uuid);
        actions.push({
          type: 'cancel_subscription',
          description: `Rollback: Cancel subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: 'high',
          notes: ['Rollback due to error during insertion order processing'],
        });
      } catch (rollbackError) {
        actions.push({
          type: 'cancel_subscription',
          description: `Rollback failed: Could not cancel subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: 'high',
          notes: ['Rollback failed', String(rollbackError)],
        });
      }
    }

    // Note: Charges and invoices typically cannot be rolled back
    if (createdCharges.length > 0 || createdInvoices.length > 0) {
      actions.push({
        type: 'error' as BillingAction['type'],
        description: 'Charges and invoices cannot be automatically rolled back',
        details: { 
          charges: createdCharges.map(c => c.details),
          invoices: createdInvoices.map(i => i.details)
        },
        requires_review: true,
        risk_level: 'high',
        notes: ['Manual intervention required for charge/invoice reversals'],
      });
    }
  }

  /**
   * Generate actions for self-service conversion opportunities with error handling and rollback
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

    const cancelledSubscriptions: CancelledSubscription[] = [];
    const createdSubscriptions: CreatedSubscription[] = [];
    const appliedCredits: AppliedCredit[] = [];
    const originalStates: Map<string, { state: string; plan_code: string; unit_amount_in_cents: number; quantity: number }> = new Map();

    try {
      // Cancel existing self-service subscriptions
      for (const subscription of recurlyState.subscriptions) {
        if (subscription.state === 'active') {
          // Store original state for potential rollback
          originalStates.set(subscription.uuid, {
            state: subscription.state,
            plan_code: subscription.plan_code,
            unit_amount_in_cents: subscription.unit_amount_in_cents,
            quantity: subscription.quantity,
          });

          await this.recurlyClient.cancelSubscription(subscription.uuid);
          const cancelledSub: CreatedSubscription = {
            uuid: subscription.uuid,
            plan_code: subscription.plan_code,
            unit_amount_in_cents: subscription.unit_amount_in_cents,
            quantity: subscription.quantity,
          };
          cancelledSubscriptions.push({ 
            subscription: cancelledSub, 
            original: originalStates.get(subscription.uuid)! 
          });
          
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
        const creditAction: AppliedCredit = {
          type: 'apply_credit',
          description: `Apply credit for unused self-service period`,
          details: {
            credit_amount_in_cents: opportunity.billing_transition.credit_amount_due * 100,
            description: opportunity.billing_transition.credit_calculation,
            credit_reason: 'Self-service to enterprise conversion',
          },
          amount_in_cents: opportunity.billing_transition.credit_amount_due * 100,
        };
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
        appliedCredits.push(creditAction);
      }

      // Create new enterprise subscriptions
      for (const item of opportunity.line_items) {
        const subscriptionResponse = await this.recurlyClient.createSubscription(opportunity.account_id, {
          plan_code: item.product_code,
          unit_amount_in_cents: item.unit_price * 100,
          quantity: item.quantity,
          collection_method: 'manual', // Switch to invoicing
          net_terms: 30,
          replaces_self_service: item.replaces_self_service || false,
        });
        const createdSub: CreatedSubscription = {
          uuid: subscriptionResponse.uuid,
          plan_code: subscriptionResponse.plan_code,
          unit_amount_in_cents: subscriptionResponse.unit_amount_in_cents,
          quantity: subscriptionResponse.quantity,
        };
        createdSubscriptions.push(createdSub);
        
        actions.push({
          type: 'create_subscription',
          description: `Create enterprise subscription: ${item.product_name}`,
          details: subscriptionResponse,
          amount_in_cents: item.total_price * 100,
          effective_date: opportunity.contract_start_date,
          requires_review: false,
          risk_level: 'low',
        });
      }
    } catch (error) {
      // Rollback logic for conversion
      await this.rollbackConversionItems(cancelledSubscriptions, createdSubscriptions, appliedCredits, actions);

      actions.push({
        type: 'error' as BillingAction['type'],
        description: 'Error during conversion processing',
        details: { error: String(error), opportunity_id: opportunity.id },
        requires_review: true,
        risk_level: 'high',
        notes: ['Processing halted, rollback attempted'],
      });
    }

    return actions;
  }

  /**
   * Rollback helper for conversion items
   */
  private async rollbackConversionItems(
    cancelledSubscriptions: CancelledSubscription[], 
    createdSubscriptions: CreatedSubscription[], 
    appliedCredits: AppliedCredit[], 
    actions: BillingAction[]
  ): Promise<void> {
    // Rollback created subscriptions
    for (const sub of createdSubscriptions) {
      try {
        await this.recurlyClient.cancelSubscription(sub.uuid);
        actions.push({
          type: 'cancel_subscription',
          description: `Rollback: Cancel enterprise subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: 'high',
          notes: ['Rollback due to error during conversion processing'],
        });
      } catch (rollbackError) {
        actions.push({
          type: 'cancel_subscription',
          description: `Rollback failed: Could not cancel enterprise subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: 'high',
          notes: ['Rollback failed', String(rollbackError)],
        });
      }
    }

    // Note: Cancelled subscriptions and applied credits typically cannot be easily rolled back
    if (cancelledSubscriptions.length > 0 || appliedCredits.length > 0) {
      actions.push({
        type: 'error' as BillingAction['type'],
        description: 'Cancelled subscriptions and applied credits require manual rollback',
        details: { 
          cancelled_subscriptions: cancelledSubscriptions.map(c => c.subscription.plan_code),
          applied_credits: appliedCredits.map(c => c.details)
        },
        requires_review: true,
        risk_level: 'high',
        notes: ['Manual intervention required to restore cancelled subscriptions and reverse credits'],
      });
    }
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