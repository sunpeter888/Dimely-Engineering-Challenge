import { Opportunity, BillingAction, ReviewSheet } from '../types';

export class OutputGenerator {
  /**
   * Generate a review sheet for ops team approval
   */
  generateReviewSheet(opportunity: Opportunity, billingActions: BillingAction[]): ReviewSheet {
    const highRiskActions = billingActions.filter(action => action.risk_level === 'high');
    const totalImpact = billingActions.reduce((sum, action) => {
      return sum + (action.amount_in_cents || 0);
    }, 0);

    const warnings = this.generateWarnings(opportunity, billingActions);
    const summary = this.generateSummary(opportunity, billingActions);

    return {
      opportunity_id: opportunity.id,
      opportunity_name: opportunity.opportunity_name,
      account_name: opportunity.account_name,
      total_actions: billingActions.length,
      high_risk_actions: highRiskActions.length,
      estimated_total_impact: totalImpact / 100, // Convert to dollars
      billing_actions: billingActions,
      summary,
      warnings,
      manual_review_required: this.requiresManualReview(billingActions),
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Generate a human-readable summary
   */
  private generateSummary(opportunity: Opportunity, billingActions: BillingAction[]): string {
    const actionTypes = this.groupActionsByType(billingActions);
    const summaryParts: string[] = [];

    summaryParts.push(`${opportunity.type.replace('_', ' ').toUpperCase()} opportunity for ${opportunity.account_name}`);
    summaryParts.push(`Contract period: ${opportunity.contract_start_date} to ${opportunity.contract_end_date}`);
    summaryParts.push(`Total contract value: $${opportunity.amount.toLocaleString()}`);
    
    // Summarize actions by type
    Object.entries(actionTypes).forEach(([type, actions]) => {
      const count = actions.length;
      const typeLabel = this.getActionTypeLabel(type);
      summaryParts.push(`${count} ${typeLabel}${count > 1 ? 's' : ''}`);
    });

    const highRiskCount = billingActions.filter(a => a.risk_level === 'high').length;
    if (highRiskCount > 0) {
      summaryParts.push(`⚠️  ${highRiskCount} high-risk action${highRiskCount > 1 ? 's' : ''} require careful review`);
    }

    return summaryParts.join('\n');
  }

  /**
   * Generate warnings for potential issues
   */
  private generateWarnings(opportunity: Opportunity, billingActions: BillingAction[]): string[] {
    const warnings: string[] = [];

    // Check for high-value transactions
    const highValueActions = billingActions.filter(action => 
      action.amount_in_cents && action.amount_in_cents > 1000000 // $10,000+
    );
    if (highValueActions.length > 0) {
      warnings.push(`High-value transactions detected: ${highValueActions.length} actions over $10,000`);
    }

    // Check for proration complexity
    const prorationActions = billingActions.filter(action => action.type === 'prorate_charges');
    if (prorationActions.length > 0) {
      warnings.push(`Proration calculations present - verify dates and amounts carefully`);
    }

    // Check for subscription cancellations
    const cancellationActions = billingActions.filter(action => action.type === 'cancel_subscription');
    if (cancellationActions.length > 0) {
      warnings.push(`${cancellationActions.length} subscription cancellation${cancellationActions.length > 1 ? 's' : ''} - ensure no service interruption`);
    }

    // Check for credit applications
    const creditActions = billingActions.filter(action => action.type === 'apply_credit');
    if (creditActions.length > 0) {
      warnings.push(`Credit applications require verification of calculation accuracy`);
    }

    // Check for missing Recurly account on non-new-business
    const errorActions = billingActions.filter(action => 
      action.description.includes('ERROR') || action.risk_level === 'high'
    );
    if (errorActions.length > 0) {
      warnings.push(`${errorActions.length} action${errorActions.length > 1 ? 's' : ''} require manual intervention`);
    }

    // Check for timing issues
    const now = new Date();
    const startDate = new Date(opportunity.contract_start_date);
    if (startDate < now) {
      warnings.push(`Contract start date is in the past - may require backdating or immediate execution`);
    }

    // Check for payment term changes
    if (opportunity.type === 'self_service_conversion') {
      warnings.push(`Payment method transition from credit card to invoicing - verify customer setup`);
    }

    return warnings;
  }

  /**
   * Determine if manual review is required
   */
  private requiresManualReview(billingActions: BillingAction[]): boolean {
    return billingActions.some(action => 
      action.requires_review || 
      action.risk_level === 'high' ||
      action.description.includes('ERROR')
    );
  }

  /**
   * Group actions by type for summary
   */
  private groupActionsByType(actions: BillingAction[]): Record<string, BillingAction[]> {
    return actions.reduce((groups, action) => {
      const type = action.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(action);
      return groups;
    }, {} as Record<string, BillingAction[]>);
  }

  /**
   * Get human-readable label for action type
   */
  private getActionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'create_account': 'Account Creation',
      'update_account': 'Account Update',
      'create_subscription': 'Subscription Creation',
      'update_subscription': 'Subscription Update',
      'cancel_subscription': 'Subscription Cancellation',
      'create_invoice': 'Invoice Creation',
      'apply_credit': 'Credit Application',
      'charge_one_time': 'One-time Charge',
      'prorate_charges': 'Proration Calculation',
    };
    return labels[type] || type.replace('_', ' ');
  }

  /**
   * Export review sheet as CSV for spreadsheet import
   */
  generateCSV(reviewSheet: ReviewSheet): string {
    const headers = [
      'Action Type',
      'Description',
      'Amount (USD)',
      'Effective Date',
      'Risk Level',
      'Requires Review',
      'Notes'
    ];

    const rows = reviewSheet.billing_actions.map(action => [
      action.type,
      action.description,
      action.amount_in_cents ? (action.amount_in_cents / 100).toString() : '0',
      action.effective_date || '',
      action.risk_level,
      action.requires_review ? 'YES' : 'NO',
      action.notes?.join('; ') || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Generate a simple text summary for quick review
   */
  generateTextSummary(reviewSheet: ReviewSheet): string {
    const lines: string[] = [];
    
    lines.push(`DIMELY REVIEW SHEET`);
    lines.push(`================`);
    lines.push(`Opportunity: ${reviewSheet.opportunity_name}`);
    lines.push(`Account: ${reviewSheet.account_name}`);
    lines.push(`Generated: ${new Date(reviewSheet.generated_at).toLocaleString()}`);
    lines.push('');
    
    lines.push(`SUMMARY:`);
    lines.push(reviewSheet.summary);
    lines.push('');
    
    if (reviewSheet.warnings.length > 0) {
      lines.push(`WARNINGS:`);
      reviewSheet.warnings.forEach(warning => {
        lines.push(`⚠️  ${warning}`);
      });
      lines.push('');
    }
    
    lines.push(`BILLING ACTIONS (${reviewSheet.total_actions}):`);
    lines.push('--------------------------------');
    
    reviewSheet.billing_actions.forEach((action, index) => {
      lines.push(`${index + 1}. ${action.description}`);
      lines.push(`   Type: ${action.type}`);
      if (action.amount_in_cents) {
        lines.push(`   Amount: $${(action.amount_in_cents / 100).toLocaleString()}`);
      }
      if (action.effective_date) {
        lines.push(`   Effective: ${action.effective_date}`);
      }
      lines.push(`   Risk: ${action.risk_level.toUpperCase()}`);
      lines.push(`   Review Required: ${action.requires_review ? 'YES' : 'NO'}`);
      if (action.notes && action.notes.length > 0) {
        lines.push(`   Notes: ${action.notes.join(', ')}`);
      }
      lines.push('');
    });
    
    lines.push(`TOTALS:`);
    lines.push(`- Total Actions: ${reviewSheet.total_actions}`);
    lines.push(`- High Risk Actions: ${reviewSheet.high_risk_actions}`);
    lines.push(`- Estimated Impact: $${reviewSheet.estimated_total_impact.toLocaleString()}`);
    lines.push(`- Manual Review Required: ${reviewSheet.manual_review_required ? 'YES' : 'NO'}`);
    
    return lines.join('\n');
  }
} 