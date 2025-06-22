import { RecurlyClient } from "../clients/RecurlyClient";
import { Opportunity, RecurlyState, BillingAction } from "../types";
import { ActionFactory } from "./actions/ActionFactory";
import { RiskCalculator } from "./validation/RiskCalculator";
import { ProrationEngine } from "./proration/ProrationEngine";

export class BillingEngine {
  private actionFactory: ActionFactory;
  private riskCalculator: RiskCalculator;
  private prorationEngine: ProrationEngine;

  constructor(private recurlyClient: RecurlyClient) {
    this.riskCalculator = new RiskCalculator();
    this.prorationEngine = new ProrationEngine();
    this.actionFactory = new ActionFactory(
      this.recurlyClient,
      this.riskCalculator,
      this.prorationEngine
    );
  }

  /**
   * Generate billing actions based on opportunity and current Recurly state
   */
  async generateActions(
    opportunity: Opportunity,
    recurlyState: RecurlyState | null
  ): Promise<BillingAction[]> {
    try {
      // Validate opportunity
      this.validateOpportunity(opportunity);

      // Calculate overall opportunity risk
      const opportunityRisk =
        this.riskCalculator.calculateOpportunityRisk(opportunity);

      // Generate actions using the appropriate action generator
      const actions = await this.actionFactory.generateActions(
        opportunity,
        recurlyState
      );

      // Add opportunity-level risk information if high risk
      if (opportunityRisk.riskLevel === "high") {
        actions.unshift({
          type: "error" as BillingAction["type"],
          description: "High-risk opportunity detected",
          details: {
            risk_score: opportunityRisk.score,
            risk_factors: opportunityRisk.factors,
            opportunity_id: opportunity.id,
          },
          requires_review: true,
          risk_level: "high",
          notes: [
            "Opportunity requires special attention due to risk factors",
            `Risk score: ${opportunityRisk.score}`,
            ...opportunityRisk.factors,
          ],
        });
      }

      return actions;
    } catch (error) {
      return [
        {
          type: "error" as BillingAction["type"],
          description: `Critical error during ${opportunity.type} processing`,
          details: { error: String(error), opportunity_id: opportunity.id },
          requires_review: true,
          risk_level: "high",
          notes: [
            "Processing completely failed",
            "Manual intervention required",
          ],
        },
      ];
    }
  }

  /**
   * Validate opportunity data
   */
  private validateOpportunity(opportunity: Opportunity): void {
    if (!opportunity.id) {
      throw new Error("Opportunity ID is required");
    }

    if (!opportunity.type) {
      throw new Error("Opportunity type is required");
    }

    if (!opportunity.account_id) {
      throw new Error("Account ID is required");
    }

    if (!opportunity.contract_start_date || !opportunity.contract_end_date) {
      throw new Error("Contract start and end dates are required");
    }

    if (!opportunity.line_items || opportunity.line_items.length === 0) {
      throw new Error("At least one line item is required");
    }

    // Validate line items
    for (const item of opportunity.line_items) {
      if (!item.product_code || !item.product_name) {
        throw new Error(
          "Product code and name are required for all line items"
        );
      }

      if (item.unit_price <= 0) {
        throw new Error("Unit price must be greater than 0");
      }

      if (item.quantity <= 0) {
        throw new Error("Quantity must be greater than 0");
      }
    }

    // Validate dates
    const startDate = new Date(opportunity.contract_start_date);
    const endDate = new Date(opportunity.contract_end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error("Invalid contract dates");
    }

    if (startDate >= endDate) {
      throw new Error("Contract start date must be before end date");
    }
  }

  /**
   * Get risk calculator for external use
   */
  getRiskCalculator(): RiskCalculator {
    return this.riskCalculator;
  }

  /**
   * Get proration engine for external use
   */
  getProrationEngine(): ProrationEngine {
    return this.prorationEngine;
  }

  /**
   * Get action factory for external use
   */
  getActionFactory(): ActionFactory {
    return this.actionFactory;
  }
}
