export type RiskLevel = "low" | "medium" | "high";

export interface RiskCalculationResult {
  riskLevel: RiskLevel;
  factors: string[];
  score: number;
}

export class RiskCalculator {
  private readonly RISK_THRESHOLDS = {
    LOW: 1000,
    MEDIUM: 5000,
  };

  /**
   * Calculate risk level based on amount
   */
  calculateRiskLevel(amount: number): RiskLevel {
    if (amount <= this.RISK_THRESHOLDS.LOW) return "low";
    if (amount <= this.RISK_THRESHOLDS.MEDIUM) return "medium";
    return "high";
  }

  /**
   * Calculate comprehensive risk assessment for an opportunity
   */
  calculateOpportunityRisk(opportunity: any): RiskCalculationResult {
    const factors: string[] = [];
    let score = 0;

    // Amount-based risk
    const amountRisk = this.calculateAmountRisk(opportunity.amount);
    score += amountRisk.score;
    factors.push(...amountRisk.factors);

    // Line item complexity risk
    const complexityRisk = this.calculateComplexityRisk(opportunity.line_items);
    score += complexityRisk.score;
    factors.push(...complexityRisk.factors);

    // Contract duration risk
    const durationRisk = this.calculateDurationRisk(
      opportunity.contract_start_date,
      opportunity.contract_end_date
    );
    score += durationRisk.score;
    factors.push(...durationRisk.factors);

    // Payment terms risk
    const paymentRisk = this.calculatePaymentTermsRisk(
      opportunity.payment_terms
    );
    score += paymentRisk.score;
    factors.push(...paymentRisk.factors);

    return {
      riskLevel: this.determineRiskLevel(score),
      factors,
      score,
    };
  }

  private calculateAmountRisk(amount: number): {
    score: number;
    factors: string[];
  } {
    const factors: string[] = [];
    let score = 0;

    if (amount > 100000) {
      score += 10;
      factors.push("Very high value opportunity (>$100k)");
    } else if (amount > 50000) {
      score += 7;
      factors.push("High value opportunity (>$50k)");
    } else if (amount > 10000) {
      score += 4;
      factors.push("Medium value opportunity (>$10k)");
    } else if (amount > 1000) {
      score += 2;
      factors.push("Low value opportunity (>$1k)");
    }

    return { score, factors };
  }

  private calculateComplexityRisk(lineItems: any[]): {
    score: number;
    factors: string[];
  } {
    const factors: string[] = [];
    let score = 0;

    if (lineItems.length > 10) {
      score += 8;
      factors.push("Very complex order (>10 line items)");
    } else if (lineItems.length > 5) {
      score += 5;
      factors.push("Complex order (>5 line items)");
    } else if (lineItems.length > 2) {
      score += 2;
      factors.push("Multiple line items");
    }

    // Check for one-time charges
    const oneTimeCharges = lineItems.filter(
      (item) => item.billing_period === "one_time"
    );
    if (oneTimeCharges.length > 0) {
      score += 3;
      factors.push("Contains one-time charges");
    }

    // Check for proration
    const prorationItems = lineItems.filter((item) => item.proration_needed);
    if (prorationItems.length > 0) {
      score += 4;
      factors.push("Contains proration calculations");
    }

    return { score, factors };
  }

  private calculateDurationRisk(
    startDate: string,
    endDate: string
  ): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationInDays = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (durationInDays > 365) {
      score += 6;
      factors.push("Long-term contract (>1 year)");
    } else if (durationInDays > 90) {
      score += 3;
      factors.push("Medium-term contract (>3 months)");
    } else if (durationInDays < 30) {
      score += 2;
      factors.push("Short-term contract (<1 month)");
    }

    return { score, factors };
  }

  private calculatePaymentTermsRisk(paymentTerms: string): {
    score: number;
    factors: string[];
  } {
    const factors: string[] = [];
    let score = 0;

    if (paymentTerms.includes("net_90") || paymentTerms.includes("net_120")) {
      score += 5;
      factors.push("Extended payment terms");
    } else if (paymentTerms.includes("net_60")) {
      score += 3;
      factors.push("Long payment terms");
    } else if (paymentTerms.includes("net_30")) {
      score += 1;
      factors.push("Standard payment terms");
    } else if (paymentTerms.includes("due_on_receipt")) {
      score += 0;
      factors.push("Immediate payment");
    }

    return { score, factors };
  }

  private determineRiskLevel(score: number): RiskLevel {
    if (score <= 10) return "low";
    if (score <= 20) return "medium";
    return "high";
  }

  /**
   * Calculate risk for specific action types
   */
  calculateActionRisk(actionType: string, details: any): RiskLevel {
    switch (actionType) {
      case "create_account":
        return "low";
      case "create_subscription":
        return details.amount_in_cents > 500000 ? "medium" : "low";
      case "update_subscription":
        return "medium";
      case "cancel_subscription":
        return "high";
      case "charge_one_time":
        return details.amount_in_cents > 100000 ? "high" : "medium";
      case "prorate_charges":
        return "medium";
      case "apply_credit":
        return "medium";
      case "create_invoice":
        return "medium";
      default:
        return "medium";
    }
  }
}
