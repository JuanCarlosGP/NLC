export const WHOOP_SCOPES = 'offline read:profile read:body_measurement read:cycles read:recovery read:sleep read:workout';
export class IntegrationError extends Error {
  constructor(code, status = 502) { super(code); this.code = code; this.status = status; }
}
const string = (value, max = 300) => typeof value === 'string' ? value.slice(0, max) : '';
const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const id = (row) => { if (!['string', 'number'].includes(typeof row?.id) || !String(row.id)) throw new IntegrationError('invalid'); return String(row.id); };
const date = (value) => { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new IntegrationError('invalid'); return value; };
const unique = (rows) => [...new Map(rows.map(row => [row.id, row])).values()];
const minutes = value => number(value) === null ? null : value / 60000;
// WHOOP dates belong to the source's offset, not the computer's current timezone.
export function sourceDate(iso, offset = '+00:00') {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match || +match[2] > 23 || +match[3] > 59) throw new IntegrationError('invalid');
  const delta = (+match[2] * 60 + +match[3]) * (match[1] === '+' ? 1 : -1);
  return new Date(Date.parse(date(iso)) + delta * 60000).toISOString().slice(0, 10);
}
export async function requestJson(url, { fetchImpl = fetch, ...options } = {}) {
  let response;
  try { response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) }); }
  catch { throw new IntegrationError('network'); }
  if (!response.ok) throw new IntegrationError(response.status === 401 || response.status === 403 ? 'auth' : response.status === 429 ? 'rateLimit' : 'upstream');
  if (Number(response.headers.get('content-length') || 0) > 16 * 1024 * 1024) throw new IntegrationError('size');
  const reader = response.body?.getReader(); if (!reader) throw new IntegrationError('invalid');
  const parts = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new IntegrationError('size'); } parts.push(part.value); }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch (error) { throw error instanceof IntegrationError ? error : new IntegrationError('invalid'); }
}
export async function pages(get, path, key, kind = 'whoop', params = {}) {
  const rows = []; const seen = new Set(); let cursor = null;
  for (let page = 0; page < 2000; page++) {
    const query = { ...params, limit: kind === 'whoop' ? 25 : 1000 };
    if (kind !== 'whoop') query.order = 'asc';
    if (cursor !== null) query[kind === 'whoop' ? 'nextToken' : kind === 'treasury' ? 'cursor' : 'start_after'] = cursor;
    const payload = await get(path, query);
    if (!Array.isArray(payload?.[key])) throw new IntegrationError('invalid');
    rows.push(...payload[key]); if (rows.length > 100000) throw new IntegrationError('size');
    cursor = kind === 'whoop' ? payload.next_token : kind === 'treasury' ? payload.cursor : payload.page?.nextPage;
    if (cursor === null || cursor === undefined || cursor === '') return [...new Map(rows.map(row => [id({ id: row.id ?? row.cycle_id }), row])).values()];
    if (!['string', 'number'].includes(typeof cursor) || seen.has(String(cursor))) throw new IntegrationError('pagination');
    seen.add(String(cursor));
  }
  throw new IntegrationError('size');
}
export function normalizeWhoop({ profile, body, cycles, recoveries, sleeps, workouts }, syncedAt, mode = 'live') {
  if (!profile || !Number.isSafeInteger(profile.user_id)) throw new IntegrationError('invalid');
  const sleepRows = sleeps.map(row => {
    const score = row.score_state === 'SCORED' ? row.score : null; const stages = score?.stage_summary;
    return { id: id(row), date: sourceDate(row.end || row.start, row.timezone_offset), start: date(row.start), end: row.end ? date(row.end) : null,
      nap: row.nap === true, performance: number(score?.sleep_performance_percentage), efficiency: number(score?.sleep_efficiency_percentage),
      respiratoryRate: number(score?.respiratory_rate), lightMinutes: minutes(stages?.total_light_sleep_time_milli), deepMinutes: minutes(stages?.total_slow_wave_sleep_time_milli),
      remMinutes: minutes(stages?.total_rem_sleep_time_milli), awakeMinutes: minutes(stages?.total_awake_time_milli),
      asleepMinutes: stages ? minutes((stages.total_light_sleep_time_milli ?? 0) + (stages.total_slow_wave_sleep_time_milli ?? 0) + (stages.total_rem_sleep_time_milli ?? 0)) : null };
  });
  const recoveryMap = new Map(recoveries.map(row => [String(row.cycle_id), row]));
  const sleepMap = new Map(sleepRows.map(row => [row.id, row]));
  const days = cycles.map(row => {
    const recovery = recoveryMap.get(id(row)); const score = recovery?.score_state === 'SCORED' ? recovery.score : null;
    const cycleScore = row.score_state === 'SCORED' ? row.score : null;
    return { id: id(row), date: sourceDate(row.start, row.timezone_offset), strain: number(cycleScore?.strain), calories: number(cycleScore?.kilojoule) === null ? null : cycleScore.kilojoule / 4.184,
      recovery: number(score?.recovery_score), restingHeartRate: number(score?.resting_heart_rate), hrv: number(score?.hrv_rmssd_milli), spo2: number(score?.spo2_percentage), temperature: number(score?.skin_temp_celsius),
      sleepId: sleepMap.has(String(recovery?.sleep_id)) ? String(recovery.sleep_id) : null };
  });
  const activities = workouts.map(row => {
    const score = row.score_state === 'SCORED' ? row.score : null;
    return { id: id(row), date: sourceDate(row.start, row.timezone_offset), start: date(row.start), end: row.end ? date(row.end) : null,
      name: string(row.sport_name) || `WHOOP · ${row.sport_id ?? '?'}`, strain: number(score?.strain), calories: number(score?.kilojoule) === null ? null : score.kilojoule / 4.184,
      averageHeartRate: number(score?.average_heart_rate), maxHeartRate: number(score?.max_heart_rate), distanceMeters: number(score?.distance_meter),
      zoneMinutes: ['zero', 'one', 'two', 'three', 'four', 'five'].map(zone => minutes(score?.zone_durations?.[`zone_${zone}_milli`])) };
  });
  return { version: 1, provider: 'whoop', mode, syncedAt, owner: String(profile.user_id), name: [string(profile.first_name), string(profile.last_name)].filter(Boolean).join(' '),
    body: { weightKg: number(body?.weight_kilogram), heightMeters: number(body?.height_meter), maxHeartRate: number(body?.max_heart_rate) },
    days: unique(days).sort((a,b) => b.date.localeCompare(a.date)), sleeps: unique(sleepRows).sort((a,b) => b.start.localeCompare(a.start)), activities: unique(activities).sort((a,b) => b.start.localeCompare(a.start)) };
}
export function normalizeMercury({ accounts, credit, treasury, transactions, treasuryTransactions, categories }, syncedAt, mode = 'live') {
  const accountRows = new Map();
  for (const [kind, rows] of [['depository', accounts], ['credit', credit], ['treasury', treasury]]) for (const row of rows) {
    const balance = number(row.currentBalance); if (balance === null) throw new IntegrationError('invalid');
    // Mercury balances are signed USD amounts. A credit debt is already negative.
    if (row.currency && row.currency !== 'USD') throw new IntegrationError('currency');
    accountRows.set(id(row), { id: id(row), name: string(row.nickname || row.name) || `Mercury ${kind}`, kind, status: string(row.status), currency: 'USD', balance,
      available: number(row.availableBalance), last4: typeof row.accountNumber === 'string' ? row.accountNumber.replace(/\D/g, '').slice(-4) : '' });
  }
  const categoryMap = new Map(categories.map(row => [id(row), string(row.name)]));
  const txs = [...transactions.map(row => ({ row, surface: 'depository' })), ...treasuryTransactions.map(row => ({ row, surface: 'treasury' }))].map(({ row, surface }) => {
    if (!accountRows.has(String(row.accountId)) || number(row.amount) === null) throw new IntegrationError('invalid');
    const at = date(row.postedAt || row.createdAt || row.canonicalDay);
    return { id: `${surface}:${id(row)}`, accountId: String(row.accountId), surface, amount: row.amount, currency: 'USD', date: at.slice(0,10), at,
      title: string(row.counterpartyName || row.bankDescription || row.description || row.externalMemo) || 'Mercury', status: string(row.status || 'sent'),
      category: string(row.categoryData?.customCategory?.name || row.categoryData?.name || categoryMap.get(row.categoryData?.id) || row.categoryData?.mercuryCategory || row.mercuryCategory || row.merchant?.mercuryCategory) };
  });
  const returns = treasury.flatMap(account => (account.netReturns || []).map(row => {
    if (number(row.netAmount) === null || number(row.treasuryFee) === null) throw new IntegrationError('invalid');
    return { id: `${id(account)}:${date(row.month).slice(0,7)}`, accountId: id(account), month: row.month.slice(0,7), netAmount: row.netAmount, fee: row.treasuryFee, status: string(row.status) };
  }));
  return { version: 1, provider: 'mercury', mode, syncedAt, owner: [...accountRows.keys()].sort().join('|') || 'mercury-empty', accounts: [...accountRows.values()],
    transactions: unique(txs).sort((a,b) => b.at.localeCompare(a.at)), returns: unique(returns).sort((a,b) => b.month.localeCompare(a.month)) };
}
export async function collectWhoop(token, fetchImpl = fetch) {
  const get = (path, query = {}) => { const url = new URL(path, 'https://api.prod.whoop.com'); Object.entries(query).forEach(([k,v]) => url.searchParams.set(k,String(v))); return requestJson(url,{ fetchImpl, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); };
  // A complete read also catches edits, removed records and old pending scores.
  const profile = await get('/developer/v2/user/profile/basic');
  const body = await get('/developer/v2/user/measurement/body');
  const results = {};
  for (const [key,path] of Object.entries({ cycles: '/cycle', recoveries: '/recovery', sleeps: '/activity/sleep', workouts: '/activity/workout' })) results[key] = await pages(get, `/developer/v2${path}`, 'records');
  return { profile, body, ...results };
}
export async function collectMercury(token, fetchImpl = fetch) {
  const get = (path, query = {}) => { const url = new URL(`https://api.mercury.com/api/v1${path}`); Object.entries(query).forEach(([k,v]) => url.searchParams.set(k,String(v))); return requestJson(url,{ fetchImpl, headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`, Accept: 'application/json' } }); };
  const accounts = await pages(get, '/accounts', 'accounts', 'mercury');
  const creditPayload = await get('/credit'); if (!Array.isArray(creditPayload?.accounts)) throw new IntegrationError('invalid');
  const treasury = await pages(get, '/treasury', 'accounts', 'mercury');
  const categories = await pages(get, '/categories', 'categories', 'mercury');
  const transactions = await pages(get, '/transactions', 'transactions', 'mercury');
  const treasuryTransactions = [];
  for (const account of treasury) treasuryTransactions.push(...(await pages(get, `/treasury/${encodeURIComponent(id(account))}/transactions`, 'transactions', 'treasury')).map(row => ({ ...row, accountId: id(account) })));
  return { accounts, credit: creditPayload.accounts, treasury, categories, transactions, treasuryTransactions };
}
