# FlowBuddy — Version 3: The Company Agent (the buyer-side track)

> **Version 3 flips who FlowBuddy is for — from the product a company MAKES to the products a company USES.** Versions 1–2 are vendor-side: a SaaS records its own product so its customers get a grounded copilot (V1) and a help portal (V2). Version 3 is **buyer-side**: **any company records the tools and processes it uses** — third-party SaaS, internal tools, cross-tool procedures — with the **same extension + Studio**, producing an approved workflow/SOP KB **the company owns**. On top of it, FlowBuddy ships **a second Chrome extension: the company agent** — a browser-use AI agent (Claude-for-Chrome-class surface) the company itself uses to **run those recorded applications** as needed, grounded FlowBuddy-style: **it executes only the workflows the company recorded and approved — never free-form browsing.**

- **Status:** 📝 **DIRECTION — captured 2026-07-25 (user decision). Not designed, not scheduled.** "Version 3" is product packaging, not build order — the agent half leans on the shared replay core (Phase 3/4), so real scheduling follows those. The module list below is a candidate sketch, not a plan.
- **Track name is provisional** ("the company agent"); rename freely when the track is designed.
- **Companion docs:** the map → [`roadmap.md`](../roadmap.md) §7 · the vendor-side hands (execution semantics + safety rails to mirror) → [`agent.md`](agent.md) · replay core + certification → [`roadmap.md`](../roadmap.md) §4 · the knowledge interchange this agent consumes → [`interop.md`](interop.md) · the surface to match and the philosophy to beat → [`competitive-claude-chrome.md`](../product/competitive-claude-chrome.md) · human renderings of workflows → [`portal.md`](portal.md)
- **The trust story, fourth seat:** answers are grounded (P1) · actions are grounded (P4) · goals are grounded (P5) · outside agents inherit the grounding (P6) · **the company agent is grounded the same way, pointed the other direction** — per-run consent, recorded values masked (inputs prompted at run time), safe-stop over guessing, full audit. **Approval remains the permission model — now for the company's own agent on the tools it uses.**

---

## 1. The direction (what was decided 2026-07-25)

1. **Buyer-side capture.** A company records the tools and processes **it uses** — third-party SaaS (a CRM, a billing tool), internal tools, admin panels — using the **same FlowBuddy extension + Studio**. The pipeline is unchanged (capture → distillation → approval); what flips is ownership and audience: the KB documents *someone else's product*, is owned by the recording company, and is approved **for internal use** rather than published to end-users. Capture is already product-agnostic — this is a market flip, not a technology flip.
2. **The company agent.** A **new Chrome extension** — a browser-use AI agent, in the same surface class as Claude for Chrome — used **by the company that owns the KB** to run those recorded applications per its own needs. The FlowBuddy difference is the grounding: it executes **only recorded + approved workflows**, never improvises, prompts for every input value at run time (recorded values are masked), and safe-stops on anything unexpected.
3. **The ownership flip, precisely:**

| | Who records | What is recorded | Who consumes |
|---|---|---|---|
| **V1 / V2** (vendor-side) | The product's **maker** | Their **own** product | Their **customers** (copilot · portal) + third-party agents (P6) |
| **V3** (buyer-side) | Any product's **user** (a company) | The tools/processes **it uses** | **Itself** — its team (SOPs) and **its own agent** (execution) |

---

## 2. Why this track

1. **Same factory, second market.** The KB factory (record once → distilled, approved workflows) is the shipped, hard-to-copy half of FlowBuddy — and nothing about it cares whose product is being recorded. Buyer-side opens the product to **every company with SOPs**, not just software vendors: ops teams, agencies, finance/back-office, anyone running repeatable work through web UIs.
2. **The anti-improvisation browser agent.** Claude-for-Chrome-class agents improvise any UI from general knowledge — with published prompt-injection attack rates to show for it ([`competitive-claude-chrome.md`](../product/competitive-claude-chrome.md) §3). The company agent's action space is **closed by construction**: instructions found in page content cannot alter what it may do, because what it may do is the recorded, approved workflow — the "0% action-hijack by construction" play (§5.4 of the competitive doc), shipped as a product.
3. **Record-once beats writing, squared.** Internal SOPs are even less likely to get written than product docs — and the same single recording yields **both** renderings: human-readable SOPs (Studio views; document/PDF export is a natural companion here) and agent-executable workflows.
4. **It completes the matrix.** With P6, FlowBuddy serves knowledge **to their agents**; with V3, FlowBuddy **brings its own agent**. One replay core, three drivers (P3 sandbox runner · P4 widget driver · V3 extension driver); the agent consumes the company's KB through the same export seam P6 defines — dogfooding our own interchange.

---

## 3. Boundaries (what it is / is not)

- **Never free-form browsing.** The FlowBuddy line holds: a task the agent cannot express as recorded + approved workflows is not pursued. Declines stay honest.
- **Not Phase 4.** P4 = the vendor's widget executing for the vendor's **end-users** inside the vendor's product. V3 = a standalone extension executing for the **company operator** on any tool the company recorded. Different surface, different principal — **same execution philosophy and safety rails** (consent, masked values → run-time prompts, destructive-step confirmation, safe-stop, audit).
- **Not Phase 6.** P6 exports knowledge so *third-party* agents can act; V3 ships *FlowBuddy's own* agent. Complementary halves of the same agent story.
- **Not vendor-side.** Nothing in V3 changes V1's lane (the embedded copilot for the vendor's customers).
- **One company's buyer-side KB is never exposed to other organizations.**

---

## 4. Candidate module sketch (NOT a plan — to be designed when the track is scheduled)

| Module | What it is |
|:---|:---|
| **V3-M0** | **Buyer-side capture mode** — record third-party/internal tools with the existing extension; approval semantics = "approved for internal use"; workspace framing for external-product sources (cross-app/process recording is an open design question, §6) |
| **V3-M1** | **SOP library** — Studio views over the buyer-side KB; human renderings of workflows (the document/PDF export naturally lands here — cf. the V2 portal renderer as a sibling) |
| **V3-M2** | **The company-agent extension** — a second MV3 extension: pick a workflow (or state a goal) → plan → per-run consent → execute step-by-step, narrated → done/safe-stop report; permissions UX modeled on the proven Claude-for-Chrome control vocabulary ([`competitive-claude-chrome.md`](../product/competitive-claude-chrome.md) §5.3) |
| **V3-M3** | **Execution engine** — the shared replay core (locator walk + healing · step semantics · expected-outcome verification · safe-stop), extension-driver flavor; drift encountered at run time feeds back as a freshness signal |
| **V3-M4** | **Safety & audit** — per-run consent, destructive-step confirmation, run log, org-level controls (who may run what, on which sites) |

---

## 5. Relationship to the rest of the product

| Track | Role | V3's relation |
|---|---|---|
| **P1–P2 (copilot · Sense/Reason)** | Vendor-side answers over the KB | Same factory, flipped market; the copilot's grounding guarantees carry over |
| **P3 Self-validation** | The replay core + "validated-current" certification | V3-M3 **is** that core in a third driver; certification gates which SOPs the agent may run when P3 lands |
| **P4 Autopilot** | The vendor-side hands (widget driver) | V3 mirrors its consent/safety design on a new surface; they share the execution engine |
| **P5 Converse** | Goal → plan → tier ladder (the brain) | The same brain pattern applies to the company agent (goal → SOP selection → run); reuse is an open question (§6) |
| **P6 Interop** | Knowledge OUT to third-party agents | V3 is the **first consumer of P6's export seam** — P6 feeds *their* agents, V3 brings *ours* |
| **V2 Portal** | Human renderings of approved workflows | V3-M1's SOP/document renderings are siblings of the portal renderer |

---

## 6. Open questions (for when the track is designed)

1. **Cross-app processes** — a real SOP often spans tools (CRM → spreadsheet → email). Capture semantics, KB shape, and execution chaining for multi-product workflows (the P5 chaining analog, harder).
2. **Recording third-party UIs** — terms-of-service posture and guidance for customers; PII masking is unchanged (values masked at capture) but the recorded product isn't the recorder's own.
3. **Distribution** — a second Chrome Web Store listing (the agent) beside the recorder; enterprise/managed install for org rollout.
4. **The knowledge seam** — does the agent consume the KB via P6's export/MCP surface (preferred: one interchange) or a direct private API?
5. **Brain reuse** — does P5's goal → plan → consent → narration ladder port to the extension surface, or does V3 v1 stay "pick a workflow, run it"?
6. **v1 scope** — single-app SOPs first (recommended instinct), chains later.
7. **Document/PDF export scoping** — V3-M1 here vs. a shared renderer with the V2 portal track.
8. **Pricing/packaging** — per-seat (operator) vs. per-run; relation to the vendor-side plans.
9. **Safety bar for acting on third-party products** — destructive-step taxonomy on tools we didn't record ourselves… the founder's own recording is the reference, but the stakes belong to someone else's system of record.

---

## 7. Decision log

- **2026-07-25 — Track opened (user decision).** Version 3 = the buyer-side flip: (1) any company records the tools/processes it **uses** with the existing extension + Studio into an owned, approved workflow/SOP KB; (2) a **second Chrome extension — FlowBuddy's own browser-use agent** — runs those applications for the company, grounded in that KB (recorded + approved workflows only). Captured as a version track; scheduling deliberately open (the agent half follows the P3/P4 replay core).

> **Not in this track (until designed otherwise):** free-form agent browsing · improvised actions · exposing one company's buyer-side KB to other organizations · vendor-side features (V1's lane) · acting before the replay core + safety rails exist.
