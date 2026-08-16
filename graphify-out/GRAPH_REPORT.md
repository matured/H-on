# Graph Report - Claude code  (2026-08-16)

## Corpus Check
- 28 files · ~24,857 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 216 nodes · 282 edges · 33 communities (20 shown, 13 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0a624e3a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Core Site Pages
- circulation.js API Surface
- NPM Dev Tooling Config
- Catalog Form & CRUD
- Item Detail Rendering
- Admin RPC Functions (SQL)
- Circulation RPC Functions (SQL)
- Rate Limiting (SQL)
- Catalog Shelf Rendering
- Shared Nav Injection
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
- `Membership Page` --calls--> `honDeleteMyAccount()`  [EXTRACTED]
  membership.html → js/circulation.js
- `Membership Page` --calls--> `honSignInWithEmail()`  [EXTRACTED]
  membership.html → js/circulation.js
- `Membership Page` --calls--> `honValidateCardCode()`  [EXTRACTED]
  membership.html → js/circulation.js
- `honRenderLoansTable()` --calls--> `honAdminForceReturn()`  [EXTRACTED]
  admin.html → js/circulation.js
- `honRenderAdmin()` --calls--> `honAdminIssueCard()`  [EXTRACTED]
  admin.html → js/circulation.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Admin Catalog Add/Edit CRUD Flow** — admin_honcatalogformtoitem, admin_honfillcatalogform, admin_honrendercatalogtable, admin_honrendercatalogsection, project_notes_catalog_metadata_migration [EXTRACTED 0.90]
- **Supabase-Backed Circulation Backend Build (T1-T16)** — project_notes_supabase, project_notes_supabase_migration, js_circulation_module, admin_page, membership_page [EXTRACTED 0.90]
- **Shared Site Footer Navigation Component** — about_page, catalog_page, home_page, how_it_works_page, item_page, membership_page, support_page [EXTRACTED 0.95]

## Communities (33 total, 13 thin omitted)

### Community 0 - "Core Site Pages"
Cohesion: 0.10
Nodes (36): About Page, Admin Page, Catalog / Archive Page, css/style.css, Home Page, Controlled Digital Lending (CDL), One Copy, One Reader Model, How It Works Page (+28 more)

### Community 1 - "circulation.js API Surface"
Cohesion: 0.11
Nodes (30): honRenderAdmin(), honRenderLoansTable(), honRenderMembersTable(), HON_COVER_EXTENSIONS, honAdminForceReturn(), honAdminIssueCard(), honAdminListLoans(), honAdminListProfiles() (+22 more)

### Community 2 - "NPM Dev Tooling Config"
Cohesion: 0.12
Nodes (15): jsdom, description, devDependencies, jsdom, @playwright/test, vitest, name, private (+7 more)

### Community 3 - "Catalog Form & CRUD"
Cohesion: 0.20
Nodes (13): HON_ITEM_ID_PATTERN regex, honClearCatalogForm(), honFillCatalogForm(), honHandleCoverFileChange(), honRenderCatalogSection(), honRenderCatalogTable(), honRenderImagePreview(), honUpdateAllSwatches() (+5 more)

### Community 4 - "Item Detail Rendering"
Cohesion: 0.36
Nodes (9): bindItemActions(), bindItemDots(), HON_ACTION_LOADING_LABEL, honCoverInnerHTML(), honCtaLabel(), honFriendlyError(), honGetItemIdFromURL(), honRenderItem() (+1 more)

### Community 7 - "Rate Limiting (SQL)"
Cohesion: 0.25
Nodes (3): public.check_rate_limit(), public.rate_limit_log, auth.users

### Community 8 - "Catalog Shelf Rendering"
Cohesion: 0.52
Nodes (6): honBuildFilters(), honCoverHTML(), honLayoutShelf(), honRenderShelf(), honSeeded(), honUpdateStats()

### Community 9 - "Shared Nav Injection"
Cohesion: 0.33
Nodes (3): HON_NAV_LINKS, honCurrentPage(), honInjectNav()

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

## Knowledge Gaps
- **23 isolated node(s):** `HON_ACTION_LOADING_LABEL`, `HON_COVER_EXTENSIONS`, `honState`, `USER`, `description` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Membership Page` connect `Core Site Pages` to `circulation.js API Surface`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `honRefreshMembershipView()` connect `circulation.js API Surface` to `Membership Cards Dashboard`, `Core Site Pages`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `HON_ACTION_LOADING_LABEL`, `HON_COVER_EXTENSIONS`, `honState` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Site Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.1021021021021021 - nodes in this community are weakly interconnected._
- **Should `circulation.js API Surface` be split into smaller, more focused modules?**
  _Cohesion score 0.10606060606060606 - nodes in this community are weakly interconnected._
- **Should `NPM Dev Tooling Config` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._