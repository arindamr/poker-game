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
  }) => apiClient.post('/api/v1/auth/register', data),

  login: (data: { email: string; password: string }) =>
    apiClient.post('/api/v1/auth/login', data),

  logout: () => {
    apiClient.clearToken();
    return Promise.resolve({ success: true });
  },
};

// Game endpoints
export const gameAPI = {
  getTables: () => apiClient.get('/api/v1/tables'),
  createTable: (data: any) => apiClient.post('/api/v1/tables', data),
  getTableDetails: (tableId: string) => apiClient.get(`/api/v1/tables/${tableId}`),
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
