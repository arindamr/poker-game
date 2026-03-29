/**
 * API Client for Poker Game Backend
 */

// Default to same-origin so deployments behind a reverse proxy (IP/domain) work out of the box.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  token?: string;
  status?: string;
  [key: string]: any;
}

export class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('authToken');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('authToken', token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
    }
  }

  private getHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request<T>(
    method: string,
    path: string,
    body?: any
  ): Promise<ApiResponse<T>> {
    try {
      const options: RequestInit = {
        method,
        headers: this.getHeaders(),
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${API_URL}${path}`, options);
      const contentType = response.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { message: text };
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, body);
  }
}

export const apiClient = new ApiClient();

// Auth endpoints
export const authAPI = {
  register: (data: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => apiClient.post('/api/auth/register', data),

  login: (data: { email: string; password: string }) =>
    apiClient.post('/api/auth/login', data),

  logout: () => {
    apiClient.clearToken();
    return Promise.resolve({ success: true });
  },

  // 2FA Security
  enable2FA: () => apiClient.post('/api/security/2fa/enable'),
  verify2FA: (token: string) => apiClient.post('/api/security/2fa/verify-setup', { token }),
  get2FAStatus: () => apiClient.get('/api/security/2fa/status'),
  disable2FA: (password: string) => apiClient.post('/api/security/2fa/disable', { password }),
  useBackupCode: (backupCode: string) => apiClient.post('/api/security/2fa/backup-code', { backupCode }),
};

// Game endpoints
export const gameAPI = {
  getTables: () => apiClient.get('/api/v1/tables'),
  createTable: (data: any) => apiClient.post('/api/game/tables', data),
  getTableDetails: (tableId: string) => apiClient.get(`/api/game/tables/${tableId}/state`),
  joinTable: (gameId: string, buyIn: number) => apiClient.post(`/api/game/tables/${gameId}/join`, { buyIn }),
  processAction: (gameId: string, action: string, amount?: number) => 
    apiClient.post(`/api/game/tables/${gameId}/action`, { action, amount }),
  verifyShuffle: (gameId: string, seed: string, deck: number[]) => 
    apiClient.post(`/api/game/tables/${gameId}/verify-shuffle`, { seed, deck }),
  cashOut: (gameId: string, winnings: number) => 
    apiClient.post(`/api/game/tables/${gameId}/cash-out`, { winnings }),
  getHandHistory: (gameId: string) => apiClient.get(`/api/game/tables/${gameId}/history`),
};

// Compliance & Financial
export const securityAPI = {
  initiateKYC: (data: { firstName: string; lastName: string; dateOfBirth: string }) => 
    apiClient.post('/api/security/kyc/initiate', data),
  getKYCStatus: () => apiClient.get('/api/security/kyc/status'),
  deposit: (data: { amount: number; paymentMethod: string }) => 
    apiClient.post('/api/security/financial/deposit', data),
  selfExclude: (duration: string) => 
    apiClient.post('/api/security/responsible-gaming/self-exclude', { duration }),
  getComplianceDashboard: () => apiClient.get('/api/security/compliance/dashboard'),
};

// Admin endpoints
export const adminAPI = {
  getCheatDetections: () => apiClient.get('/api/v1/admin/cheat-detections'),
  getUserCheatHistory: (userId: string) => apiClient.get(`/api/v1/admin/cheat-detections/${userId}`),
  reviewCheatSuspicion: (userId: string, data: { status: string; notes: string }) => 
    apiClient.post(`/api/v1/admin/cheat-suspicions/${userId}/review`, data),
  banUser: (userId: string, reason: string) => 
    apiClient.post(`/api/v1/admin/cheat-suspicions/${userId}/ban`, { reason }),
};

// User endpoints
export const userAPI = {
  getProfile: () => apiClient.get('/api/v1/users/profile'),
  updateProfile: (data: any) => apiClient.put('/api/v1/users/profile', data),
};

// System endpoints
export const systemAPI = {
  getHealth: () => apiClient.get('/health'),
  getMetrics: () => apiClient.get('/admin/metrics'),
  getPrometheusMetrics: async () => {
    const response = await fetch(`${API_URL}/metrics`);
    return response.text();
  },
};
