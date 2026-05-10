const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const SB_H = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` };

async function sbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { headers: SB_H });
  return res.json();
}

const p2 = (n: number) => String(n).padStart(2, '0');

function findShift(id: string, map: Record<string, any>) {
  return map[id] ?? map[id.replace(/AV$|V$/, '')] ?? null;
}

function toIcsDate(dateStr: string, timeStr: string, nextDay = false) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const dt = new Date(y, m - 1, d + (nextDay ? 1 : 0), hh, mm);
  return `${dt.getFullYear()}${p2(dt.getMonth()+1)}${p2(dt.getDate())}T${p2(dt.getHours())}${p2(dt.getMinutes())}00`;
}

function escIcs(s: string) {
  return s.replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const employeeId = url.searchParams.get('id');

  if (!employeeId) {
    return new Response('Missing ?id=employee_id', { status: 400 });
  }

  // Fetch shifts and schedules in parallel
  const [shiftsData, schedulesData] = await Promise.all([
    sbGet('/rest/v1/shifts?select=id,name,start_time,end_time,special_note,is_overnight'),
    sbGet(`/rest/v1/monthly_schedules?employee_id=eq.${encodeURIComponent(employeeId)}&select=year,month,day,shift_code&order=year,month,day`),
  ]);

  // Build shift map
  const shiftMap: Record<string, any> = {};
  for (const s of (shiftsData ?? [])) shiftMap[s.id] = s;

  // Build date→shift_code map
  const dayMap: Record<string, string> = {};
  for (const r of (schedulesData ?? [])) {
    const ds = `${r.year}-${p2(r.month)}-${p2(r.day)}`;
    dayMap[ds] = r.shift_code || '';
  }

  // Date range: 3 months back to 13 months ahead
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 14, 0);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//railwayroster//calendar//TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escIcs(employeeId)} 班表`,
    'X-WR-TIMEZONE:Asia/Taipei',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  const cur = new Date(start);
  while (cur <= end) {
    const ds = `${cur.getFullYear()}-${p2(cur.getMonth()+1)}-${p2(cur.getDate())}`;
    const code = (dayMap[ds] || '').trim();

    if (code && code !== '休' && code !== '—' && code !== '-' && code !== '例假' && code !== '特休') {
      const shift = findShift(code, shiftMap);
      if (shift) {
        const startTime: string = shift.start_time || '';
        const endTime:   string = shift.end_time   || '';
        if (startTime && endTime) {
          const spansMiddnight = endTime <= startTime;
          const dtStart = toIcsDate(ds, startTime);
          const dtEnd   = toIcsDate(ds, endTime, spansMiddnight);
          const summary = `${code} 工作班`;
          const descParts: string[] = [];
          if (shift.special_note) descParts.push(shift.special_note);

          lines.push('BEGIN:VEVENT');
          lines.push(`UID:${ds}-${code}-${employeeId}@railwayroster`);
          lines.push(`DTSTART;TZID=Asia/Taipei:${dtStart}`);
          lines.push(`DTEND;TZID=Asia/Taipei:${dtEnd}`);
          lines.push(`SUMMARY:${escIcs(summary)}`);
          if (descParts.length) lines.push(`DESCRIPTION:${escIcs(descParts.join('\\n'))}`);
          lines.push('BEGIN:VALARM');
          lines.push('TRIGGER:-PT2H');
          lines.push('ACTION:DISPLAY');
          lines.push(`DESCRIPTION:${escIcs(summary)} 出發提醒`);
          lines.push('END:VALARM');
          lines.push('END:VEVENT');
        }
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
