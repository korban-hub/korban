# KORBAN — Scaffold Geometry Rules

Agreed 9 September 2026. This is the specification the leg engine is built to.
Where the code and this document disagree, this document is right.

---

## 1. The perpendicular rule

**A leg tick always points perpendicular to the wall line directly in front of it.**

Never a bisector, never an averaged direction. A leg belongs to one wall and faces
that wall square. Two legs meeting at a corner therefore sit 90° apart, which is what
makes a corner read as a tight L rather than a diagonal.

---

## 2. The invisible stop

Every corner carries a limit of **`frameWidth + 1'`** measured along each wall from the
corner point.

**No leg lands beyond it, in either direction.** It is a boundary, not an offset.

The first leg of any run sits exactly on this boundary at its starting corner.

---

## 3. Sequencing

Runs resolve in order around the perimeter. **Each run starts at its free corner** — the
end away from the previously placed run — and marches toward the junction.

This is not cosmetic. Started from the wrong end, the remainder lands mid-wall where it
means nothing and the corner connection is whatever is left over. Started correctly, the
arithmetic resolves where it actually matters.

On a closed perimeter the last wall is boxed in at both ends. It takes what is left and
the termination rules below guarantee it can always finish.

---

## 4. Marching and terminating

Legs march at nominal bay length while the distance remaining to the far boundary
exceeds 10'.

Once remaining is 10' or less:

| Remaining | Action | Result |
|---|---|---|
| 10' exactly | Leg at 10'. Lands on the boundary. | braced bay, clean |
| over 8', under 10' | Leg at the largest standard brace length that fits. | braced bay, then rail bay |
| 8' or less | **No further leg.** Rail across to the perpendicular leg that starts the next run. | rail bay |

**When the remainder is 8' or less, always rail across when closing or ending a run.**

This is the preferred outcome, not a fallback. A leg is a full stack of frames from grade
to working height - on a sixty-foot building that is ten frames, plus their braces, plates,
jacks and pins. Closing a six-foot gap with a leg to keep the drawing tidy costs real money
for no gain. Stretching plank and rail across to the next run saves all of it.

**It always resolves.** There is no failure state and no warning. Anything 8' or under is a
legal unbraced span under Cal-OSHA, so the largest-brace-that-fits rule always lands.

---

## 5. Bastard bays and rail bays

Two different things, and confusing them gets the material wrong.

### Bastard bay

**A real bay at a non-standard length.** Legs at both ends, any length, and because no
fixed brace is made to fit it, it takes **guardrail in place of cross braces**.

Standard bay lengths are the brace lengths available: 4', 5', 6', 7', 8', 10'. Anything
else is a bastard bay.

### Rail bay

**Not a bay at all.** No far leg. Plank stretched from the last leg of a run across to the
perpendicular leg that starts the next run, with **guardrail on the open side running the
same distance as the span**.

Occurs at any distance from 0 to 8', and is the preferred way to close a run.

| | Legs bought | Bracing | Deck |
|---|---|---|---|
| Braced bay | 1 | fixed cross braces | planks |
| Bastard bay | 1 | guardrail | planks |
| Rail bay | **0** | guardrail, open side | planks |

The saving is the point. A rail bay buys plank and rail and nothing else - no frames, no
plates, no jacks, no pins.

---

## 6. Brace selection

The brace part is set by **two** things: bay length and frame height at that jump.

| Frame height | Brace series |
|---|---|
| 3' | 02 — B42, B52, B62, B72, B82, B102 |
| 5' | 04 |
| 6'-4" | 04 — B44, B54, B64, B74, B84, B104 |

A leg made of one 6'-4" and one 3' frame takes a `B104` at the tall jump and a `B102` at
the short one. **Braces are counted per jump against that jump's frame height**, never as
one part multiplied by a total.

---

## 7. Corners

### Outside corners

The run ends on or before the invisible stop. The next run begins on the invisible stop of
its own wall. Both legs face their own wall square, 90° apart.

### Inside corners

**The scaffold does not turn.** The run stops, **1' of wall is left bare** — the Backend
wall offset — and a new perpendicular run begins.

---

## 8. Wall jogs

**Anything protruding or setting back less than 8" is ignored.** The run carries straight
past on one line.

**At 8" or more the run breaks and realigns to the new wall line.**

---

## 8b. The standoff range

The gap between the deck edge and the wall is not a single number.

| | Distance |
|---|---|
| Nominal | 1'-0" |
| Maximum working reach | 1'-8" |

**Anywhere the wall sits further than 1'-8" from the deck edge, an end bracket goes on the
nearest leg** to reach in. The worker steps onto the bracket, works that face, steps back
and carries on.

This is a measurable test rather than a judgement: walk the run, measure wall-to-deck at
each point, and anywhere it exceeds 20" needs a bracket. It is what makes an irregular
wall workable without bending the scaffold line to follow it.

End brackets hang two per frame, on the short side.

---

## 8c. Non-orthogonal walls

**Slanted walls.** The run follows the slope. Ticks stay perpendicular to *that* wall, not
to any global direction. Bay length is measured **along the wall face**, not its horizontal
projection.

**Acute corners.** The invisible stop stays at `frameWidth + 1'` along each wall regardless
of the angle between them. It does not grow at acute angles.

**Sharp V-notches.** The run does not enter them. It passes the mouths and gets as close as
it can; anywhere that leaves the wall beyond 1'-8", end brackets fill the reach. Legs near
the point still face their own wall square, which is why they fan out at odd angles.

**Sawtooth.** Shallow regular V-notches. Straight run across the peaks, brackets reaching
into each valley — the same decision as the inward bracket case, applied to angled rather
than square recesses.

---

## 9. Recesses — four strategies

Which one applies is decided by depth. Korban picks; the estimator may override, though
the goal is that overriding is never necessary.

| Depth | Strategy | Description |
|---|---|---|
| under 8" | **Ignore** | Absorbed. One line straight past. |
| 8" to about 3' | **Inward bracket** | One line of legs on the outer face. Brackets reach inward to deck the recess. |
| about 3', spannable | **Straddle** | One line bridging the pocket mouths, legs landing on the piers. Pockets planked over. |
| 3' or more, not spannable | **Double run** | Legs inside the recess *and* along the outer face. The two runs sit hard against each other so a worker steps between them. Bay logic applies inside the pocket exactly as anywhere else. |

**Straddle versus bracket** is a question of span, not depth. If the pier faces are close
enough to bridge under standard bay logic, straddle. If not, brackets.

**Double run is not stacked.** The runs are against each other and both are working
surfaces — outer wall finish from one, inner wall finish from the other.

### Bracket sizing

Two kinds, and they do different jobs.

**Side brackets** widen the deck along a bay. One per leg per jump.

**End brackets** reach off the end of a frame to pick up something out of reach — an
inset, a notch point, anything beyond the 1'-8" standoff. Two per frame.

The bracket must reach far enough to deck the recess **while maintaining the 1' offset
from the recessed wall face**. Korban picks the size that satisfies this and fills in the
material to match the run before and after the interruption.

| Bracket | Planks carried | Kind |
|---|---|---|
| BR12S | 1 | side |
| BR20S | 2 | side |
| BR30S | 3 | side |
| BR20E | 2 | end |
| BR30E | 3 | end |

---

## 10. Free-drawn runs

In edit mode the estimator can draw a run anywhere on the overlay and enter a height.

- **First leg** sits at `frameWidth + 1'` from the drawn start point.
- **Side** is decided by draw direction — legs sit to the right of travel — with a flip
  control on the run.
- **One straight segment per run.** Endpoints snap to nearby legs and run ends, which is
  how a drawn run joins the existing layout. A run that turns is two runs meeting at a snap.
- **It belongs to the elevation.** Coverage, legs, frames, planks and braces all feed the
  same totals and the same ledger. Tagged as drawn, never separated out of the counts.

---

## 11. Turnaround bays

When toggled on, adds a leg **one frame width inboard of the outer leg**.

---

## Build order

1. Brace selection by frame height — corrects a live bug where every job gets the same
   brace part regardless of makeup
2. 8" jog absorption
3. Leg placement: boundary, sequencing, marching, termination, bastard bays
4. Bay type carried per bay so bastard bays reach the ledger as guardrail
5. Standoff check — flag anywhere beyond 1'-8" and place end brackets
6. Recess strategies — bracket, straddle, double run
7. Non-orthogonal handling — slanted runs, acute corners, V-notches, sawtooth
8. Free-drawn runs
