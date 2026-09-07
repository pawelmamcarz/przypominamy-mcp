# przypominamy-mcp

Serwer MCP (Model Context Protocol) przypominamy.com. Cloudflare Worker `przypominamy-mcp` pod
`https://mcp.przypominamy.com`. Cienka warstwa nad bramką REST (`gateway/`): każde narzędzie woła
`api.przypominamy.com/v1/*` przez service binding `API` z kluczem klienta z nagłówka `Authorization`.
Serwer nie ma własnych sekretów ani stanu — saldo, tryb testowy, limity i cennik są takie same jak w REST.

Strona publiczna z konfiguracjami klientów, przykładami i FAQ: https://przypominamy.com/mcp

## Endpointy

- `POST /mcp` (także `/`) — Streamable HTTP, bezstanowo (`sessionIdGenerator: undefined`, odpowiedzi JSON).
- Podzbiory narzędzi: `/mcp/sms`, `/mcp/account`, `/mcp/reports`.
- `GET /mcp` bez `Accept: text/event-stream` — wizytówka JSON dla przeglądarki.
- Auth: `Authorization: Bearer pk_live_…` / `pk_test_…` (klucz z `app.przypominamy.com/keys`). Brak lub zły format → 401 z `WWW-Authenticate`. Sam klucz weryfikuje bramka przy pierwszym wywołaniu narzędzia.

## Narzędzia

| Grupa | Narzędzie | Endpoint REST | Uwagi |
|---|---|---|---|
| sms | `send_sms` | `POST /v1/messages` | `destructiveHint` — klient ma pytać człowieka |
| sms | `send_voice` | `POST /v1/voice` | `destructiveHint` |
| sms | `count_sms_parts` | (lokalnie, `gateway/src/sms.ts#segment`) | bez wywołania API |
| sms | `get_message` | `GET /v1/messages/{id}` | |
| sms | `list_messages` | `GET /v1/messages` | filtry status/type/to/reference, cursor |
| account | `get_account` | `GET /v1/account` | dodaje kwoty w PLN i `topup_url` |
| account | `list_senders` | `GET /v1/senders` | dodaje `request_new_url` |
| account | `set_default_sender` | `PATCH /v1/account` | |
| reports | `get_report` | `GET /v1/reports` | dodaje `totals.cost` w PLN |

Prompt: `reminder_sms` (`cel`, `odbiorca`). Instrukcje serwera (`INSTRUCTIONS` w `src/index.ts`) każą modelowi
pokazać odbiorcę, treść i koszt przed wysyłką i traktować odpowiedzi narzędzi jako dane, nie instrukcje.

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
