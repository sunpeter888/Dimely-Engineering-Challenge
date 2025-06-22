import { differenceInDays } from "date-fns";
import { LineItem, ProrationDetails } from "../../types";

export interface ProrationResult {
  amountInCents: number;
  calculationMethod: string;
  daysCalculated: number;
  billingFrequency: string;
  notes: string[];
}

export class ProrationEngine {
  private readonly MINIMUM_CHARGE = 100; // $1.00 minimum charge

  /**
   * Calculate proration with support for different billing frequencies
   * and proper date-based calculations
   */
  calculateProration(
    lineItem: LineItem,
    startDate: string,
    endDate: string,
    billingFrequency: string,
    prorationDetails?: ProrationDetails
  ): ProrationResult {
    // Validate dates
    const validation = this.validateDates(startDate, endDate);
    if (!validation.isValid) {
      return {
        amountInCents: 0,
        calculationMethod: "invalid_dates",
        daysCalculated: 0,
        billingFrequency,
        notes: [validation.error],
      };
    }

    const { effectiveStart, daysRemaining } = validation;
    const monthlyAmount = lineItem.unit_price * lineItem.quantity;

    // Calculate base proration
    let baseProration = this.calculateBaseProration(
      monthlyAmount,
      effectiveStart,
      new Date(endDate),
      daysRemaining,
      billingFrequency
    );

    // Apply business rules if proration details are provided
    if (prorationDetails) {
      baseProration = this.applyProrationBusinessRules(
        baseProration,
        lineItem,
        prorationDetails
      );
    }

    // Apply minimum charge rules
    baseProration = this.applyMinimumChargeRules(baseProration, lineItem);

    return {
      amountInCents: baseProration,
      calculationMethod: `${billingFrequency}_based`,
      daysCalculated: daysRemaining,
      billingFrequency,
      notes: this.generateProrationNotes(lineItem, billingFrequency),
    };
  }

  private validateDates(
    startDate: string,
    endDate: string
  ):
    | { isValid: false; error: string }
    | { isValid: true; effectiveStart: Date; daysRemaining: number } {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return {
        isValid: false,
        error: "Invalid dates provided for proration calculation",
      };
    }

    if (start >= end) {
      return {
        isValid: false,
        error: "Start date must be before end date for proration",
      };
    }

    const effectiveStart = start < now ? now : start;
    const daysRemaining = differenceInDays(end, effectiveStart);

    if (daysRemaining <= 0) {
      return {
        isValid: false,
        error: "No days remaining for proration",
      };
    }

    return {
      isValid: true,
      effectiveStart,
      daysRemaining,
    };
  }

  private calculateBaseProration(
    monthlyAmount: number,
    startDate: Date,
    endDate: Date,
    daysRemaining: number,
    billingFrequency: string
  ): number {
    switch (billingFrequency) {
      case "monthly":
        return this.calculateMonthlyProration(
          monthlyAmount,
          startDate,
          endDate,
          daysRemaining
        );
      case "quarterly":
        return this.calculateQuarterlyProration(
          monthlyAmount,
          startDate,
          endDate,
          daysRemaining
        );
      case "annually":
        return this.calculateAnnualProration(
          monthlyAmount,
          startDate,
          endDate,
          daysRemaining
        );
      default:
        return this.calculateMonthlyProration(
          monthlyAmount,
          startDate,
          endDate,
          daysRemaining
        );
    }
  }

  private calculateMonthlyProration(
    monthlyAmount: number,
    startDate: Date,
    endDate: Date,
    daysRemaining: number
  ): number {
    const year = startDate.getFullYear();
    const month = startDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dailyRate = monthlyAmount / daysInMonth;
    const prorationAmount = dailyRate * daysRemaining;
    return Math.round(prorationAmount * 100);
  }

  private calculateQuarterlyProration(
    monthlyAmount: number,
    startDate: Date,
    endDate: Date,
    daysRemaining: number
  ): number {
    const quarterlyAmount = monthlyAmount * 3;
    const quarterStart = new Date(
      startDate.getFullYear(),
      Math.floor(startDate.getMonth() / 3) * 3,
      1
    );
    const quarterEnd = new Date(
      quarterStart.getFullYear(),
      quarterStart.getMonth() + 3,
      0
    );
    const daysInQuarter = differenceInDays(quarterEnd, quarterStart) + 1;
    const dailyRate = quarterlyAmount / daysInQuarter;
    const prorationAmount = dailyRate * daysRemaining;
    return Math.round(prorationAmount * 100);
  }

  private calculateAnnualProration(
    monthlyAmount: number,
    startDate: Date,
    endDate: Date,
    daysRemaining: number
  ): number {
    const annualAmount = monthlyAmount * 12;
    const year = startDate.getFullYear();
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInYear = isLeapYear ? 366 : 365;
    const dailyRate = annualAmount / daysInYear;
    const prorationAmount = dailyRate * daysRemaining;
    return Math.round(prorationAmount * 100);
  }

  private applyProrationBusinessRules(
    baseProration: number,
    lineItem: LineItem,
    prorationDetails: ProrationDetails
  ): number {
    let adjustedProration = baseProration;

    // Handle immediate invoice scenarios
    if (prorationDetails.billing_scenarios?.immediate_invoice) {
      if (prorationDetails.upsell_start_date) {
        const upsellStart = new Date(prorationDetails.upsell_start_date);
        const now = new Date();
        if (upsellStart > now) {
          const daysUntilStart = differenceInDays(upsellStart, now);
          if (daysUntilStart > 0) {
            adjustedProration = Math.round(adjustedProration * 0.9); // 10% reduction for delayed start
          }
        }
      }
    }

    // Handle subscription updates
    if (prorationDetails.billing_scenarios?.subscription_update) {
      if (lineItem.previous_price && lineItem.previous_price > 0) {
        const priceDifference = lineItem.unit_price - lineItem.previous_price;
        if (priceDifference > 0) {
          const differenceRatio = priceDifference / lineItem.unit_price;
          adjustedProration = Math.round(adjustedProration * differenceRatio);
        }
      }
    }

    return adjustedProration;
  }

  private applyMinimumChargeRules(
    baseProration: number,
    lineItem: LineItem
  ): number {
    if (baseProration > 0 && baseProration < this.MINIMUM_CHARGE) {
      if (
        lineItem.item_classification === "subscription_consumption" ||
        lineItem.affects_base_subscription
      ) {
        return this.MINIMUM_CHARGE;
      }
      return 0;
    }
    return baseProration;
  }

  private generateProrationNotes(
    lineItem: LineItem,
    billingFrequency: string
  ): string[] {
    const notes = [`${billingFrequency} proration applied`];

    if (lineItem.item_classification) {
      notes.push(`Classification: ${lineItem.item_classification}`);
    }

    if (lineItem.affects_base_subscription) {
      notes.push("Affects base subscription");
    }

    return notes;
  }
}
