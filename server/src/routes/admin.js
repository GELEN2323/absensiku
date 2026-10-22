'use strict';

const express = require('express');
const { db } = require('../supabase');
const { requireAuth, requireAdmin } = require('../auth');
const { dateKey, shiftDate, monthRange, isLate } = require('../time');
const { decorateRecord, attachEmployees, summarize } = require('../attendance-utils');
const { attendancePhotoMap, attachPhotos } = require('../photos');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const EMPLOYEE_FIELDS = 'id, nip, nama, departemen, email, photo_url, face_encoding';

async function fetchEmployees() {
  const { data, error } = await db
    .from('employees')
    .select(EMPLOYEE_FIELDS)
    .order('nama', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return data || [];
}

function publicEmployee(employee) {
  const { face_encoding: faceEncoding, ...rest } = employee;
  return { ...rest, face_registered: Boolean(faceEncoding) };
}

router.get('/summary', async (req, res) => {
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')
    ? req.query.date
    : dateKey();
  const weekDates = Array.from({ length: 7 }, (_, index) => shiftDate(selectedDate, index - 6));

  const employees = await fetchEmployees();

  const { data, error } = await db
    .from('attendance')
    .select('*')
    .gte('tanggal', weekDates[0])
    .lte('tanggal', selectedDate)
    .order('tanggal', { ascending: true })
    .limit(5000);
  if (error) throw error;

  const rows = data || [];
  const todayRows = rows.filter((row) => row.tanggal === selectedDate && row.check_in_at);
  const late = todayRows.filter((row) => isLate(row.check_in_at));
  const notCheckedOut = todayRows.filter((row) => !row.check_out_at);

  const trend = weekDates.map((date) => ({
    date,
    present: rows.filter((row) => row.tanggal === date && row.check_in_at).length,
    late: rows.filter((row) => row.tanggal === date && row.check_in_at && isLate(row.check_in_at))
      .length,
  }));

  const recent = todayRows
    .slice()
    .sort((a, b) => String(b.check_in_at).localeCompare(String(a.check_in_at)))
    .slice(0, 8);

  res.json({
    date: selectedDate,
    totals: {
      employees: employees.length,
      present: todayRows.length,
      late: late.length,
      absent: Math.max(0, employees.length - todayRows.length),
      not_checked_out: notCheckedOut.length,
    },
    trend,
    recent: attachEmployees(recent, employees),
  });
});

router.get('/employees', async (req, res) => {
  const search = String(req.query.q || '').trim();
  let employees = await fetchEmployees();

  if (search) {
    const needle = search.toLowerCase();
    employees = employees.filter(
      (employee) =>
        String(employee.nama || '').toLowerCase().includes(needle) ||
        String(employee.nip || '').toLowerCase().includes(needle) ||
        String(employee.departemen || '').toLowerCase().includes(needle)
    );
  }

  res.json({ employees: employees.map(publicEmployee) });
});

router.get('/attendance', async (req, res) => {
  const employees = await fetchEmployees();
  let query = db.from('attendance').select('*');

  if (req.query.employee_id) {
    query = query.eq('employee_id', req.query.employee_id);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')) {
    query = query.eq('tanggal', req.query.date);
  } else {
    const { start, end } = monthRange(req.query.month || dateKey().slice(0, 7));
    query = query.gte('tanggal', start).lte('tanggal', end);
  }

  const { data, error } = await query
    .order('tanggal', { ascending: false })
    .order('check_in_at', { ascending: false })
    .limit(1000);
  if (error) throw error;

  const records = attachEmployees(data || [], employees);
  const search = String(req.query.q || '').trim().toLowerCase();
  const filtered = search
    ? records.filter(
        (record) =>
          String(record.employee?.nama || '').toLowerCase().includes(search) ||
          String(record.employee?.nip || '').toLowerCase().includes(search)
      )
    : records;

  res.json({
    records: filtered,
    summary: summarize(filtered),
  });
});

router.get('/employees/:id', async (req, res) => {
  const { data, error } = await db
    .from('employees')
    .select(EMPLOYEE_FIELDS)
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    res.status(404).json({ error: { message: 'Karyawan tidak ditemukan.' } });
    return;
  }

  const { data: records, error: attendanceError } = await db
    .from('attendance')
    .select('*')
    .eq('employee_id', req.params.id)
    .order('tanggal', { ascending: false })
    .limit(31);
  if (attendanceError) throw attendanceError;

  const photoMap = await attendancePhotoMap(req.params.id);

  res.json({
    employee: publicEmployee(data),
    attendance: (records || []).map((row) => attachPhotos(decorateRecord(row), photoMap)),
    summary: summarize(records || []),
  });
});

module.exports = router;
