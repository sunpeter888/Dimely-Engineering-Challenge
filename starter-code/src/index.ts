import { OpportunityParser } from './parsers/OpportunityParser';
import { RecurlyClient } from './clients/RecurlyClient';
import { BillingEngine } from './engines/BillingEngine';
import { OutputGenerator } from './generators/OutputGenerator';
import { ProcessingResult } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Main Dimely application class
 */
export class Dimely {
  private parser: OpportunityParser;
  private recurlyClient: RecurlyClient;
  private billingEngine: BillingEngine;
  private outputGenerator: OutputGenerator;

  constructor() {
    this.parser = new OpportunityParser();
    this.recurlyClient = new RecurlyClient({
      apiKey: process.env.RECURLY_API_KEY || 'mock-api-key',
      baseUrl: process.env.RECURLY_BASE_URL || 'https://api.recurly.com/v2',
      useMockData: process.env.NODE_ENV !== 'production',
      mockDataPath: path.join(__dirname, '../mock-apis'),
    });
    this.billingEngine = new BillingEngine(this.recurlyClient);
    this.outputGenerator = new OutputGenerator();
  }

  /**
   * Process an opportunity and generate billing instructions
   */
  async processOpportunity(opportunityData: unknown): Promise<ProcessingResult> {
    console.log('🚀 Processing opportunity...');
    
    try {
      // 1. Parse and validate opportunity
      const { opportunity, errors } = this.parser.parse(opportunityData);
      
      if (errors.length > 0) {
        console.error('❌ Opportunity validation failed:', errors);
        return {
          success: false,
          errors,
        };
      }

      if (!opportunity) {
        return {
          success: false,
          errors: [{ field: 'root', message: 'Failed to parse opportunity' }],
        };
      }

      console.log(`✅ Parsed ${opportunity.type} opportunity: ${opportunity.opportunity_name}`);

      // 2. Get current Recurly state (if applicable)
      let recurlyState = null;
      if (opportunity.recurly_account_code) {
        console.log(`🔍 Fetching Recurly state for account: ${opportunity.recurly_account_code}`);
        recurlyState = await this.recurlyClient.getAccountState(opportunity.recurly_account_code);
        
        if (!recurlyState) {
          console.warn(`⚠️  No Recurly account found for: ${opportunity.recurly_account_code}`);
        }
      }

      // 3. Generate billing actions
      console.log('⚙️  Determining billing actions...');
      const billingActions = await this.billingEngine.generateActions(opportunity, recurlyState);
      
      // 4. Create review sheet
      console.log('📋 Generating review sheet...');
      const reviewSheet = this.outputGenerator.generateReviewSheet(opportunity, billingActions);
      
      console.log(`✅ Generated ${billingActions.length} billing actions for review`);
      
      return {
        success: true,
        review_sheet: reviewSheet,
        warnings: [],
      };

    } catch (error) {
      console.error('💥 Error processing opportunity:', error);
      return {
        success: false,
        errors: [{
          field: 'root',
          message: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
      };
    }
  }

  /**
   * Process opportunity from file
   */
  async processOpportunityFromFile(filePath: string): Promise<ProcessingResult> {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return await this.processOpportunity(data);
    } catch (error) {
      return {
        success: false,
        errors: [{
          field: 'file',
          message: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
      };
    }
  }

  /**
   * Test connection to Recurly
   */
  async testConnection(): Promise<boolean> {
    return await this.recurlyClient.testConnection();
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: npm run dev <opportunity-file.json>');
    console.log('Example: npm run dev ../sample-data/new-business-simple.json');
    console.log('         npm run dev ../sample-data/new-business-opportunity.json');
    process.exit(1);
  }

  const opportunityFile = args[0];
  const dimely = new Dimely();

  console.log('🏁 Starting Dimely processing...');
  
  // Test connection first
  const connected = await dimely.testConnection();
  if (!connected) {
    console.error('❌ Failed to connect to Recurly API');
    process.exit(1);
  }

  // Process the opportunity
  const result = await dimely.processOpportunityFromFile(opportunityFile);
  
  if (result.success && result.review_sheet) {
    console.log('\n📊 Review Sheet Generated:');
    console.log(JSON.stringify(result.review_sheet, null, 2));
    
    // Save to file
    const outputPath = `output/review-sheet-${Date.now()}.json`;
    fs.mkdirSync('output', { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result.review_sheet, null, 2));
    console.log(`\n💾 Review sheet saved to: ${outputPath}`);
  } else {
    console.error('\n❌ Processing failed:');
    console.error(result.errors);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
} 