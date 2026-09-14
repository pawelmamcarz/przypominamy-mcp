# Przypominamy.com SMS

Hosted MCP at `https://mcp.przypominamy.com/mcp`.
Auth: env `PRZYPOMINAMY_API_KEY` (Bearer `pk_live_…` / `pk_test_…` from https://app.przypominamy.com/keys).

- Send: `send_sms` (`to`, `text`; optional `template_id`, `params`, `priority`). Voice: `send_voice`.
- Confirm recipient and body with the user before sending. These tools spend prepaid balance.
- Do not name the underlying SMS carrier in customer-facing copy.
- Test keys (`pk_test_`) only send to verified numbers.
