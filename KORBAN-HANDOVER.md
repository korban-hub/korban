# KORBAN — Handover

Written 18 September 2026, updated 21 September. Repo on `section-view-v2-current`.

Read this alongside `KORBAN-Scaffold-Geometry-Rules.md`, which holds the scaffold
rules themselves and is the authority where the two disagree.

---

## Start of session

Upload both files:

- `KORBAN-Scaffold-Geometry-Rules.md`
- this document

Then `git pull` before touching anything. Work has moved between a Mac and a
Windows PC, and a stale copy has cost real time.

---

## What KORBAN is

Estimating software for scaffold contractors that derives a bid from real
building geometry instead of judgement typed into a spreadsheet. Trace the
building, grip the elevations, and quantities fall out - frames by size, planks
by length, braces by span - priced against that company's own rates and yard.

Three depths. Quick Bid works from lengths and heights per side. Full Bid adds a
traced plan and gripped elevations. Korban Bid adds sections drawn against the
wall.

The distinction that matters: **Korban derives the numbers, it does not collect
them.** The part ledger is the clearest expression of that - a part number is
written by whoever actually knows it, and nothing downstream is permitted to
guess.

---

## Working practices

**Terminology is not negotiable.** Jump, not lift. Frames per leg, never "stack".
Bay, leg, deck. Scaffold frame, never "H frame". Mobilization, US spelling. Bid
level, not bid depth.

**One file per message when uploading.** Several files named `page.tsx` overwrite
each other and the work is lost.

**Libs before pages.** A page importing a store that has not landed yet fails to
compile, and the resulting blank screens look like a dozen unrelated faults.

**Put the number on screen before guessing at it.** This is the single most
useful lesson of the project.

- Four rounds were spent guessing why measurements were ten times too large.
  Printing the resolved scale as `px/ft` showed 1.6 on a sheet where a storey is
  several hundred units, and the cause was obvious in one glance: the dimension
  input stripped every non-digit, so `21'-2"` became `212` feet.
- The same again with a load list showing `B82` on a ten-foot bay. No amount of
  fixing the brace logic changed it, because the part numbers were typed
  directly into the panel and only the quantities were live.
- And again with an "app-wide disconnect" that turned out to be a missing file:
  `lib/planStore.ts` was never created, so the whole app failed to build and
  every page looked broken in a different way.

**Verify geometry on paper before it reaches the screen.** Every rule in the
geometry spec was checked by printing leg positions and spans across hundreds of
wall lengths before any of it was rendered. That caught the corner rule being
inverted, and it caught a termination rule that left gaps over the Cal-OSHA
limit.

**Ask before building anything with a rule behind it.** The corner rule took four
attempts because it was built before it was understood. The recess strategies
took one, because they were drawn out first.

---

## Architecture

**Stack.** Next.js 16.2.6, Turbopack, React, TypeScript, Tailwind v4.

**Storage.** Browser only. No backend, no accounts, no database.
- `localStorage` - projects, elevations, backend settings, estimate state
- `IndexedDB` (`lib/planStore.ts`) - uploaded plan sheets, which are far too
  large for localStorage

**The stores.**
- `lib/projectStore.ts` - projects, elevations, geometry, the part ledger, the
  quantity engine, the section layout engine
- `lib/backendStore.ts` - company settings, rates, material rules, the 92-part
  stock catalogue, finish rules, alternate pricing
- `lib/estimateState.ts` - session state shared between Estimate and Margin Review
- `lib/alternates.ts` - the six add-alternates, all computed from the takeoff
- `lib/planStore.ts` - plan sheets in IndexedDB
- `lib/presentationLink.ts` - encodes a bid presentation into a shareable URL

**The flow.** Splash → login → Bid Room → new project → Plan Desk → Takeoff →
Set Scaffold → Korban Review → Estimate → proposal. Nothing skips a step.

---

## The part ledger

`elevation.partLedger` - entries carrying a part number, a quantity and **the
source that wrote it**.

`writeLedgerEntries(elevation, source, entries)` replaces everything from one
source and leaves the rest alone, so Set Scaffold rewriting frames does not
disturb the section view's brackets or an alternate's toe boards.

`readLedger(elevation)` folds every source into one part-per-line list. That is
what the load list, the inventory page and the material panels read.

**Nothing infers a part number from another page's data.** That rule exists
because breaking it put `FO6L3` on every job regardless of scaffold width.

---

## What works

**Takeoff Workspace** - PDF upload with rotation, scale locking, floor tracing,
elevation gripping, three bid levels, guided walkthrough with the described
control glowing, reference-point snapping, measurement tool, level colours with a
picker, outline copying between levels. Plan sheets and all traced work survive
leaving the page. Save Work with a saved marker, and a way to clear a takeoff and
start over.

**Set Scaffold** - leg placement to the corner rule, interior and exterior
placement, level runs where a floor deviates from the key line, recess strategies,
drawn runs, measurement tool, part ledger, printable drawing sheet with a title
block.

**Estimate** - rentals, labour, travel from truck loads, six alternates each
computed from the takeoff, live proposal sheet, animated bid presentation,
shareable link, PDF export.

**Backend** - nine tiles plus a full-page material catalogue.

**Bid Room, Plan Desk, Bid/Job Log, Contacts, Inventory, Load List, Compose.**

---

## Section view — built, not yet seen working

This is the next piece of work and the last big feature.

### What it is

A drawing, not a calculator. The material is already decided by the floor plan,
the level rules and the recess strategies. The section shows a project manager
what that looks like standing against the wall.

It is local - one slice, wherever the architect cut through the building. A
section may represent an isolated unusual area rather than the whole job.

### How it works

1. The estimator pulls a section sheet from the plan set, the same way they pull
   a floor plan or an elevation.
2. **The section tab carries its own scale.** Sections are drawn at a different
   scale to plans, and measuring a profile against the plan's scale produces a
   building several times the real size.
3. They trace the outer profile of the building in section.
4. Korban lays the scaffold out against it.

### The layout rule

**The scaffold runs plumb. The wall does not.**

The leg sits **one foot off the outermost face of the finished wall**, running
the full height. Everything recessed behind that is reached with a bracket, sized
so the deck it carries still holds its foot of clearance off that face.

Frames per leg come from the plan - the section does not recalculate them.

### Already built

`layoutSection()` in `lib/projectStore.ts`. Takes the traced profile, the section
scale, frames per leg, scaffold width and planks per deck; returns positioned
drafting items. Verified against a wall stepping back twice - brackets appear at
exactly those jumps and nowhere else.

`SectionDraftingItem` carries kind, variant, level, position, a second point for
dimensions, a label, and whether Korban or the estimator placed it. A re-layout
replaces Korban's pieces and never touches the estimator's.

`sectionView.pageUnitsPerFoot` and `scaleLabel` exist on the elevation.

### Built on 20 September - untested

**Takeoff** saves every traced section with its own scale, side, offset and
profile, and restores them on return. Profiles stay in the sheet's page units;
converting to feet in Takeoff and again in Set Scaffold is how a wall ends up
the wrong size.

**Set Scaffold** has a section picker, one button per cut, and a new
`components/section-drawing.tsx`. Korban lays each section out from its traced
profile and draws it in drafting style - double-line frame profiles, hockeys,
boards with edges, bracket triangles, jack and plate and mudsill as separate
pieces, hatched wall, dimension string with extension lines, callouts on
angled leaders.

**Edit** turns every piece into an object: drag, delete, a material bank, and
a dimension tool with 90/0, vertical, horizontal and free snapping. Korban's
pieces render grey, the estimator's cyan. Only the estimator's are stored;
Korban's are laid out fresh each time so a configuration change shows up.

**Seen working on 21 September** and corrected through several rounds: the leg
was being set off the deepest point of the wall rather than the outermost, which
flipped the drawing and put a bracket on every jump. Since fixed, along with the
rules in specification section 12 - the 8' access rule, smallest-bracket sizing,
second runs on a ledge with tied floating legs, bearing on a ledge rather than
below it, and planks bridging a double run.

Still unseen: the edit tools as they now stand - the material bank with grouped
frame sizes, Delete and Escape, pan and wheel zoom, snapping to every endpoint,
and dimensions that move by either end.

---

## The process review — 21 September

The whole flow was mapped mechanically: every page's reads, writes and routes
against the stores. The flow itself is wired properly - Bid Room, Plan Desk,
Takeoff, Set Scaffold, Korban Review, Estimate, Margin Review and Compose all
connect, and only Takeoff and Set Scaffold write geometry, which is right.

Three real problems, worst first. **None of them are fixed yet.**

### 1. The price and the load list count the job differently

**The Estimate prices from `quantityEngine`. The Load List reads the
`partLedger`.** The engine works from linear feet divided by bay length; the
ledger counts what Set Scaffold actually laid out - real legs, level runs, drawn
runs, recesses, section pieces. The ledger was changed to count from the plan;
the Estimate never followed.

So the yard can load a different scaffold from the one the customer is paying
for, and neither page says so.

**Proposed, awaiting the owner's decision:** the ledger becomes the single
count. The engine stays as the first estimate on a Quick Bid, where there is no
plan to lay out, but once a takeoff exists the price comes from the same list
the yard loads.

### 2. Quick Bid saves nothing

The form has no `saveActiveElevation`, no store field, no storage of any kind -
and there is no quick-bid record in the store. Everything typed into it is gone
when the page is left, and never reaches the Estimate.

**Agreed fix:** Quick Bid writes lineal feet and heights onto the same elevation
record the other tiers use, so the Estimate prices it identically.

### 3. Wall height is typed twice

Gripping an elevation sets the wall height. The Section tab has its own **Top of
Wall Ht.** field, typed by hand, which Set Scaffold never reads.

**Agreed fix:** it shows the gripped height with worker reach from Backend
applied, and is not typed. Backend's setting applies everywhere working scaffold
height is considered.

---

## First thing next session

Set Scaffold, Overlay / Takeoff tab, look at the **Built from** panel.

- **Job** shows the project name - the disconnect is fixed. Trace a section in
  Takeoff and the new drawing should appear in Set Scaffold's Section View tab.
- **Job** reads *recovered - was missing* - the store had lost the active
  project and it has now been re-pointed. Same next step.
- **Job** reads *no project* while Takeoff shows a named job - the fix did not
  reach the cause. Read the write path end to end rather than guessing.

---

## Open work

### Geometry spec

- **Standoff check** - anywhere the wall sits further than 1'-8" from the deck
  edge, an end bracket on the nearest leg. Specified in section 8b, not built.
- **Non-orthogonal walls** - slanted runs with ticks square to the slope, acute
  corners, V-notches, sawtooth. Section 8c, not built.
- **Rail and bastard bays reaching the ledger as guardrail** rather than fixed
  brace. The bay kinds are tracked in `BaySpan` but never written to material.

### Unverified

- **Level-run legs.** The tick direction was corrected to use each level's own
  outline rather than the key one. Never confirmed against real traced levels.
- **Recess strategies.** Built and verified on seven synthetic shapes, never run
  against a real plan.

### Elsewhere

- **Margin Review** - still the flat pre-treatment version. Two questions never
  settled: what misc revenue and cost are for, and the rentals direct-cost basis,
  which currently uses a placeholder of 40% of rental revenue.
- **Legacy routes** - six dead folders and eleven suppressed type errors, with
  `ignoreBuildErrors: true` in `next.config.ts`. Cleaning this restores type
  checking across the project.
- **The old handoff document** needs rewriting against the real page map.
- **Tests.** `lib/scaffoldGeometry.ts` and its test file were written and pass -
  thirty-two checks including sweeps across every wall length from 15' to 300'.
  They were deliberately held back until the rules settled. Worth adding now that
  they have.

### Blocked on the owner

- News and market API keys for the Bid Room
- Maps API for travel distance and satellite tracing in Full Bid
- Email provider for the message centre
- Video export of the bid presentation needs a render service

---

## Things that were wrong and are not any more

Worth knowing, because each was expensive and each has a lesson.

**`21'-2"` read as 212 feet.** The dimension input stripped every character that
was not a digit or a dot. Everything measured afterwards came out ten times too
large. Fixed by a parser that reads dimensions the way an estimator writes them.

**Part numbers typed into the material panel.** Only the quantities were live, so
no amount of fixing the brace logic changed what the panel showed. Both panels
now read the ledger.

**The corner rule inverted.** Runs started four feet *inside* each corner instead
of a leg floating four feet *past* it, leaving every corner of the building bare.

**Legs drawn against the wrong wall.** The renderer looked each wall up by index
against the raw outline while the legs were computed against the simplified one.
The moment a jog was absorbed, the indices stopped lining up. The wall geometry
now travels with the legs.

**The 3D freezing the browser.** The canvas was hidden behind an `<img>` receiving
a JPEG of every fifth frame - a full GPU readback and encode on the main thread,
twelve times a second.

**Takeoff losing everything on navigation.** There was no restore at all. The data
was being written correctly and never read back.

**Takeoff and Set Scaffold reading different projects.** Takeoff showed a named
job with traced levels; Set Scaffold, moments later, showed no project at all.
Two causes found. `ensureBase()` replaced the entire project store with one
hardcoded record whenever the storage key was missing - destroying every bid
and leaving the active id pointing at nothing. And `getActiveProject` fell back
to a blank record without saying so. Both fixed, and Set Scaffold's Built from
panel now shows the Job, the Elevation, and whether either was substituted.
**Not yet confirmed as the cause** - the next test should show it.

**Brace parts ignoring frame height.** `B104` is a ten-foot bay on a 6'-4" frame,
`B102` the same bay on a 3' frame. Braces are counted jump by jump against that
jump's frame, never one part multiplied by a total.

---

## A note on the owner

He is a working scaffold estimator with twenty years in the trade. The rules in
the geometry spec come from jobs actually bid and built, not from research.

When he says something is wrong, it is wrong - even when the code looks right.
Several times the code *was* right and the fault was somewhere neither of us was
looking.

He prefers complete batches over incremental drops, because switching files
repeatedly loses track of what has been applied. He would rather talk a rule
through completely than have it built early and corrected four times.
