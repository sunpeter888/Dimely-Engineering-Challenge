import { RecurlyClient } from "../../clients/RecurlyClient";
import {
  Opportunity,
  RecurlyState,
  BillingAction,
  CreatedSubscription,
  CancelledSubscription,
  AppliedCredit,
} from "../../types";

export class ConversionActionGenerator {
  constructor(private recurlyClient: RecurlyClient) {}

  async generateActions(
    opportunity: Opportunity,
    recurlyState: RecurlyState | null
  ): Promise<BillingAction[]> {
    const actions: BillingAction[] = [];

    if (!recurlyState) {
      actions.push({
        type: "create_account",
        description: `ERROR: Conversion opportunity but no existing Recurly account found`,
        details: {},
        requires_review: true,
        risk_level: "high",
        notes: [
          "Manual intervention required - self-service account should exist",
        ],
      });
      return actions;
    }

    const cancelledSubscriptions: CancelledSubscription[] = [];
    const createdSubscriptions: CreatedSubscription[] = [];
    const appliedCredits: AppliedCredit[] = [];
    const originalStates: Map<
      string,
      {
        state: string;
        plan_code: string;
        unit_amount_in_cents: number;
        quantity: number;
      }
    > = new Map();

    try {
      // Cancel existing self-service subscriptions
      for (const subscription of recurlyState.subscriptions) {
        if (subscription.state === "active") {
          const action = await this.cancelSelfServiceSubscription(
            subscription,
            opportunity,
            originalStates
          );
          actions.push(action);
          cancelledSubscriptions.push({
            subscription: {
              uuid: subscription.uuid,
              plan_code: subscription.plan_code,
              unit_amount_in_cents: subscription.unit_amount_in_cents,
              quantity: subscription.quantity,
            },
            original: originalStates.get(subscription.uuid)!,
          });
        }
      }

      // Apply credit for unused self-service time
      if (opportunity.billing_transition?.credit_amount_due) {
        const action = this.createCreditAction(opportunity);
        actions.push(action);
        appliedCredits.push({
          type: "apply_credit",
          description: action.description,
          details: action.details,
          amount_in_cents: action.amount_in_cents!,
        });
      }

      // Create new enterprise subscriptions
      for (const item of opportunity.line_items) {
        const action = await this.createEnterpriseSubscription(
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
    } catch (error) {
      await this.rollbackItems(
        cancelledSubscriptions,
        createdSubscriptions,
        appliedCredits,
        actions
      );
      this.handleError(error, opportunity, actions);
    }

    return actions;
  }

  private async cancelSelfServiceSubscription(
    subscription: any,
    opportunity: Opportunity,
    originalStates: Map<string, any>
  ): Promise<BillingAction> {
    originalStates.set(subscription.uuid, {
      state: subscription.state,
      plan_code: subscription.plan_code,
      unit_amount_in_cents: subscription.unit_amount_in_cents,
      quantity: subscription.quantity,
    });

    await this.recurlyClient.cancelSubscription(subscription.uuid);

    return {
      type: "cancel_subscription",
      description: `Cancel self-service subscription: ${subscription.plan_code}`,
      details: {
        subscription_id: subscription.uuid,
        cancellation_date: opportunity.contract_start_date,
        current_amount: subscription.unit_amount_in_cents,
      },
      requires_review: false,
      risk_level: "medium",
      notes: ["Ensure no service interruption during transition"],
    };
  }

  private createCreditAction(opportunity: Opportunity): BillingAction {
    return {
      type: "apply_credit",
      description: `Apply credit for unused self-service period`,
      details: {
        credit_amount_in_cents:
          (opportunity.billing_transition?.credit_amount_due || 0) * 100,
        description: opportunity.billing_transition!.credit_calculation,
        credit_reason: "Self-service to enterprise conversion",
      },
      amount_in_cents:
        (opportunity.billing_transition?.credit_amount_due || 0) * 100,
      requires_review: true,
      risk_level: "medium",
      notes: ["Verify credit calculation is correct"],
    };
  }

  private async createEnterpriseSubscription(
    item: any,
    opportunity: Opportunity
  ): Promise<BillingAction> {
    const subscriptionResponse = await this.recurlyClient.createSubscription(
      opportunity.account_id,
      {
        plan_code: item.product_code,
        unit_amount_in_cents: item.unit_price * 100,
        quantity: item.quantity,
        collection_method: "manual", // Switch to invoicing
        net_terms: 30,
        replaces_self_service: item.replaces_self_service || false,
      }
    );

    return {
      type: "create_subscription",
      description: `Create enterprise subscription: ${item.product_name}`,
      details: subscriptionResponse,
      amount_in_cents: item.total_price * 100,
      effective_date: opportunity.contract_start_date,
      requires_review: false,
      risk_level: "low",
    };
  }

  private async rollbackItems(
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
          type: "cancel_subscription",
          description: `Rollback: Cancel enterprise subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: "high",
          notes: ["Rollback due to error during conversion processing"],
        });
      } catch (rollbackError) {
        actions.push({
          type: "cancel_subscription",
          description: `Rollback failed: Could not cancel enterprise subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: "high",
          notes: ["Rollback failed", String(rollbackError)],
        });
      }
    }

    // Note: Cancelled subscriptions and applied credits typically cannot be easily rolled back
    if (cancelledSubscriptions.length > 0 || appliedCredits.length > 0) {
      actions.push({
        type: "error" as BillingAction["type"],
        description:
          "Cancelled subscriptions and applied credits require manual rollback",
        details: {
          cancelled_subscriptions: cancelledSubscriptions.map(
            (c) => c.subscription.plan_code
          ),
          applied_credits: appliedCredits.map((c) => c.details),
        },
        requires_review: true,
        risk_level: "high",
        notes: [
          "Manual intervention required to restore cancelled subscriptions and reverse credits",
        ],
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
      description: "Error during conversion processing",
      details: { error: String(error), opportunity_id: opportunity.id },
      requires_review: true,
      risk_level: "high",
      notes: ["Processing halted, rollback attempted"],
    });
  }
}
