export type Role = 'admin' | 'karyawan';

export type Employee = {
  id: string;
  nip: string;
  nama: string;
  departemen: string | null;
  email: string | null;
  photo_url: string | null;
  face_registered: boolean;
};

export type User = {
  id: string;
  email: string;
  role: Role;
  nama: string;
  employee: Employee | null;
};

export type Office = {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
};

export type AttendanceRecord = {
  id: string;
  employee_id: string;
  tanggal: string;
  hari: string;
  check_in_at: string | null;
  check_in_lat: number | null;
  check_in_long: number | null;
  check_in_address: string | null;
  check_out_at: string | null;
  check_out_lat: number | null;
  check_out_long: number | null;
  check_out_address: string | null;
  work_duration: string | null;
  lokasi_tidak_tersedia: boolean;
  created_at: string | null;
  check_in_photo: string | null;
  check_out_photo: string | null;
  late: boolean;
  status: 'Hadir' | 'Terlambat' | 'Belum absen';
  ongoing: boolean;
  duration: string | null;
  duration_minutes: number;
  employee?: {
    id: string;
    nip: string;
    nama: string;
    departemen: string | null;
    photo_url: string | null;
    email: string | null;
  } | null;
};

export type Summary = {
  total: number;
  present: number;
  late: number;
  completed: number;
  total_minutes: number;
  total_duration: string;
};

export type TodayResponse = {
  date: string;
  hari: string;
  server_time: string;
  time: string;
  office: Office;
  record: AttendanceRecord | null;
};

export type HistoryResponse = {
  month: string;
  start: string;
  end: string;
  records: AttendanceRecord[];
  summary: Summary;
};

export type LoginResponse = {
  token: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
};

export type RegisterInput = {
  nip: string;
  nama: string;
  email: string;
  departemen?: string;
  password: string;
};

export type AdminTrendPoint = {
  date: string;
  present: number;
  late: number;
};

export type AdminSummary = {
  date: string;
  totals: {
    employees: number;
    present: number;
    late: number;
    absent: number;
    not_checked_out: number;
  };
  trend: AdminTrendPoint[];
  recent: AttendanceRecord[];
};

export type AdminEmployeesResponse = {
  employees: Employee[];
};

export type AdminAttendanceResponse = {
  records: AttendanceRecord[];
  summary: Summary;
};

export type Position = {
  lat: number;
  lng: number;
  accuracy: number | null;
};
