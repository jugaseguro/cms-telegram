# Testing Checklist

Audit date: 2026-03-24

## Automated Checks

From the repo root:

```bash
npm run lint
npm run check:schema
npm run typecheck
npm run typecheck:bot
npm run test:smoke
```

Smoke against an already running server:

```bash
$env:SMOKE_BASE_URL="http://127.0.0.1:3000"
npm run test:smoke
```

What the automated suite covers today:

- web `/api/health`
- login page rendering
- schema/type drift on critical tables and columns

## Manual Test Pass

## 1. Auth and recovery

1. Run `npm run dev`.
2. Log in through `/login`.
3. Press `F5` immediately after entering the dashboard.
4. Repeat reload 3 times.
5. Minimize or hide the tab for at least 30 seconds.
6. Return to the tab.
7. Confirm the app does not freeze, loop to login, or lose the user state.

Expected:

- user remains logged in
- dashboard recovers without endless loading
- no repeated reconnect storm in the browser console

## 2. Chat runtime

1. Open `/chats`.
2. Select a conversation.
3. Send a plain text message.
4. Send an attachment.
5. Leave the tab idle for 1 to 2 minutes.
6. Return and send another message.

Expected:

- messages leave pending state
- optimistic message becomes real message
- no duplicate message entry
- realtime banner only appears if connection is truly degraded

## 3. Labels and transactions

1. Add and remove a conversation label.
2. Add and remove a customer label.
3. Register a transaction from the customer panel.
4. Reload the page.

Expected:

- each save ends in success or visible error
- changes persist after reload
- no infinite "Guardando" state

## 4. Bot admin

1. Open admin bots.
2. Create a bot with valid payload.
3. Edit the bot name, color, and welcome message.
4. Toggle it active or inactive.
5. Delete a test bot if appropriate.

Expected:

- API errors are shown cleanly
- writes survive reload
- no malformed response handling in the UI

## 5. Diagnostics

Check these endpoints:

- web: `/api/health`
- bot: `/health`
- bot: `/diagnostics`

Expected:

- each responds with JSON
- service name, time, and runtime checks are present
- bot diagnostics include bot count and socket diagnostics

## 6. Regression watchpoints

Review browser and server logs for:

- repeated auth refresh failures
- repeated reconnect loops
- duplicated `message:new` processing
- Telegram delivery timeouts
- schema drift failures in CI
