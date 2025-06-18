import axios, { AxiosInstance } from 'axios';
import { RecurlyState, RecurlyAccount, RecurlySubscription, RecurlyInvoice } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export interface RecurlyConfig {
  apiKey: string;
  baseUrl: string;
  useMockData?: boolean;
  mockDataPath?: string;
}

export class RecurlyClient {
  private client: AxiosInstance;
  private config: RecurlyConfig;

  constructor(config: RecurlyConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * Get complete billing state for an account
   */
  async getAccountState(accountCode: string): Promise<RecurlyState | null> {
    if (this.config.useMockData) {
      return this.getMockAccountState(accountCode);
    }

    try {
      // In a real implementation, you'd make multiple API calls
      const [account, subscriptions, invoices, transactions] = await Promise.all([
        this.getAccount(accountCode),
        this.getSubscriptions(accountCode),
        this.getInvoices(accountCode),
        this.getTransactions(accountCode),
      ]);

      if (!account) {
        return null;
      }

      return {
        account,
        subscriptions,
        invoices,
        transactions,
      };
    } catch (error) {
      console.error(`Failed to get account state for ${accountCode}:`, error);
      throw new Error(`Failed to retrieve account state: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get account details
   */
  private async getAccount(accountCode: string): Promise<RecurlyAccount | null> {
    try {
      const response = await this.client.get(`/accounts/${accountCode}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get active subscriptions for account
   */
  private async getSubscriptions(accountCode: string): Promise<RecurlySubscription[]> {
    try {
      const response = await this.client.get(`/accounts/${accountCode}/subscriptions`);
      return response.data.subscriptions || [];
    } catch (error) {
      console.error(`Failed to get subscriptions for ${accountCode}:`, error);
      return [];
    }
  }

  /**
   * Get recent invoices for account
   */
  private async getInvoices(accountCode: string): Promise<RecurlyInvoice[]> {
    try {
      const response = await this.client.get(`/accounts/${accountCode}/invoices`, {
        params: { limit: 50, sort: 'created_at', order: 'desc' }
      });
      return response.data.invoices || [];
    } catch (error) {
      console.error(`Failed to get invoices for ${accountCode}:`, error);
      return [];
    }
  }

  /**
   * Get recent transactions for account
   */
  private async getTransactions(accountCode: string): Promise<any[]> {
    try {
      const response = await this.client.get(`/accounts/${accountCode}/transactions`, {
        params: { limit: 50, sort: 'created_at', order: 'desc' }
      });
      return response.data.transactions || [];
    } catch (error) {
      console.error(`Failed to get transactions for ${accountCode}:`, error);
      return [];
    }
  }

  /**
   * Load mock data for testing
   */
  private getMockAccountState(accountCode: string): RecurlyState | null {
    try {
      const mockDataPath = this.config.mockDataPath || path.join(__dirname, '../../mock-apis');
      const mockFiles = [
        `recurly-account-${accountCode.replace(/_/g, '-')}.json`,
        `recurly-account-${accountCode}.json`,
      ];

      for (const filename of mockFiles) {
        const filePath = path.join(mockDataPath, filename);
        if (fs.existsSync(filePath)) {
          const mockData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          return mockData;
        }
      }

      console.warn(`No mock data found for account: ${accountCode}`);
      return null;
    } catch (error) {
      console.error(`Failed to load mock data for ${accountCode}:`, error);
      return null;
    }
  }

  /**
   * Create a new account (placeholder for real implementation)
   */
  async createAccount(accountData: Partial<RecurlyAccount>): Promise<RecurlyAccount> {
    if (this.config.useMockData) {
      console.log('Mock: Would create account with data:', accountData);
      return {
        account_code: accountData.account_code || 'mock_account',
        email: accountData.email || 'mock@example.com',
        first_name: accountData.first_name || 'Mock',
        last_name: accountData.last_name || 'User',
        company_name: accountData.company_name || 'Mock Company',
        state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    try {
      const response = await this.client.post('/accounts', accountData);
      return response.data;
    } catch (error) {
      console.error('Failed to create account:', error);
      throw new Error(`Failed to create account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new subscription (placeholder for real implementation)
   */
  async createSubscription(accountCode: string, subscriptionData: any): Promise<RecurlySubscription> {
    if (this.config.useMockData) {
      console.log('Mock: Would create subscription for', accountCode, 'with data:', subscriptionData);
      return {
        uuid: `mock_sub_${Date.now()}`,
        plan_code: subscriptionData.plan_code || 'mock_plan',
        state: 'active',
        unit_amount_in_cents: subscriptionData.unit_amount_in_cents || 0,
        quantity: subscriptionData.quantity || 1,
        current_period_started_at: new Date().toISOString(),
        current_period_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        started_at: new Date().toISOString(),
        collection_method: 'automatic',
        net_terms: 0,
      };
    }

    try {
      const response = await this.client.post(`/accounts/${accountCode}/subscriptions`, subscriptionData);
      return response.data;
    } catch (error) {
      console.error('Failed to create subscription:', error);
      throw new Error(`Failed to create subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an existing subscription (placeholder for real implementation)
   */
  async updateSubscription(subscriptionId: string, updateData: any): Promise<RecurlySubscription> {
    if (this.config.useMockData) {
      console.log('Mock: Would update subscription', subscriptionId, 'with data:', updateData);
      return {
        uuid: subscriptionId,
        plan_code: updateData.plan_code || 'updated_plan',
        state: 'active',
        unit_amount_in_cents: updateData.unit_amount_in_cents || 0,
        quantity: updateData.quantity || 1,
        current_period_started_at: new Date().toISOString(),
        current_period_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        started_at: new Date().toISOString(),
        collection_method: 'automatic',
        net_terms: 0,
      };
    }

    try {
      const response = await this.client.put(`/subscriptions/${subscriptionId}`, updateData);
      return response.data;
    } catch (error) {
      console.error('Failed to update subscription:', error);
      throw new Error(`Failed to update subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cancel a subscription (placeholder for real implementation)
   */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    if (this.config.useMockData) {
      console.log('Mock: Would cancel subscription', subscriptionId);
      return;
    }

    try {
      await this.client.delete(`/subscriptions/${subscriptionId}`);
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      throw new Error(`Failed to cancel subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Test connection to Recurly API
   */
  async testConnection(): Promise<boolean> {
    if (this.config.useMockData) {
      console.log('Mock mode: Connection test always succeeds');
      return true;
    }

    try {
      await this.client.get('/plans', { params: { limit: 1 } });
      return true;
    } catch (error) {
      console.error('Recurly connection test failed:', error);
      return false;
    }
  }
} 