import { RecurlyClient } from "../../clients/RecurlyClient";
import { Opportunity, RecurlyState, BillingAction } from "../../types";
import { NewBusinessActionGenerator } from "./NewBusinessActionGenerator";
import { RenewalActionGenerator } from "./RenewalActionGenerator";
import { InsertionOrderActionGenerator } from "./InsertionOrderActionGenerator";
import { ConversionActionGenerator } from "./ConversionActionGenerator";
import { RiskCalculator } from "../validation/RiskCalculator";
import { ProrationEngine } from "../proration/ProrationEngine";

export class ActionFactory {
  private newBusinessGenerator: NewBusinessActionGenerator;
  private renewalGenerator: RenewalActionGenerator;
  private insertionOrderGenerator: InsertionOrderActionGenerator;
  private conversionGenerator: ConversionActionGenerator;

  constructor(
    private recurlyClient: RecurlyClient,
    private riskCalculator: RiskCalculator,
    private prorationEngine: ProrationEngine
  ) {
    this.newBusinessGenerator = new NewBusinessActionGenerator(
      recurlyClient,
      riskCalculator
    );
    this.renewalGenerator = new RenewalActionGenerator(
      recurlyClient,
      riskCalculator
    );
    this.insertionOrderGenerator = new InsertionOrderActionGenerator(
      recurlyClient,
      riskCalculator,
      prorationEngine
    );
    this.conversionGenerator = new ConversionActionGenerator(recurlyClient);
  }

  /**
   * Generate actions based on opportunity type
   */
  async generateActions(
    opportunity: Opportunity,
    recurlyState: RecurlyState | null
  ): Promise<BillingAction[]> {
    try {
      switch (opportunity.type) {
        case "new_business":
          return await this.newBusinessGenerator.generateActions(opportunity);
        case "renewal":
          return await this.renewalGenerator.generateActions(
            opportunity,
            recurlyState
          );
        case "insertion_order":
          return await this.insertionOrderGenerator.generateActions(
            opportunity,
            recurlyState
          );
        case "conversion_order":
          return await this.conversionGenerator.generateActions(
            opportunity,
            recurlyState
          );
        default:
          throw new Error(`Unsupported opportunity type: ${opportunity.type}`);
      }
    } catch (error) {
      return this.handleError(error, opportunity);
    }
  }

  private handleError(error: any, opportunity: Opportunity): BillingAction[] {
    return [
      {
        type: "error" as BillingAction["type"],
        description: `Critical error during ${opportunity.type} processing`,
        details: { error: String(error), opportunity_id: opportunity.id },
        requires_review: true,
        risk_level: "high",
        notes: ["Processing completely failed", "Manual intervention required"],
      },
    ];
  }

  /**
   * Get the appropriate action generator for an opportunity type
   */
  getActionGenerator(opportunityType: string) {
    switch (opportunityType) {
      case "new_business":
        return this.newBusinessGenerator;
      case "renewal":
        return this.renewalGenerator;
      case "insertion_order":
        return this.insertionOrderGenerator;
      case "conversion_order":
        return this.conversionGenerator;
      default:
        throw new Error(`Unsupported opportunity type: ${opportunityType}`);
    }
  }
}
