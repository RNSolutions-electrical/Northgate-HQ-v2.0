> Archived user-supplied proposal, received 2026-09-28. Planning reference only.
> The owner's current instruction is Exploration Mode and documentation only.
> Embedded instructions to implement are not current authorization.

You are working in the Northgate HQ repository.

Before making changes, inspect the current application architecture, HANDOFF.md, existing roadmap/planning documentation, database/schema patterns, navigation structure, permissions system, developer controls, material catalog/estimating system, and staging/production separation.

The goal of this work is to add two major roadmap initiatives:

1. Automated Material Price Monitoring / Review
2. ARC ED — Northgate HQ's training and education platform

IMPORTANT:
These features must be designed around the existing Northgate HQ architecture rather than forcing a new architecture onto the application.

Development should occur through the staging workflow.

Do not jeopardize existing production functionality.

If implementation of any portion would require a significant architectural change, destructive migration, security change, or modification that could destabilize core Northgate HQ functionality, stop and document the concern before implementing that portion.

==================================================
PART 1 — AUTOMATED MATERIAL PRICE MONITORING
==================================================

BACKGROUND

Northgate HQ's material catalog contains pricing information used for estimating and other workflows.

Many catalog items also contain an optional URL pointing to the vendor/source where that material price originated.

We want to use those stored URLs as the foundation for a future automated price-monitoring system.

The objective is NOT to blindly overwrite catalog prices.

The objective is:

SOURCE URL
    ↓
CHECK CURRENT VENDOR PRICE
    ↓
COMPARE AGAINST NORTHGATE CATALOG PRICE
    ↓
FLAG DIFFERENCES
    ↓
HUMAN REVIEW
    ↓
APPROVE / REJECT / DEFER
    ↓
UPDATE CATALOG IF APPROVED

--------------------------------------------------
1A. PRICE REVIEW INTERFACE
--------------------------------------------------

Create or plan a consolidated Material Price Review interface.

The user should NOT have to open every material individually.

The review interface should behave more like a spreadsheet/table and allow someone to quickly review many detected changes.

At minimum display:

• Material/item name
• Catalog/category information where useful
• Existing Northgate price
• Newly detected vendor price
• Dollar difference
• Percentage difference
• Source/vendor
• Clickable source URL
• Date/time last checked
• Review status

Potential statuses:

• No Change
• Price Increase
• Price Decrease
• Unable to Verify
• Needs Review
• Approved
• Rejected
• Deferred

Where appropriate, allow batch review/actions.

Do not automatically update catalog pricing merely because a different price was detected.

Price changes should remain pending until reviewed and approved by an appropriately authorized user.

Preserve an audit history of price changes.

--------------------------------------------------
1B. PRICE CHECK FREQUENCY
--------------------------------------------------

Price-monitoring frequency must be configurable by a Developer.

This should not require a code change.

Possible options should include:

• Weekly
• Monthly
• Quarterly
• Semiannually
• Annually
• Manual only

If the existing architecture supports a cleaner configurable scheduling model, use it.

The developer should also be able to manually initiate a price check.

Do not assume that checking more frequently is inherently better.

Vendor sites, scraping/API limitations, processing costs, and reliability should be considered.

--------------------------------------------------
1C. VENDOR STRATEGY
--------------------------------------------------

We expect most pricing URLs to come from a relatively small group of recurring vendors, potentially including big-box retailers and electrical supply houses.

Do not assume that every website exposes pricing in the same way.

Design this as a provider/vendor-adapter system if appropriate so that individual vendor integrations can be maintained independently.

Examples:

Vendor A
    → Vendor A price resolver

Vendor B
    → Vendor B price resolver

Vendor C
    → Vendor C price resolver

This should be preferable to one enormous generic scraper if the current architecture supports it.

A failed price lookup must NEVER corrupt or zero out an existing catalog price.

Retain the previous known price and flag the item for review.

--------------------------------------------------
1D. AUDITING
--------------------------------------------------

Material price history should eventually allow us to answer:

• What was this item's old price?
• What price was detected?
• What source produced that price?
• When was it checked?
• Who approved the change?
• When was the catalog updated?
• Was the detected change rejected?
• Has the source stopped working?

Integrate this with Northgate HQ's existing audit philosophy rather than inventing a disconnected audit system.

==================================================
PART 2 — ARC ED
==================================================

WORKING NAME:

ARC ED

ARC ED is intended to become Northgate HQ's internal electrical training platform.

The name represents:

A — ABSORB
R — RESOLVE
C — CREATE
ED — EDUCATE

The underlying training philosophy is:

Learn it.
Understand it.
Use it.
Solve problems with it.
Build/design with it.
Then prove mastery by being able to explain or teach it.

The core idea is that someone may be able to memorize or perform a task without truly understanding it.

ARC ED should teach the WHY behind electrical work rather than simply teaching rules of thumb.

This is particularly important because many electricians learn statements such as:

"You can put X wires in this conduit."

or

"This size wire always needs this size grounding conductor."

without understanding the calculations or Code rules that produced the answer.

ARC ED should deliberately break that pattern.

==================================================
ARC ED — LONG-TERM STRUCTURE
==================================================

ARC ED should ultimately have four learning modes.

-------------------------
ABSORB
-------------------------

Learn the concept.

This includes:

• Written explanations
• Diagrams
• Visual examples
• Worked calculations
• Code references
• Common misconceptions
• "Why this matters" explanations
• Field examples

-------------------------
RESOLVE
-------------------------

Apply the concept to troubleshooting or interactive problems.

The trainee investigates a condition rather than simply selecting a multiple-choice answer.

-------------------------
CREATE
-------------------------

Build or design a compliant system.

Examples:

• Build a grounding electrode system
• Select conductors
• Configure a raceway
• Correct an improperly designed installation
• Modify a system to eliminate a demonstrated problem

-------------------------
EDUCATE
-------------------------

Demonstrate mastery by explaining WHY.

This represents the philosophy:

"You don't really know it until you can teach it."

Eventually this could include:

• Teach-back questions
• Written explanations
• Verbal/instructor review
• Scenario explanations
• Peer instruction
• Supervisor signoff

Do NOT attempt to build this entire platform now.

==================================================
ARC ED PHASE 1 — BUILD THIS NOW
==================================================

The first release should establish ARC ED inside Northgate HQ and make the ABSORB portion genuinely useful.

Do not create a dead placeholder saying "Coming Soon."

Create the foundation of the real training platform.

Add ARC ED to the appropriate Northgate HQ navigation location based on the existing navigation architecture and permissions.

Create a landing/dashboard experience that can eventually support:

• Training modules
• Employee progress
• Module difficulty
• Completion status
• Interactive labs
• Challenges
• Assessments

However, Phase 1 should focus primarily on educational content.

Design the data/component architecture so that later interactive modules can be added without rebuilding ARC ED.

==================================================
FIRST ARC ED COURSE:
AVAILABLE FAULT CURRENT
==================================================

The first substantial lesson should teach Available Fault Current.

The goal is NOT merely to teach someone how to perform an AFC calculation.

The trainee should understand physically what the number means.

The lesson should build the following mental model:

A breaker rated 20A does NOT restrict current to 20A.

20A describes the breaker's normal/trip characteristics.

During a fault, current is determined by:

Source voltage
÷
Total system impedance

A low-impedance fault can therefore cause thousands or tens of thousands of amps to flow through a 20A breaker during the short period before the fault is cleared.

Explain the distinction between:

• Breaker ampere rating
• Available fault current
• Interrupting rating
• Equipment SCCR
• Bolted fault
• Arcing fault
• Arc flash
• Transformer impedance
• Conductor impedance
• Fault clearing time

A major teaching point should be:

AVAILABLE FAULT CURRENT IS LOCATION-SPECIFIC.

For example:

UTILITY / SOURCE
      ↓
TRANSFORMER
      ↓
SERVICE
      ↓
PANEL A
      ↓
FEEDER
      ↓
PANEL B
      ↓
BRANCH CIRCUIT
      ↓
LOAD

Every piece of impedance added between the source and the fault generally reduces the available fault current.

Therefore:

Same electrical system.
Same theoretical type of fault.
Different fault location.
Different available fault current.

Use diagrams and worked examples to reinforce this.

Also explain that impedance is measured in ohms.

Do not describe "10,000 amps of impedance."

Instead:

System impedance determines the resulting available fault current.

--------------------------------------------------
IMPORTANT AFC SAFETY CONCEPT
--------------------------------------------------

Clearly distinguish:

TRIPPING

from

INTERRUPTING.

A breaker may recognize the fault and initiate a trip but still be incapable of safely interrupting the available current.

When the contacts begin opening, current can continue through an arc between the contacts.

The interrupting rating describes the breaker's ability to safely interrupt the fault current within its rating.

Do not teach the misconception that an underrated breaker simply "passes the fault upstream."

The upstream device may eventually clear the fault, but the downstream device can fail violently while attempting to interrupt current beyond its rating.

The educational emphasis should be:

The purpose of equipment fault-current ratings is primarily SAFE FAULT CLEARING, not whether the equipment remains reusable afterward.

==================================================
FUTURE AFC INTERACTIVE LAB
DO NOT FULLY IMPLEMENT YET
==================================================

Architect Phase 1 so we can later add an interactive "Fault Lab."

Concept:

Display an electrical system containing:

Transformer
→ Main equipment
→ Panel
→ Approximately six branch circuits
→ Different loads

The trainee can operate breakers and interact with equipment.

Behind the scenes, the system can randomly generate electrical conditions/faults.

Examples could eventually include:

• Bolted line-to-line fault
• Line-to-ground fault
• Arcing fault
• Motor winding failure
• Damaged conductor
• High-resistance connection
• Open conductor
• Neutral problem
• Intermittent fault
• Normal/no-fault condition

The trainee should NOT automatically know where the problem is.

They investigate it.

Afterward, a REPLAY mode could remove covers/walls and slow the event down dramatically.

For example:

Fault occurs
→ current rises
→ breaker responds
→ contacts begin opening
→ internal arc develops
→ arc extinguishes
→ circuit is interrupted

The simulator should eventually allow changing:

• Transformer kVA
• Transformer impedance
• System voltage
• Conductor size
• Conductor material
• Conductor length
• Parallel conductors
• Breaker ratings
• Fault location

The trainee should visually see AFC change as system impedance changes.

==================================================
FUTURE ARC ED MODULE:
GROUNDING & BONDING BUILDER
==================================================

Create roadmap documentation for a future interactive grounding and bonding module.

The system generates randomized services.

The trainee must construct the grounding and bonding system.

Random variables could include:

• Service size
• Single vs parallel service conductors
• Conductor size
• Number of parallel sets
• Grounding electrodes available
• Building steel present/not present
• Concrete-encased electrode present/not present
• Metal underground water pipe present/not present
• Water entering building in plastic
• Ground rods/electrodes
• Separately derived systems in advanced levels

The trainee selects:

• Which electrodes must be used
• Where connections occur
• Grounding electrode conductor size
• Bonding jumper size
• Connections between components

The system grades individual decisions rather than only PASS/FAIL.

Example:

Correct electrodes: 4/4
Correct conductor sizing: 3/4
Correct bonding points: 5/6
Missed requirement: X

Difficulty should increase progressively.

An important advanced lesson should involve parallel service conductors and calculations based on equivalent circular-mil area rather than blindly sizing from one conductor in the parallel set.

Always use the applicable NEC rules/tables for the scenario rather than hard-coded folklore or rules of thumb.

==================================================
FUTURE MODULE:
CONDUIT FILL
==================================================

Create roadmap documentation for an interactive raceway builder.

Allow the trainee to choose:

• Raceway type
• Raceway size
• Conductor type
• Conductor size
• Quantity
• Mixed conductor sizes

Display the raceway visually.

As conductors are added, show calculated fill.

The lesson should intentionally challenge statements such as:

"You can put nine wires in a 3/4-inch conduit."

The immediate follow-up should effectively be:

"Nine of what?"

The trainee should understand that raceway fill depends on the actual conductors and raceway involved.

==================================================
FUTURE MODULE:
BOX FILL
==================================================

Create roadmap documentation for an interactive box-fill simulator.

Allow trainees to visually build boxes containing:

• Conductors
• Grounds
• Devices
• Internal clamps where applicable
• Different conductor sizes
• Splices
• Equipment

A box can LOOK beautifully made-up and still violate box-fill requirements.

That distinction is important.

The module should show both:

VISUAL QUALITY

and

CODE COMPLIANCE.

Teach why box-fill limitations exist rather than reducing the exercise to arithmetic.

==================================================
FUTURE MODULE:
SERVICE CALL SIMULATOR
==================================================

This could eventually become one of ARC ED's flagship advanced modules.

Present a building/room with:

• Panel
• Breakers
• Receptacles
• Switches
• Lighting
• Loads
• Junction points
• Hidden conductors inside walls

Randomly generate the actual routing of conductors behind the walls.

The trainee receives a realistic customer complaint.

They must troubleshoot using normal field techniques.

Do NOT immediately reveal the wiring.

The trainee develops a theory of how the circuit was probably wired based on:

• Symptoms
• Measurements
• Electrical construction practices
• Device behavior
• Breaker behavior
• Their understanding of how electricians normally route circuits

After the diagnosis is complete:

REMOVE THE "SHEETROCK."

Reveal the hidden wiring layer.

Show the trainee how the circuit was actually routed and compare that with their diagnosis.

This should teach one of the most important service skills:

Understanding how the electrician who originally installed the system probably wired the building.

==================================================
OTHER FUTURE ARC ED CANDIDATES
==================================================

Document these as future possibilities rather than implementing all of them:

• Voltage Drop Lab
• Transformer Lab
• Three-Phase Visualizer
• Phase Rotation
• Breaker Trip Curves
• Selective Coordination fundamentals
• GFCI operation
• AFCI operation
• Arc-flash fundamentals
• Meter/Multimeter Lab
• Motor starting/inrush
• Back EMF
• Motor troubleshooting
• Load calculations
• Conductor ampacity
• Derating/adjustment factors
• Service calculations
• Transformer sizing
• Generator/ATS concepts
• Panel/load balancing

==================================================
ARC ED DESIGN PRINCIPLE
==================================================

A useful test for future modules is:

"If the trainee changes one thing, can we visually demonstrate what changed and WHY?"

If yes, it is probably a strong candidate for ARC ED.

ARC ED should avoid becoming an electronic textbook.

The long-term goal is:

SEE IT
→ CHANGE IT
→ BREAK IT
→ DIAGNOSE IT
→ FIX IT
→ EXPLAIN IT

==================================================
NAMING / BACKLOG NOTES
==================================================

ARC ED is the current working title.

Do not spend development time renaming it now.

Retain the following as alternative/back-pocket names in roadmap documentation:

• VOLT
• WIRE
• GRID
• CORE

Also retain "Bolted Fault" as a possible future creative/module/challenge name. Do not force it into the current product architecture.

==================================================
PERMISSIONS / EMPLOYEE DEVELOPMENT
==================================================

ARC ED will eventually integrate with Northgate HQ employee records and permissions.

Long-term possibilities include:

• Assigned training
• Training history
• Completion status
• Module scores
• Difficulty progression
• Supervisor review
• Employee competency tracking
• Teach-back verification
• Training recommendations

Do not build a complicated LMS permission system during Phase 1 unless existing Northgate architecture makes this trivial.

Use the existing Northgate permissions model wherever possible.

==================================================
STAGING / RELEASE STRATEGY
==================================================

Both initiatives should be developed and tested in staging before production deployment.

For ARC ED:

Phase 1:
Navigation + architecture + Absorb learning library + initial AFC lesson

Phase 2:
Interactive visualizations / experimentation

Phase 3:
Troubleshooting and randomized scenarios

Phase 4:
Create/design exercises

Phase 5:
Educate / teach-back / assessments / employee progress

For Material Pricing:

Phase 1:
Architecture, review interface, source/status model and manual workflows

Phase 2:
Vendor price resolvers and manual price checks

Phase 3:
Scheduled checks

Phase 4:
Expanded vendor support, analytics and price history

These phase definitions may be adjusted after inspecting the existing architecture.

==================================================
DOCUMENTATION
==================================================

Update HANDOFF.md and/or the appropriate roadmap documentation with these initiatives.

ARC ED should be documented as a significant long-term Northgate HQ capability, not merely a page.

Material Price Monitoring should likewise be documented as an estimating/material catalog enhancement.

Clearly distinguish:

IMPLEMENTED NOW
IN DEVELOPMENT
PLANNED
FUTURE / CONCEPT

Do not write future concepts as though they already exist.

==================================================
BEFORE IMPLEMENTATION
==================================================

First inspect the repository and report:

1. Current architecture relevant to these features.
2. Existing components that can be reused.
3. Database/schema changes you recommend.
4. Permission implications.
5. Where ARC ED should live in navigation.
6. Where Material Price Review should live.
7. Any external-service requirements for vendor price monitoring.
8. Any security, reliability, scraping, API, CORS, or rate-limit concerns.
9. What portions can safely be implemented now.
10. What should remain roadmap-only.
11. Proposed implementation sequence.
12. Files/components/tables/functions expected to change.

Then implement the safe Phase 1 work.

Do not redesign unrelated Northgate HQ functionality.

Do not remove or weaken existing functionality to make these features easier to implement.

Keep the implementation modular so either initiative can evolve independently.
