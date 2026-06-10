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
  private refreshToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('authToken');
      this.refreshToken = localStorage.getItem('refreshToken');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('authToken', token);
    }
  }

  setRefreshToken(token: string) {
    this.refreshToken = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('refreshToken', token);
    }
  }

  clearToken() {
    this.token = null;
    this.refreshToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
    }
  }

  /**
   * Exchange the refresh token for a new access token. Concurrent 401s share
   * a single refresh request.
   */
  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshToken) return false;
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          const response = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: this.refreshToken }),
          });
          if (!response.ok) return false;
          const data = await response.json();
          if (data?.accessToken) {
            this.setToken(data.accessToken);
            return true;
          }
          return false;
        } catch {
          return false;
        } finally {
          this.refreshPromise = null;
        }
      })();
    }
    return this.refreshPromise;
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

      let response = await fetch(`${API_URL}${path}`, options);

      // Expired access token: refresh once and retry the request
      if (
        response.status === 401 &&
        this.token &&
        !path.startsWith('/api/auth/')
      ) {
        const refreshed = await this.tryRefresh();
        if (refreshed) {
          options.headers = this.getHeaders();
          response = await fetch(`${API_URL}${path}`, options);
        } else {
          this.clearToken();
        }
      }

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
