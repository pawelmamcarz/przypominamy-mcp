// Testy serwera MCP: surowy JSON-RPC po Streamable HTTP (tryb JSON), bramka zastąpiona atrapą.
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import worker, { type Env } from '../src/index';

const calls: { method: string; path: string; auth: string | null; body: unknown }[] = [];
const fakeApi: Fetcher = {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const body = req.method === 'POST' || req.method === 'PATCH' ? await req.json() : null;
    calls.push({ method: req.method, path: url.pathname + url.search, auth: req.headers.get('Authorization'), body });
    if (req.headers.get('Authorization') !== 'Bearer pk_live_good') return Response.json({ error: { code: 'unauthorized', message: 'Nieprawidłowy klucz' } }, { status: 401 });
    if (url.pathname === '/v1/account') return Response.json({ id: 'cl_1', name: 'Firma', balance_grosze: 1234, price_per_part_grosze: 15, price_per_vms_grosze: 30, mode: 'live', status: 'active', sender_name: null });
    if (url.pathname === '/v1/messages' && req.method === 'POST') return Response.json({ id: 'msg_1', status: 'queued', to: '+48533991881', cost_grosze: 30, parts: 2 }, { status: 201 });
    if (url.pathname === '/v1/messages') return Response.json({ data: [{ id: 'msg_1', status: 'delivered' }], next_cursor: null });
    if (url.pathname === '/v1/senders') return Response.json({ data: [{ name: 'PRZYPOMINAM', status: 'active', is_default: false, own: false }], current: null });
    if (url.pathname === '/v1/reports') return Response.json({ totals: { count: 3, cost_grosze: 45 }, data: [] });
    if (url.pathname === '/v1/contacts' && req.method === 'POST') return Response.json({ created: (body as unknown[]).length, updated: 0, invalid: [] }, { status: 201 });
    if (url.pathname.startsWith('/v1/messages/') && req.method === 'DELETE') return Response.json({ id: url.pathname.split('/').pop(), status: 'cancelled' });
    return Response.json({ error: { code: 'not_found', message: 'brak' } }, { status: 404 });
  },
} as unknown as Fetcher;

const testEnv: Env = { ...(env as unknown as Env), API: fakeApi };

let nextId = 1;
async function rpc(method: string, params: Record<string, unknown> = {}, opts: { auth?: string; path?: string } = {}) {
  const res = await worker.fetch(new Request(`https://mcp.przypominamy.com${opts.path ?? '/mcp'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(opts.auth === undefined ? { Authorization: 'Bearer pk_live_good' } : opts.auth ? { Authorization: opts.auth } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  }), testEnv);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } };

describe('MCP przypominamy', () => {
  it('bez klucza: 401 z podpowiedzią; GET z przeglądarki: wizytówka', async () => {
    const r = await rpc('initialize', INIT, { auth: '' });
    expect(r.status).toBe(401);
    expect(r.body.error.message).toMatch(/app.przypominamy.com\/keys/);
    const info = await worker.fetch(new Request('https://mcp.przypominamy.com/'), testEnv);
    expect(info.status).toBe(200);
    expect((await info.json() as { endpoint: string }).endpoint).toBe('https://mcp.przypominamy.com/mcp');
  });

  it('initialize + tools/list: wszystkie narzędzia, z adnotacjami', async () => {
    const init = await rpc('initialize', INIT);
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe('przypominamy');
    expect(init.body.result.instructions).toMatch(/potwierdzenie/);
    const list = await rpc('tools/list');
    const names = list.body.result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(['add_to_blacklist', 'add_to_group', 'cancel_message', 'count_sms_parts', 'delete_contact', 'get_account', 'get_message', 'get_report', 'list_blacklist', 'list_contacts', 'list_groups', 'list_messages', 'list_senders', 'remove_from_blacklist', 'send_sms', 'send_voice', 'set_default_sender', 'set_send_window', 'upsert_contacts']);
    const send = list.body.result.tools.find((t: { name: string }) => t.name === 'send_sms');
    expect(send.annotations.destructiveHint).toBe(true);
    expect(send.inputSchema.required).toContain('to');
  });

  it('podzbiór /mcp/sms nie ma narzędzi konta', async () => {
    const list = await rpc('tools/list', {}, { path: '/mcp/sms' });
    const names = list.body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('send_sms');
    expect(names).not.toContain('get_account');
  });

  it('send_sms przekazuje klucz i argumenty do bramki, zwraca koszt', async () => {
    calls.length = 0;
    const r = await rpc('tools/call', { name: 'send_sms', arguments: { to: '+48533991881', text: 'Test', reference: 'zam-1' } });
    expect(r.status).toBe(200);
    expect(r.body.result.isError).toBeFalsy();
    expect(r.body.result.structuredContent.total_cost).toBe('0.30 PLN');
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/v1/messages', auth: 'Bearer pk_live_good', body: { to: '+48533991881', text: 'Test', reference: 'zam-1' } });
  });

  it('błąd bramki (zły klucz) wraca jako isError, nie jako wyjątek', async () => {
    const r = await rpc('tools/call', { name: 'get_account', arguments: {} }, { auth: 'Bearer pk_live_bad' });
    expect(r.status).toBe(200);
    expect(r.body.result.isError).toBe(true);
    expect(r.body.result.content[0].text).toMatch(/unauthorized/);
  });

  it('count_sms_parts liczy lokalnie; get_account i get_report dodają kwoty w PLN; list_messages przekazuje filtry', async () => {
    const parts = await rpc('tools/call', { name: 'count_sms_parts', arguments: { text: 'Zażółć gęślą jaźń' } });
    expect(parts.body.result.structuredContent).toMatchObject({ encoding: 'ucs2', parts: 1 });
    const acc = await rpc('tools/call', { name: 'get_account', arguments: {} });
    expect(acc.body.result.structuredContent.balance).toBe('12.34 PLN');
    const rep = await rpc('tools/call', { name: 'get_report', arguments: { group: 'month' } });
    expect(rep.body.result.structuredContent.totals.cost).toBe('0.45 PLN');
    calls.length = 0;
    await rpc('tools/call', { name: 'list_messages', arguments: { status: 'delivered', limit: 5 } });
    expect(calls[0].path).toBe('/v1/messages?status=delivered&limit=5');
    calls.length = 0;
    const up = await rpc('tools/call', { name: 'upsert_contacts', arguments: { contacts: [{ msisdn: '+48600100200', first_name: 'Anna', fields: { wizyta: '10.09' }, groups: ['VIP'] }] } });
    expect(up.body.result.structuredContent.created).toBe(1);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/v1/contacts', body: [{ msisdn: '+48600100200', first_name: 'Anna', fields: { wizyta: '10.09' }, groups: ['VIP'] }] });
    const grp = await rpc('tools/call', { name: 'send_sms', arguments: { to: 'group:VIP', text: 'Hej {{imie}} {{opt_out}}', send_window: '08:00-20:00' } });
    expect(grp.body.result.isError).toBeFalsy();
    expect(calls[1].body).toMatchObject({ to: 'group:VIP', send_window: '08:00-20:00' });
    const cx = await rpc('tools/call', { name: 'cancel_message', arguments: { id: 'msg_1' } });
    expect(cx.body.result.structuredContent.status).toBe('cancelled');
    const p = await rpc('prompts/get', { name: 'reminder_sms', arguments: { cel: 'wizyta 10.09 o 14:00' } });
    expect(p.body.result.messages[0].content.text).toMatch(/wizyta 10.09/);
  });
});
