export type Role = 'admin' | 'karyawan';

export type Jabatan = 'Chief' | 'Danru' | 'Anggota';

export type Employee = {
  id: string;
  nip: string;
  nama: string;
  departemen: string | null;
  email: string | null;
  photo_url: string | null;
  face_registered: boolean;
  jabatan: Jabatan;
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
  status: 'Hadir' | 'Terlambat' | 'Pulang' | 'Izin' | 'Tanpa Keterangan' | 'Belum absen';
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

export type NearestLocation = {
  id: string | null;
  nama: string;
  lat: number;
  lng: number;
  distance_m: number;
  radius_meter: number;
};

export type WorkSettings = {
  jam_masuk: string;
  jam_pulang: string;
  toleransi_menit: number;
};

export type TodayResponse = {
  date: string;
  hari: string;
  server_time: string;
  time: string;
  office: Office;
  work?: WorkSettings;
  nearest?: NearestLocation | null;
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

export type ForgotPasswordResponse = {
  ok: boolean;
  message: string;
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
  /** Android menandai lokasi palsu lewat coords.mocked. */
  mocked?: boolean;
};

/* ------------------------------------------------------------------ */
/* Wajah (P3)                                                          */
/* ------------------------------------------------------------------ */

export type FaceStatusResponse = {
  face_registered: boolean;
};

export type FaceEnrollResponse = {
  ok: boolean;
  face_registered: boolean;
  quality?: unknown[];
};

export type LivenessChallenge = 'blink_twice' | 'close_eyes';

export type LivenessResult = {
  passed: boolean;
  reason?: string;
  message?: string;
  detected?: number;
  blinks?: number;
  longest_closed?: number;
};

export type FaceVerifyResponse = {
  match: boolean;
  verification_id?: string;
  expires_at?: string;
  distance: number | null;
  threshold: number;
  liveness: LivenessResult;
  remaining_attempts?: number;
};

/* ------------------------------------------------------------------ */
/* Patroli (P6)                                                        */
/* ------------------------------------------------------------------ */

export type PatrolCheckpoint = {
  id: string;
  nama: string;
  lat: number;
  lng: number;
  radius_meter: number;
  urutan: number;
  aktif: boolean;
  scanned: boolean;
  scanned_at: string | null;
};

export type PatrolProgress = {
  scanned: number;
  total: number;
  percent: number;
  done: boolean;
};

export type PatrolCheckpointInfo = {
  id: string;
  nama: string;
  urutan: number;
  radius_meter: number;
  lat: number;
  lng: number;
};

export type PatrolLog = {
  id: string;
  user_id: string;
  titik_id: string;
  tanggal: string;
  timestamp_server: string;
  lat: number | null;
  lng: number | null;
  checkpoint: PatrolCheckpointInfo | null;
};

export type PatrolTodayResponse = {
  date: string;
  hari: string;
  server_time: string;
  checkpoints: PatrolCheckpoint[];
  progress: PatrolProgress;
  logs: PatrolLog[];
};

export type PatrolScanResponse = {
  message: string;
  log: PatrolLog;
  progress: PatrolProgress;
  face_distance: number;
};

export type PatrolHistoryDay = {
  tanggal: string;
  hari: string;
  logs: PatrolLog[];
};

export type PatrolHistoryResponse = {
  days: PatrolHistoryDay[];
};

/* ------------------------------------------------------------------ */
/* Izin (P7)                                                           */
/* ------------------------------------------------------------------ */

export type IzinStatus = 'pending' | 'approved' | 'rejected';

export type IzinItem = {
  id: string;
  tanggal: string;
  hari?: string;
  alasan: string;
  foto_url: string | null;
  status: IzinStatus;
  catatan: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type IzinListResponse = {
  items: IzinItem[];
  counts: Record<IzinStatus, number>;
  month: string | null;
};

export type IzinCreateResponse = {
  message: string;
  item: IzinItem;
  photo_warning?: string;
};
