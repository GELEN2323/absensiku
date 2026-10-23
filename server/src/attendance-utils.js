'use strict';

const { isLate, minutesBetween, formatDuration } = require('./time');

const KNOWN_STATUS = new Set([
  'Hadir',
  'Terlambat',
  'Pulang',
  'Izin',
  'Tanpa Keterangan',
]);

function decorateRecord(record) {
  if (!record) return null;

  // Status dari database (dihitung trigger/server memakai settings) menang.
  // Fallback isLate hanya untuk baris lama yang statusnya belum terisi.
  const stored = KNOWN_STATUS.has(record.status) ? record.status : null;
  const late = record.check_in_at
    ? stored === 'Terlambat' || (stored !== 'Hadir' && isLate(record.check_in_at))
    : false;
  const status = record.check_in_at
    ? stored === 'Hadir' || stored === 'Terlambat'
      ? stored
      : late
        ? 'Terlambat'
        : 'Hadir'
    : stored && stored !== 'Pulang'
      ? stored
      : 'Belum absen';
  const minutes =
    record.check_in_at && record.check_out_at
      ? minutesBetween(record.check_in_at, record.check_out_at)
      : 0;

  return {
    ...record,
    late,
    status,
    ongoing: Boolean(record.check_in_at) && !record.check_out_at,
    duration: record.work_duration || (minutes > 0 ? formatDuration(minutes) : null),
    duration_minutes: minutes,
    check_in_photo: record.check_in_photo || null,
    check_out_photo: record.check_out_photo || null,
  };
}

function employeeMap(employees = []) {
  return new Map(employees.map((employee) => [employee.id, employee]));
}

function attachEmployees(records = [], employees = []) {
  const map = employeeMap(employees);
  return records.map((record) => {
    const employee = map.get(record.employee_id) || null;
    return {
      ...decorateRecord(record),
      employee: employee
        ? {
            id: employee.id,
            nip: employee.nip,
            nama: employee.nama,
            departemen: employee.departemen,
            photo_url: employee.photo_url,
            email: employee.email,
          }
        : null,
    };
  });
}

function summarize(records = []) {
  const present = records.filter((record) => record.check_in_at);
  const late = present.filter(
    (record) => record.status === 'Terlambat' || isLate(record.check_in_at)
  );
  const completed = present.filter((record) => record.check_out_at);
  const totalMinutes = completed.reduce(
    (total, record) => total + minutesBetween(record.check_in_at, record.check_out_at),
    0
  );

  return {
    total: records.length,
    present: present.length,
    late: late.length,
    completed: completed.length,
    total_minutes: totalMinutes,
    total_duration: formatDuration(totalMinutes),
  };
}

module.exports = { decorateRecord, attachEmployees, summarize, employeeMap };
