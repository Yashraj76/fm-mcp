---
Task ID: 1
Agent: main
Task: Debug and fix application preview not loading + fix branches/deployments/servers errors + ensure settings functionality

Work Log:
- Investigated dev server logs - found the dev server process was not running
- Started dev server and confirmed all API endpoints respond with 200 (GET /, /api/servers, /api/settings, /api/stats, /api/connections)
- Verified all component files exist with correct exports (dashboard, connections, servers, branches, tools, playground, deployments, settings, dialogs)
- Identified deployment POST API bug: `branchId` was required but frontend deploy buttons didn't send it
- Fixed deployment POST API to make `branchId` optional and auto-select default branch when not provided
- Added `_count.connections` to servers GET API (was missing, causing undefined in frontend)
- Fixed branches page to handle 404 errors from stale persisted `currentServerId` - now resets to server selector
- Fixed deployments page to handle 404 errors from stale persisted `currentServerId` - now resets to server selector
- Verified Settings page is fully functional: AI provider selection (OpenAI, Anthropic, Google, Ollama, Custom), API key input with test button, rate limit/budget management with "no limit" option, model selection, temperature, AI feature toggles
- Ran lint - all clean, no errors
- Restarted dev server - all routes returning 200

Stage Summary:
- Dev server is running and responsive on port 3000
- All API endpoints verified working (200 status codes)
- Deployment flow fixed (auto-selects default branch)
- Stale state handling fixed for branches/deployments pages
- Settings page fully functional with all requested features
- Lint passes cleanly
