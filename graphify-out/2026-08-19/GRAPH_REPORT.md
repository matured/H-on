# Graph Report - Claude code  (2026-08-19)

## Corpus Check
- 32 files · ~26,864 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 232 nodes · 298 edges · 37 communities (21 shown, 16 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `58bf81f2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Core Site Pages
- circulation.js
- NPM Dev Tooling Config
- honRenderCatalogSection
- Item Detail Rendering
- Admin RPC Functions (SQL)
- Circulation RPC Functions (SQL)
- Rate Limiting (SQL)
- Catalog Shelf Rendering
- main.js
- Notifications (SQL)
- New User Profile Trigger
- Core Circulation Schema
- Row-Level Security Policies
- Circulation Unit Tests
- Project Overview Concepts
- Membership Cards Dashboard
- Rate Limit Log Pruning
- Account Deletion (SQL)
- Product Philosophy Principles
- Playwright Test Config
- RLS Verification Test
- Donation Flow E2E Test
- gstack Skill Suite
- Skill Routing Rules
- Queue / Waitlist Mechanic
- Items Table
- create-checkout-session/index.ts
- public.contributions
- stripe-webhook/index.ts
- 20260817000000_waitlist_requests.sql

## God Nodes (most connected - your core abstractions)
1. `Membership Page` - 15 edges
2. `Catalog / Archive Page` - 12 edges
3. `honRenderCatalogSection()` - 10 edges
4. `Admin Page` - 9 edges
5. `Home Page` - 9 edges
6. `js/main.js` - 9 edges
7. `honGetCurrentUser()` - 8 edges
8. `css/style.css` - 8 edges
9. `js/circulation.js` - 8 edges
10. `honRefreshMembershipView()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `honRenderCatalogSection()` --calls--> `honFetchCatalog()`  [EXTRACTED]
  admin.html → js/circulation.js
- `honRenderLoansTable()` --calls--> `honEscape()`  [EXTRACTED]
  admin.html → js/circulation.js
- `honRenderMembersTable()` --calls--> `honEscape()`  [EXTRACTED]
  admin.html → js/circulation.js
- `Membership Page` --calls--> `honSignInWithEmail()`  [EXTRACTED]
  membership.html → js/circulation.js
- `Membership Page` --calls--> `honDeleteMyAccount()`  [EXTRACTED]
  membership.html → js/circulation.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Admin Catalog Add/Edit CRUD Flow** — admin_honcatalogformtoitem, admin_honfillcatalogform, admin_honrendercatalogtable, admin_honrendercatalogsection, project_notes_catalog_metadata_migration [EXTRACTED 0.90]
- **Supabase-Backed Circulation Backend Build (T1-T16)** — project_notes_supabase, project_notes_supabase_migration, js_circulation_module, admin_page, membership_page [EXTRACTED 0.90]
- **Shared Site Footer Navigation Component** — about_page, catalog_page, home_page, how_it_works_page, item_page, membership_page, support_page [EXTRACTED 0.95]

## Communities (37 total, 16 thin omitted)

### Community 0 - "Core Site Pages"
Cohesion: 0.10
Nodes (36): About Page, Admin Page, Catalog / Archive Page, css/style.css, Home Page, Controlled Digital Lending (CDL), One Copy, One Reader Model, How It Works Page (+28 more)

### Community 1 - "circulation.js"
Cohesion: 0.09
Nodes (33): honRenderAdmin(), honRenderLoansTable(), honRenderMembersTable(), honAdminForceReturn(), honAdminIssueCard(), honAdminListLoans(), honAdminListProfiles(), honAdminSetBanned() (+25 more)

### Community 2 - "NPM Dev Tooling Config"
Cohesion: 0.12
Nodes (15): jsdom, description, devDependencies, jsdom, @playwright/test, vitest, name, private (+7 more)

### Community 3 - "honRenderCatalogSection"
Cohesion: 0.22
Nodes (12): HON_ITEM_ID_PATTERN regex, honClearCatalogForm(), honFillCatalogForm(), honHandleCoverFileChange(), honRenderCatalogSection(), honRenderCatalogTable(), honRenderImagePreview(), honUpdateAllSwatches() (+4 more)

### Community 4 - "Item Detail Rendering"
Cohesion: 0.36
Nodes (9): bindItemActions(), bindItemDots(), HON_ACTION_LOADING_LABEL, honCoverInnerHTML(), honCtaLabel(), honFriendlyError(), honGetItemIdFromURL(), honRenderItem() (+1 more)

### Community 7 - "Rate Limiting (SQL)"
Cohesion: 0.25
Nodes (3): public.check_rate_limit(), public.rate_limit_log, auth.users

### Community 8 - "Catalog Shelf Rendering"
Cohesion: 0.52
Nodes (6): honBuildFilters(), honCoverHTML(), honLayoutShelf(), honRenderShelf(), honSeeded(), honUpdateStats()

### Community 9 - "main.js"
Cohesion: 0.32
Nodes (4): HON_NAV_LINKS, honCurrentPage(), honInjectNav(), honMaybeShowAdminLink()

### Community 10 - "Notifications (SQL)"
Cohesion: 0.29
Nodes (3): public.notifications, auth.users, public.items

### Community 11 - "New User Profile Trigger"
Cohesion: 0.33
Nodes (4): public.handle_new_user, on_auth_user_created, public.profiles, auth.users

### Community 12 - "Core Circulation Schema"
Cohesion: 0.60
Nodes (5): public.items, public.library_cards, public.loans, public.queue_entries, auth.users

### Community 13 - "Row-Level Security Policies"
Cohesion: 0.40
Nodes (4): public.loans, public.queue_entries, public.item_availability, public.items

### Community 14 - "Circulation Unit Tests"
Cohesion: 0.60
Nodes (3): USER, chainable(), createMockSupabase()

### Community 15 - "Project Overview Concepts"
Cohesion: 0.50
Nodes (4): Continuous Random Flicker Splash Animation, SQL-Based E2E Race-Condition Tests (T16), 本 (hon) Project, Supabase Backend

### Community 33 - "create-checkout-session/index.ts"
Cohesion: 0.50
Nodes (3): CORS_HEADERS, stripe, supabase

## Knowledge Gaps
- **28 isolated node(s):** `honState`, `HON_ACTION_LOADING_LABEL`, `USER`, `description`, `name` (+23 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Membership Page` connect `Core Site Pages` to `circulation.js`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `honRefreshMembershipView()` connect `circulation.js` to `Membership Cards Dashboard`, `Core Site Pages`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `honState`, `HON_ACTION_LOADING_LABEL`, `USER` to the rest of the system?**
  _28 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Site Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.1021021021021021 - nodes in this community are weakly interconnected._
- **Should `circulation.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0945945945945946 - nodes in this community are weakly interconnected._
- **Should `NPM Dev Tooling Config` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._