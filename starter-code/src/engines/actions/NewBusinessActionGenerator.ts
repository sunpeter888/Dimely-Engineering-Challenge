import { RecurlyClient } from "../../clients/RecurlyClient";
import {
  Opportunity,
  BillingAction,
  CreatedAccount,
  CreatedSubscription,
  CreatedCharge,
} from "../../types";
import { RiskCalculator } from "../validation/RiskCalculator";

export class NewBusinessActionGenerator {
  constructor(
    private recurlyClient: RecurlyClient,
    private riskCalculator: RiskCalculator
  ) {}

  async generateActions(opportunity: Opportunity): Promise<BillingAction[]> {
    const actions: BillingAction[] = [];
    let createdAccount: CreatedAccount | null = null;
    const createdSubscriptions: CreatedSubscription[] = [];
    const createdCharges: CreatedCharge[] = [];

    try {
      // Create new account
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
        type: "create_account",
        description: `Create new Recurly account for ${opportunity.account_name}`,
        details: accountResponse,
        requires_review: false,
        risk_level: "low",
      });

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
            actions
          );
          throw itemError;
        }
      }
    } catch (error) {
      await this.rollbackItems(createdSubscriptions, createdCharges, actions);
      this.handleError(error, opportunity, createdAccount, actions);
    }

    return actions;
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
        description: item.description,
        quantity: item.quantity,
      },
      amount_in_cents: item.total_price * 100,
      effective_date: opportunity.contract_start_date,
      requires_review: item.total_price > 1000,
      risk_level: riskLevel,
      notes:
        item.total_price > 5000 ? ["High-value one-time charge"] : undefined,
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
        start_date: opportunity.contract_start_date,
        end_date: opportunity.contract_end_date,
      }
    );

    return {
      type: "create_subscription",
      description: `Create subscription: ${item.product_name} (${item.billing_period})`,
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
          notes: ["Rollback due to error during new business processing"],
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

    // Note: One-time charges typically cannot be rolled back once processed
    if (createdCharges.length > 0) {
      actions.push({
        type: "error" as BillingAction["type"],
        description: "One-time charges cannot be rolled back",
        details: { charges: createdCharges.map((c) => c.details) },
        requires_review: true,
        risk_level: "high",
        notes: ["Manual intervention required for charge reversals"],
      });
    }
  }

  private handleError(
    error: any,
    opportunity: Opportunity,
    createdAccount: CreatedAccount | null,
    actions: BillingAction[]
  ): void {
    if (createdAccount) {
      actions.push({
        type: "error" as BillingAction["type"],
        description: `Account ${createdAccount.account_code} created but processing failed`,
        details: { account_code: createdAccount.account_code },
        requires_review: true,
        risk_level: "high",
        notes: [
          "Manual intervention required to close/delete account",
          "Rollback due to error during new business processing",
        ],
      });
    }

    actions.push({
      type: "error" as BillingAction["type"],
      description: "Error during new business processing",
      details: { error: String(error), opportunity_id: opportunity.id },
      requires_review: true,
      risk_level: "high",
      notes: ["Processing halted, rollback attempted"],
    });
  }
}
