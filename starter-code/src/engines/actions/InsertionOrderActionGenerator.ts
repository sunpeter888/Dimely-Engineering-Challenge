import { RecurlyClient } from "../../clients/RecurlyClient";
import {
  Opportunity,
  RecurlyState,
  BillingAction,
  CreatedSubscription,
  CreatedCharge,
  CreatedInvoice,
} from "../../types";
import { RiskCalculator } from "../validation/RiskCalculator";
import { ProrationEngine } from "../proration/ProrationEngine";

export class InsertionOrderActionGenerator {
  constructor(
    private recurlyClient: RecurlyClient,
    private riskCalculator: RiskCalculator,
    private prorationEngine: ProrationEngine
  ) {}

  async generateActions(
    opportunity: Opportunity,
    recurlyState: RecurlyState | null
  ): Promise<BillingAction[]> {
    const actions: BillingAction[] = [];

    if (!recurlyState) {
      actions.push({
        type: "create_account",
        description: `ERROR: Insertion order opportunity but no existing Recurly account found`,
        details: {},
        requires_review: true,
        risk_level: "high",
        notes: [
          "Manual intervention required - account should exist for insertion order",
        ],
      });
      return actions;
    }

    const createdCharges: CreatedCharge[] = [];
    const createdSubscriptions: CreatedSubscription[] = [];
    const createdInvoices: CreatedInvoice[] = [];

    try {
      // Handle outstanding invoices first
      if (opportunity.outstanding_invoices?.has_outstanding) {
        const invoiceAction = this.createOutstandingInvoiceAction(opportunity);
        actions.push(invoiceAction);
        createdInvoices.push({
          type: "create_invoice",
          description: invoiceAction.description,
          details: invoiceAction.details,
          amount_in_cents: invoiceAction.amount_in_cents!,
        });
      }

      // Handle line items
      for (const item of opportunity.line_items) {
        try {
          if (item.billing_period === "one_time") {
            const action = this.createOneTimeChargeAction(item, opportunity);
            actions.push(action);
            createdCharges.push({
              type: "charge_one_time",
              description: action.description,
              details: action.details,
              amount_in_cents: action.amount_in_cents!,
            });
          } else if (item.proration_needed) {
            const action = this.createProrationAction(item, opportunity);
            actions.push(action);
            createdCharges.push({
              type: "prorate_charges",
              description: action.description,
              details: action.details,
              amount_in_cents: action.amount_in_cents!,
            });
          } else {
            const action = await this.createSubscriptionAction(
              item,
              opportunity
            );
            actions.push(action);
            createdSubscriptions.push({
              uuid: action.details.uuid,
              plan_code: action.details.plan_code,
              unit_amount_in_cents: action.details.unit_amount_in_cents,
              quantity: action.details.quantity,
            });
          }
        } catch (itemError) {
          await this.rollbackItems(
            createdSubscriptions,
            createdCharges,
            createdInvoices,
            actions
          );
          throw itemError;
        }
      }
    } catch (error) {
      await this.rollbackItems(
        createdSubscriptions,
        createdCharges,
        createdInvoices,
        actions
      );
      this.handleError(error, opportunity, actions);
    }

    return actions;
  }

  private createOutstandingInvoiceAction(
    opportunity: Opportunity
  ): BillingAction {
    return {
      type: "create_invoice",
      description: `Process outstanding invoices: $${opportunity.outstanding_invoices?.total_outstanding}`,
      details: {
        invoice_ids: opportunity.outstanding_invoices?.invoice_ids,
        total_amount: opportunity.outstanding_invoices?.total_outstanding,
      },
      amount_in_cents:
        (opportunity.outstanding_invoices?.total_outstanding || 0) * 100,
      requires_review: true,
      risk_level: "medium",
      notes: ["Outstanding invoices must be processed before new charges"],
    };
  }

  private createOneTimeChargeAction(
    item: any,
    opportunity: Opportunity
  ): BillingAction {
    const riskLevel = this.riskCalculator.calculateRiskLevel(item.total_price);
    return {
      type: "charge_one_time",
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
      notes: item.immediate_invoice
        ? ["Immediate invoicing required"]
        : undefined,
    };
  }

  private createProrationAction(
    item: any,
    opportunity: Opportunity
  ): BillingAction {
    const prorationResult = this.prorationEngine.calculateProration(
      item,
      opportunity.contract_start_date,
      opportunity.contract_end_date,
      opportunity.billing_frequency,
      opportunity.proration_details
    );

    return {
      type: "prorate_charges",
      description: `Prorate charges for: ${item.product_name}`,
      details: {
        product_code: item.product_code,
        monthly_amount: item.unit_price * 100,
        months_remaining: item.months_remaining || 0,
        proration_date: opportunity.contract_start_date,
        proration_amount: prorationResult.amountInCents,
        item_classification: item.item_classification,
        affects_base_subscription: item.affects_base_subscription,
        calculation_method: prorationResult.calculationMethod,
        days_calculated: prorationResult.daysCalculated,
      },
      amount_in_cents: prorationResult.amountInCents,
      effective_date: opportunity.contract_start_date,
      requires_review: true,
      risk_level: "medium",
      notes: [
        "Proration calculation - verify dates and amounts",
        `Classification: ${item.item_classification || "unknown"}`,
        ...prorationResult.notes,
      ],
    };
  }

  private async createSubscriptionAction(
    item: any,
    opportunity: Opportunity
  ): Promise<BillingAction> {
    const subscriptionResponse = await this.recurlyClient.createSubscription(
      opportunity.account_id,
      {
        plan_code: item.product_code,
        unit_amount_in_cents: item.unit_price * 100,
        quantity: item.quantity,
        billing_period: item.billing_period,
        item_classification: item.item_classification,
      }
    );

    return {
      type: "create_subscription",
      description: `Add subscription: ${item.product_name}`,
      details: subscriptionResponse,
      amount_in_cents: item.total_price * 100,
      effective_date: opportunity.contract_start_date,
      requires_review: false,
      risk_level: "low",
    };
  }

  private async rollbackItems(
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
          type: "cancel_subscription",
          description: `Rollback: Cancel subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: "high",
          notes: ["Rollback due to error during insertion order processing"],
        });
      } catch (rollbackError) {
        actions.push({
          type: "cancel_subscription",
          description: `Rollback failed: Could not cancel subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: "high",
          notes: ["Rollback failed", String(rollbackError)],
        });
      }
    }

    // Note: Charges and invoices typically cannot be rolled back
    if (createdCharges.length > 0 || createdInvoices.length > 0) {
      actions.push({
        type: "error" as BillingAction["type"],
        description: "Charges and invoices cannot be automatically rolled back",
        details: {
          charges: createdCharges.map((c) => c.details),
          invoices: createdInvoices.map((i) => i.details),
        },
        requires_review: true,
        risk_level: "high",
        notes: ["Manual intervention required for charge/invoice reversals"],
      });
    }
  }

  private handleError(
    error: any,
    opportunity: Opportunity,
    actions: BillingAction[]
  ): void {
    actions.push({
      type: "error" as BillingAction["type"],
      description: "Error during insertion order processing",
      details: { error: String(error), opportunity_id: opportunity.id },
      requires_review: true,
      risk_level: "high",
      notes: ["Processing halted, rollback attempted"],
    });
  }
}
