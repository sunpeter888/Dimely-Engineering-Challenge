import { Opportunity, RecurlyState, BillingAction } from '../types';
import { RecurlyClient } from '../clients/RecurlyClient';

export class BillingEngine {
  constructor(private recurlyClient: RecurlyClient) {}

  async generateActions(opportunity: Opportunity, recurlyState: RecurlyState | null): Promise<BillingAction[]> {
    throw new Error('Not implemented');
  }
} 