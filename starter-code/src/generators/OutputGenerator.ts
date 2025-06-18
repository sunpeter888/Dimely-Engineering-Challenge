import { Opportunity, BillingAction, ReviewSheet } from '../types';

export class OutputGenerator {
  generateReviewSheet(opportunity: Opportunity, billingActions: BillingAction[]): ReviewSheet {
    throw new Error('Not implemented');
  }
} 