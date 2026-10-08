const names = new Set(['page_view','signup_completed','project_created','photo_import_started','photos_imported','sequence_saved','export_started','export_generated','operation_failed']);
const features = new Set(['home','project','contact_sheet','table','sequence','frame','layout','compare','account','photo_import']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedKeys = ['event_id','visitor_id','session_id','occurred_at','name','feature','version','properties'];
export function validateEvents(body, now = Date.now()) {
  if (!body || Object.keys(body).some(key => key !== 'events') || !Array.isArray(body.events) || !body.events.length || body.events.length > 20) throw new Error('invalid_payload');
  return body.events.map(event => {
    if (!event || typeof event !== 'object' || Object.keys(event).some(key => !allowedKeys.includes(key))) throw new Error('invalid_event');
    if (![event.event_id,event.visitor_id,event.session_id].every(value => typeof value === 'string' && uuid.test(value))) throw new Error('invalid_id');
    const timestamp = Date.parse(event.occurred_at);
    if (!Number.isFinite(timestamp) || timestamp < now - 48 * 3600_000 || timestamp > now + 300_000) throw new Error('invalid_time');
    if (!names.has(event.name) || !features.has(event.feature) || typeof event.version !== 'string' || !/^[\w.+-]{1,64}$/.test(event.version)) throw new Error('invalid_event');
    const properties = event.properties;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error('invalid_properties');
    for (const [key,value] of Object.entries(properties)) {
      if (['count','failed_count','duration_ms'].includes(key)) {
        if (!Number.isInteger(value) || value < 0 || value > (key === 'duration_ms' ? 86400000 : 1000000)) throw new Error('invalid_properties');
      } else if (key === 'attempt_id') { if (typeof value !== 'string' || !uuid.test(value)) throw new Error('invalid_properties'); }
      else if (key === 'format') { if (!['pdf','jpeg','folder'].includes(value)) throw new Error('invalid_properties'); }
      else if (key === 'error_kind') { if (!['cancelled','permission','storage','conflict','unavailable','empty','partial','unknown'].includes(value)) throw new Error('invalid_properties'); }
      else throw new Error('invalid_properties');
    }
    if (['export_started','export_generated','photo_import_started','photos_imported'].includes(event.name) && !properties.attempt_id) throw new Error('missing_attempt');
    if (event.name === 'operation_failed' && !properties.error_kind) throw new Error('missing_failure');
    if (event.name === 'photos_imported' && !(properties.count > 0)) throw new Error('invalid_count');
    return { ...event, occurred_at: new Date(timestamp).toISOString() };
  });
}

export function validateRange(body, now = Date.now()) {
  if (!body || Object.keys(body).some(key => !['from','to'].includes(key))) throw new Error('invalid_range');
  const { from, to } = body;
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
  if (!valid(from) || !valid(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 >= 90 || to > shanghaiDay(now)) throw new Error('invalid_range');
  return { from, to };
}
export const shanghaiDay = time => new Date(new Date(time).getTime() + 8 * 3600_000).toISOString().slice(0,10);
export const addDays = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0,10);
