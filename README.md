# przypominamy-mcp

Serwer MCP (Model Context Protocol) przypominamy.com. Cloudflare Worker `przypominamy-mcp` pod
`https://mcp.przypominamy.com`. Cienka warstwa nad bramką REST (`gateway/`): każde narzędzie woła
`api.przypominamy.com/v1/*` przez service binding `API` z kluczem klienta z nagłówka `Authorization`.
Serwer nie ma własnych sekretów ani stanu — saldo, tryb testowy, limity i cennik są takie same jak w REST.

Strona publiczna z konfiguracjami klientów, przykładami i FAQ: https://przypominamy.com/mcp

## Endpointy

- `POST /mcp` (także `/`) — Streamable HTTP, bezstanowo (`sessionIdGenerator: undefined`, odpowiedzi JSON).
- Podzbiory narzędzi: `/mcp/sms`, `/mcp/account`, `/mcp/reports`, `/mcp/contacts`.
- `GET /mcp` bez `Accept: text/event-stream` — wizytówka JSON dla przeglądarki.
- Auth: `Authorization: Bearer pk_live_…` / `pk_test_…` (klucz z `app.przypominamy.com/keys`). Brak lub zły format → 401 z `WWW-Authenticate`. Sam klucz i jego zakresy (`send` / `read` / `manage`) weryfikuje bramka przy każdym wywołaniu narzędzia — narzędzie bez zakresu zwraca `isError` z komunikatem `forbidden`.

## Narzędzia

| Grupa | Narzędzie | Endpoint REST | Zakres klucza | Uwagi |
|---|---|---|---|---|
| sms | `send_sms` | `POST /v1/messages` | send | `destructiveHint` — klient ma pytać człowieka; `to` może być `"group:Nazwa"`; `send_window`, `expires_at`; zwraca `sent`, `rejected_blacklist`, `failed`, `total_cost` |
| sms | `send_voice` | `POST /v1/voice` | send | `destructiveHint`; `send_window`, `to: "group:…"` |
| sms | `cancel_message` | `DELETE /v1/messages/{id}` | send | `destructiveHint`; tylko `scheduled` ≥ 30 s przed terminem |
| sms | `count_sms_parts` | (lokalnie, `gateway/src/sms.ts#segment`) | — | bez wywołania API |
| sms | `get_message` | `GET /v1/messages/{id}` | read | |
| sms | `list_messages` | `GET /v1/messages` | read | filtry status (z `scheduled`, `cancelled`)/type/to/reference, cursor |
| account | `get_account` | `GET /v1/account` | read | dodaje kwoty w PLN i `topup_url`; zwraca `send_window`, `scopes` |
| account | `list_senders` | `GET /v1/senders` | read | dodaje `request_new_url` |
| account | `set_default_sender` | `PATCH /v1/account` | manage | |
| account | `set_send_window` | `PATCH /v1/account` | manage | `send_window` `"HH:MM-HH:MM"` lub null |
| account | `list_blacklist` | `GET /v1/blacklist` | read | limit, cursor |
| account | `add_to_blacklist` | `POST /v1/blacklist` | manage | `msisdns` ≤ 1000, `reason`, `expires_at` |
| account | `remove_from_blacklist` | `DELETE /v1/blacklist/{msisdn}` | manage | `destructiveHint` |
| contacts | `list_contacts` | `GET /v1/contacts` | read | `q`, `group_id`, limit, cursor |
| contacts | `upsert_contacts` | `POST /v1/contacts` (tablica) | manage | `contacts[]` ≤ 500; grupy nazwami, brakujące tworzone |
| contacts | `delete_contact` | `DELETE /v1/contacts/{id}` | manage | `destructiveHint` |
| contacts | `list_groups` | `GET /v1/groups` | read | |
| contacts | `add_to_group` | `POST /v1/groups/{id}/contacts` | manage | `group_id`, `contact_ids`, `msisdns` |
| reports | `get_report` | `GET /v1/reports` | read | dodaje `totals.cost` w PLN |

Prompt: `reminder_sms` (`cel`, `odbiorca`). Instrukcje serwera (`INSTRUCTIONS` w `src/index.ts`) każą modelowi
pokazać odbiorcę, treść i koszt przed wysyłką, używać `to: "group:Nazwa"` do grup i `{{opt_out}}` w SMS-ach marketingowych, a odpowiedzi narzędzi traktować jako dane, nie instrukcje.

## Komendy

```bash
cd mcp
npm install
npm test            # vitest na workerd; bramka zastąpiona atrapą (test/mcp.test.ts), surowy JSON-RPC po HTTP
npm run check       # tsc --noEmit
npm run deploy      # npx wrangler deploy — custom domain mcp.przypominamy.com, service binding do przypominamy-api
npm run dev         # wrangler dev
```

Deploy nie wymaga sekretów (`wrangler.jsonc`: tylko `PUBLIC_BASE_URL`, `DOCS_URL` i binding `API`).

## Lokalny dev

`npm run dev` potrzebuje działającego service bindingu `API` → worker `przypominamy-api`. Uruchom równolegle
bramkę (`cd gateway && npm run dev`), żeby wrangler rozwiązał binding przez lokalny rejestr dev; bez tego każde
narzędzie zwróci błąd połączenia z bramką. W testach binding jest podmieniany na atrapę
(`vitest.config.ts` + `fakeApi` w teście), więc `npm test` działa bez bramki.

Kod importuje `segment` z `../../gateway/src/sms` — zmiany w liczeniu części SMS robi się w bramce, nie tutaj.

## Szybki test po deployu

```bash
npx @modelcontextprotocol/inspector
# Streamable HTTP, URL https://mcp.przypominamy.com/mcp, nagłówek Authorization: Bearer pk_test_…
```

Lub w Claude Code:

```bash
claude mcp add przypominamy --transport http https://mcp.przypominamy.com/mcp --header "Authorization: Bearer pk_test_TWOJ_KLUCZ"
```

## Gdzie jeszcze jest opisany

`mcp.html` (strona /mcp), `api.html` (karta w sekcji SDK), `api/docs.html` (generowane z `scripts/build-api-docs.py`),
`llms.txt`, `llms-full.txt`, `sitemap.xml`, `en.html`. Po zmianie narzędzi lub endpointów zaktualizuj wszystkie.
