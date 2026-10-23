import type {
  AdminAttendanceResponse,
  AdminEmployeesResponse,
  AdminSummary,
  FaceEnrollResponse,
  FaceStatusResponse,
  FaceVerifyResponse,
  ForgotPasswordResponse,
  HistoryResponse,
  IzinCreateResponse,
  IzinListResponse,
  LivenessChallenge,
  LoginResponse,
  PatrolHistoryResponse,
  PatrolScanResponse,
  PatrolTodayResponse,
  Position,
  RegisterInput,
  TodayResponse,
  User,
} from './types';

const configured = (process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');

/**
 * Saat web di-deploy, API biasanya berada di origin yang sama dengan halaman.
 * Kalau build masih membawa URL localhost (misalnya karena .env dev), pakai
 * origin halaman supaya aplikasi tidak menembak localhost milik pengunjung.
 */
function resolveBaseUrl(): string {
  if (typeof window === 'undefined' || !window.location) return configured;

  const pageHost = window.location.hostname;
  const isPageLocal = pageHost === 'localhost' || pageHost === '127.0.0.1';
  const isConfiguredLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured);

  if (!configured || (isConfiguredLocal && !isPageLocal)) return '';
  return configured;
}

export const API_BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.token) headers.Authorization = `Bearer ${options.token}`;

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        // Tanpa ini browser bisa mengembalikan respons lama (304) setelah absen.
        cache: 'no-store',
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError('Server terlalu lama merespons. Coba lagi.', 0);
      }
      throw new ApiError(
        'Tidak bisa terhubung ke server. Periksa koneksi internet kamu.',
        0
      );
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const errorPayload = payload as { error?: { message?: string; details?: unknown } } | null;
      throw new ApiError(
        errorPayload?.error?.message || `Permintaan gagal (${response.status}).`,
        response.status,
        errorPayload?.error?.details
      );
    }

    return payload as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: () => request<{ ok: boolean; database: string }>('/api/health'),

  login: (identifier: string, password: string) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { identifier, password },
    }),

  register: (input: RegisterInput) =>
    request<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: input,
    }),

  me: (token: string) => request<{ user: User }>('/api/auth/me', { token }),

  forgotPassword: (nik: string) =>
    request<ForgotPasswordResponse>('/api/auth/forgot-password', {
      method: 'POST',
      body: { nik },
    }),

  changePassword: (token: string, oldPassword: string, newPassword: string) =>
    request<{ ok: boolean; message: string }>('/api/auth/password', {
      method: 'POST',
      token,
      body: { old_password: oldPassword, new_password: newPassword },
    }),

  logout: (token: string) =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', token }),

  today: (token: string, position?: Position | null) => {
    const search = new URLSearchParams();
    if (position) {
      search.set('lat', String(position.lat));
      search.set('lng', String(position.lng));
    }
    const query = search.toString();
    return request<TodayResponse>(`/api/attendance/today${query ? `?${query}` : ''}`, { token });
  },

  history: (token: string, month: string) =>
    request<HistoryResponse>(`/api/attendance?month=${encodeURIComponent(month)}`, { token }),

  checkIn: (
    token: string,
    position: Position,
    photo: string | null,
    verificationId: string
  ) =>
    request<{ message: string; record: unknown }>('/api/attendance/check-in', {
      method: 'POST',
      token,
      timeoutMs: 60000,
      body: { ...position, verification_id: verificationId, ...(photo ? { photo } : {}) },
    }),

  checkOut: (
    token: string,
    position: Position,
    photo: string | null,
    verificationId: string
  ) =>
    request<{ message: string; record: unknown }>('/api/attendance/check-out', {
      method: 'POST',
      token,
      timeoutMs: 60000,
      body: { ...position, verification_id: verificationId, ...(photo ? { photo } : {}) },
    }),

  /* ------------------------------ Wajah ------------------------------ */

  faceStatus: (token: string) => request<FaceStatusResponse>('/api/face/status', { token }),

  enrollFace: (token: string, photos: string[]) =>
    request<FaceEnrollResponse>('/api/face/enroll', {
      method: 'POST',
      token,
      timeoutMs: 90000,
      body: { photos },
    }),

  verifyFace: (token: string, frames: string[], challenge: LivenessChallenge) =>
    request<FaceVerifyResponse>('/api/face/verify', {
      method: 'POST',
      token,
      timeoutMs: 90000,
      body: { frames, challenge },
    }),

  /* ----------------------------- Patroli ----------------------------- */

  patrolToday: (token: string) => request<PatrolTodayResponse>('/api/patrol/today', { token }),

  patrolScan: (
    token: string,
    input: {
      checkpointId: string;
      position: Position;
      photo: string;
    }
  ) =>
    request<PatrolScanResponse>('/api/patrol/scan', {
      method: 'POST',
      token,
      timeoutMs: 60000,
      body: {
        checkpoint_id: input.checkpointId,
        ...input.position,
        photo: input.photo,
      },
    }),

  patrolHistory: (token: string) =>
    request<PatrolHistoryResponse>('/api/patrol/history', { token }),

  /* ------------------------------- Izin ------------------------------ */

  izinList: (token: string, month?: string) => {
    const search = new URLSearchParams();
    if (month) search.set('month', month);
    const query = search.toString();
    return request<IzinListResponse>(`/api/izin${query ? `?${query}` : ''}`, { token });
  },

  createIzin: (
    token: string,
    input: { tanggal: string; alasan: string; photo?: string | null }
  ) =>
    request<IzinCreateResponse>('/api/izin', {
      method: 'POST',
      token,
      timeoutMs: 60000,
      body: {
        tanggal: input.tanggal,
        alasan: input.alasan,
        ...(input.photo ? { photo: input.photo } : {}),
      },
    }),

  adminSummary: (token: string, date?: string) =>
    request<AdminSummary>(`/api/admin/summary${date ? `?date=${encodeURIComponent(date)}` : ''}`, {
      token,
    }),

  adminEmployees: (token: string, query?: string) =>
    request<AdminEmployeesResponse>(
      `/api/admin/employees${query ? `?q=${encodeURIComponent(query)}` : ''}`,
      { token }
    ),

  adminAttendance: (
    token: string,
    params: { date?: string; month?: string; employeeId?: string; q?: string }
  ) => {
    const search = new URLSearchParams();
    if (params.date) search.set('date', params.date);
    if (params.month) search.set('month', params.month);
    if (params.employeeId) search.set('employee_id', params.employeeId);
    if (params.q) search.set('q', params.q);
    const query = search.toString();
    return request<AdminAttendanceResponse>(`/api/admin/attendance${query ? `?${query}` : ''}`, {
      token,
    });
  },
};
