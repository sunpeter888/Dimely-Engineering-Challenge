import { RecurlyClient } from "../../clients/RecurlyClient";
import {
  Opportunity,
  RecurlyState,
  BillingAction,
  CreatedSubscription,
  UpdatedSubscription,
} from "../../types";
import { RiskCalculator } from "../validation/RiskCalculator";

export class RenewalActionGenerator {
  constructor(
    private recurlyClient: RecurlyClient,
    private riskCalculator: RiskCalculator
  ) {}

  async generateActions(
    opportunity: Opportunity,
    recurlyState: RecurlyState | null
  ): Promise<BillingAction[]> {
    const actions: BillingAction[] = [];

    if (!recurlyState) {
      actions.push({
        type: "create_account",
        description: `ERROR: Renewal opportunity but no existing Recurly account found`,
        details: {},
        requires_review: true,
        risk_level: "high",
        notes: [
          "Manual intervention required - account should exist for renewal",
        ],
      });
      return actions;
    }

    const updatedSubscriptions: UpdatedSubscription[] = [];
    const createdSubscriptions: CreatedSubscription[] = [];
    const originalStates: Map<
      string,
      { unit_amount_in_cents: number; quantity: number; plan_code: string }
    > = new Map();

    try {
      for (const item of opportunity.line_items) {
        const existingSubscription = this.findMatchingSubscription(
          recurlyState,
          item
        );

        if (existingSubscription) {
          const action = await this.updateExistingSubscription(
            item,
            existingSubscription,
            opportunity,
            originalStates
          );
          actions.push(action);
          updatedSubscriptions.push({
            subscription: {
              uuid: action.details.uuid,
              plan_code: action.details.plan_code,
              unit_amount_in_cents: action.details.unit_amount_in_cents,
              quantity: action.details.quantity,
            },
            original: originalStates.get(existingSubscription.uuid)!,
          });
        } else {
          const action = await this.createNewSubscription(item, opportunity);
          actions.push(action);
          createdSubscriptions.push({
            uuid: action.details.uuid,
            plan_code: action.details.plan_code,
            unit_amount_in_cents: action.details.unit_amount_in_cents,
            quantity: action.details.quantity,
          });
        }
      }
    } catch (error) {
      await this.rollbackItems(
        updatedSubscriptions,
        createdSubscriptions,
        actions
      );
      this.handleError(error, opportunity, actions);
    }

    return actions;
  }

  private async updateExistingSubscription(
    item: any,
    existingSubscription: any,
    opportunity: Opportunity,
    originalStates: Map<string, any>
  ): Promise<BillingAction> {
    originalStates.set(existingSubscription.uuid, {
      unit_amount_in_cents: existingSubscription.unit_amount_in_cents,
      quantity: existingSubscription.quantity,
      plan_code: existingSubscription.plan_code,
    });

    const priceChange =
      item.unit_price - existingSubscription.unit_amount_in_cents / 100;
    const riskLevel = this.riskCalculator.calculateRiskLevel(
      Math.abs(priceChange)
    );

    const subscriptionResponse = await this.recurlyClient.updateSubscription(
      existingSubscription.uuid,
      {
        plan_code: item.product_code,
        new_unit_amount_in_cents: item.unit_price * 100,
        new_quantity: item.quantity,
      }
    );

    return {
      type: "update_subscription",
      description: `Update subscription: ${item.product_name}`,
      details: subscriptionResponse,
      amount_in_cents: item.total_price * 100,
      effective_date: opportunity.contract_start_date,
      requires_review: Math.abs(priceChange) > 100,
      risk_level: riskLevel,
      notes: item.price_change_reason ? [item.price_change_reason] : undefined,
    };
  }

  private async createNewSubscription(
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
      }
    );

    return {
      type: "create_subscription",
      description: `Create new subscription: ${item.product_name}`,
      details: subscriptionResponse,
      amount_in_cents: item.total_price * 100,
      effective_date: opportunity.contract_start_date,
      requires_review: true,
      risk_level: "medium",
      notes: ["New product added during renewal"],
    };
  }

  private async rollbackItems(
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
          type: "update_subscription",
          description: `Rollback: Restore subscription ${subscription.plan_code} to original state`,
          details: {
            subscription_id: subscription.uuid,
            restored_to: original,
          },
          requires_review: true,
          risk_level: "high",
          notes: ["Rollback due to error during renewal processing"],
        });
      } catch (rollbackError) {
        actions.push({
          type: "update_subscription",
          description: `Rollback failed: Could not restore subscription ${subscription.plan_code}`,
          details: { subscription_id: subscription.uuid },
          requires_review: true,
          risk_level: "high",
          notes: ["Rollback failed", String(rollbackError)],
        });
      }
    }

    // Rollback created subscriptions
    for (const sub of createdSubscriptions) {
      try {
        await this.recurlyClient.cancelSubscription(sub.uuid);
        actions.push({
          type: "cancel_subscription",
          description: `Rollback: Cancel subscription ${sub.plan_code}`,
          details: { subscription_id: sub.uuid },
          requires_review: true,
          risk_level: "high",
          notes: ["Rollback due to error during renewal processing"],
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
  }

  private handleError(
    error: any,
    opportunity: Opportunity,
    actions: BillingAction[]
  ): void {
    actions.push({
      type: "error" as BillingAction["type"],
      description: "Error during renewal processing",
      details: { error: String(error), opportunity_id: opportunity.id },
      requires_review: true,
      risk_level: "high",
      notes: ["Processing halted, rollback attempted"],
    });
  }

  private findMatchingSubscription(recurlyState: RecurlyState, lineItem: any) {
    return recurlyState.subscriptions.find(
      (sub) =>
        sub.plan_code === lineItem.product_code ||
        sub.plan_code.includes(lineItem.product_code) ||
        lineItem.product_code.includes(sub.plan_code)
    );
  }
}
