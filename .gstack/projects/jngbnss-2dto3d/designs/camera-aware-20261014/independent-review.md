# Independent design completeness review

Date: 2026-10-14 Asia/Seoul
Reviewer: Codex in-host subagent independent_design_completeness, fresh context, read-only.
Scope: approved original design body, actual frontend sources and faithful HTML evidence. Prior reviewer results were excluded from its prompt.
User authorization: actual clarified reply “네, 다른 AI도 한 번 검토해줘 (추천)”.
Result: completed with findings. External Claude Code unavailable; no external/cross-model coverage credit. Model identity was not reported and is unknown.

## CODEX (IN-HOST) SUBAGENT (design completeness)

Surface: **OPERATE / app UI**. Static review of the approved design body, frontend sources, and HTML evidence. The sketch explicitly marks new control placement as undecided; it does not demonstrate working reconstruction.

The approved outcomes are coherent: automatic alignment first, manual assistance when needed, protected geometry with rollback, and optional measured dimensions. The main gap is the interaction specification required to make those outcomes usable. The remedies below are **unapproved proposals**, not changes to the approved scope or four-module structure.

1. **IDC-01 — High: manual alignment lacks an actionable editing model.**
   Evidence: design lines 35–37 and 49–50 require continuous camera adjustment, corresponding landmarks, lock, exclusion, and restoration. `slots.ts:101–126` makes the entire image an upload button; `:176–208` calls scale, offset, and crop “정렬 보정.” Sketch lines 24 and 41 leave camera controls and the distinction from image rotation unresolved.
   Impact: users cannot tell whether an edit changes the photograph or the camera, and landmark selection would compete with image replacement.
   **Proposed remedy:** specify one active-photo editing state with original/reprojection evidence, separate “사진 방향·자르기” from “촬영 자세,” and define paired landmark selection, numbering, correction, and deletion. Put lock and exclude/restore beside that photo’s status, with a clear re-align action and explanation of what remains locked.

2. **IDC-02 — High: protection confirmation lacks a concrete selection journey.**
   Evidence: design lines 43–44 require two junctions plus a connection path, or a hole boundary plus through direction, followed by confirmation. Sketch lines 28 and 42 leave rotate/select/confirm/cancel unresolved. The viewer currently offers orbit controls and display toggles only (`viewer.html:10–33`, `viewer/main.ts:72–76`).
   Impact: users could confirm incomplete or incorrect protection, or become stuck without understanding why correction cannot proceed.
   **Proposed remedy:** specify distinct inspect/select modes and visible selection steps for each protection type. Show named selected parts, current step, edit/cancel, and a confirmation summary against the initial mesh. Define separate outcomes for confirmed protection, incomplete selection, invalid initial geometry, and explicitly confirmed absence of protection needs. Offer the already-approved initial-shape-only continuation at the point of failure.

3. **IDC-03 — High: partial results and recovery have no durable presentation contract.**
   Evidence: design lines 34, 41–45, and 62 require provider failure explanations, excluded-photo reasons, initial-only output, rollback, and non-success for contradictory observations. `studio/main.ts:89–94` announces “3D 모델을 생성했습니다” after every successful API response; `panel.ts:287–313` provides warnings and downloads but no distinct initial-only/rollback result status. Sketch lines 25 and 43 explicitly leave these presentations undecided.
   Impact: a usable previous mesh can look like successful correction, and users lack a clear next action.
   **Proposed remedy:** specify a persistent result banner containing outcome, displayed mesh identity, correction status, reason, and next action. Distinguish complete, review required, initial-only, rolled back, and no-model error. Link affected-photo notices to their alignment editor; label downloads with the actual mesh variant. Specify loading labels for initial generation, alignment, and correction without inventing unverified time estimates.

4. **IDC-04 — Medium: optional dimensions lack selection, validation, and confirmation details.**
   Evidence: design lines 52–53 define units and numerical behavior but not endpoint interaction or invalid-entry states. Sketch line 44 leaves point selection, value entry, confirmation, and comparison placement unresolved. The current viewer normalizes every model’s display size (`viewer/main.ts:256–263`), while results emphasize scores and file links (`panel.ts:258–313`).
   Impact: users may treat apparent display size as a measurement or mistake scale calibration for verified shape accuracy.
   **Proposed remedy:** place “실측 치수 보정 · 선택” after the core result, with an obvious skip path and “상대 크기” default status. Specify two endpoints or the approved measurement interval, its name, a visibly labeled mm field, and an apply confirmation. Define empty, nonpositive, invalid endpoint, and contradictory-measurement states. Show measured value, resulting value, and residual together; identify GLB/OBJ units beside export.

5. **IDC-05 — High: keyboard and screen-reader operation is unspecified for essential selection tasks.**
   Evidence: `viewer.html:10` has an unlabeled, unfocusable canvas; `:32` has a status paragraph without live announcement. `studio/main.ts:151–168` replaces the entire interface during mutations, risking loss of focus. Existing upload keyboard support and live toasts are useful, but do not cover landmark/protection/measurement selection.
   Impact: users relying on keyboard or assistive technology cannot complete required manual recovery and may lose their place after each edit.
   **Proposed remedy:** define focus restoration after updates, announced stage changes, selection instructions, and a keyboard-operable selection equivalent with named points and editable coordinates/selection controls. Provide selection lists with confirm/remove actions, Escape cancellation, and logical focus order. Keep failure reasons persistent instead of relying solely on disappearing toasts.

6. **IDC-06 — Medium: responsive editing behavior is unresolved.**
   Evidence: studio CSS changes five photos from three columns to one and places the sidebar below them (`studio.css:159–203`). Viewer CSS uses a full-screen canvas, wrapped fixed toolbar, fixed bottom messages, and hidden body overflow (`viewer.css:1–32`, `:59–80`). Sketch specifies breakpoints but no layout for new editing controls.
   Impact: small screens separate the photo from its corrective action; wrapped viewer controls can reduce or overlap the selection area.
   **Proposed remedy:** specify the active-photo/model workspace at narrow widths, keeping evidence and the current action together. Give long control panels a scrollable area, reserve unobscured canvas space, and preserve selection when switching photo/model views. Define touch targets and labels for the same approved operations.

## DESIGN OUTSIDE VOICES — LITMUS SCORECARD

| Check | Codex in-host | Claude Code | Consensus / evidence |
|---|---|---|---|
| Product clear | YES | Unavailable | Single-model: “5면 → 3D” states task |
| Visual anchor | YES | Unavailable | Single-model: photo stages and model canvas |
| Headline scannability | YES | Unavailable | Single-model: short input/quality/generation/result headings; new headings undecided |
| Section purpose | YES | Unavailable | Single-model: existing input, validation, generation and result jobs differ |
| Necessary cards | YES | Unavailable | Single-model: independently editable photos and action panels |
| Useful motion | NO | Unavailable | Single-model: default automatic model rotation needs pause during selection; reduced motion unspecified |
| No decorative shadows | YES | Unavailable | Single-model: bordered panels and functional toast elevation/contact shadow |

Hard rejections: reviewer reported none; no independent external confirmation. Findings remain pending review decisions; all source judgments are static.

**Recommendation: resolve the interaction and state specifications before approving a new UI layout because manual recovery, protection confirmation, and truthful partial-result presentation still lack concrete controls and completion rules.**

## Primary disposition before design passes

- IDC-01–IDC-06 are supported by missing UI contracts in the approved plan and existing source. Carry into relevant passes; agreement is evidence, not user approval.
- First decision is the photo-editing workspace placement (IA1, a subset of IDC-01). Landmark mechanics, protection journey, result presentation, measurement controls, accessibility and responsive behavior remain separate requirements.
- Existing outcome contracts stay approved. No new Codex-review product feature, new service or change to symmetry default is proposed.
- Prior hand-built HTML is a faithful source/behavior sketch only, not gstack designer output or an approved variant. Follow the skill's later DESIGN_NOT_AVAILABLE instruction: text-based passes; no further replacement variants/boards.

## Final primary disposition — 2026-10-15

This is the primary agent's approval reconciliation, not another independent review or a changed native reviewer verdict. Original findings/scorecard above are retained as historical evidence.

| Finding | Accepted specification |
|---|---|
| IDC-01 | D3/D4/D5 workspace/evidence/pairs; D10/D15/D16/D17/D22–D24 input/state treatment |
| IDC-02 | D6/D7 guidance and D18–D21 region/path/boundary/direction authoring with original protection validation/initial-only handling |
| IDC-03 | D9 persistent truthful result and D17 accessible feedback |
| IDC-04 | D8 one-span/value flow and approved D16 canonical endpoint primitive, original units/constraints |
| IDC-05 | D15–D21 focus/geometry input/feedback, D23 hit areas, D24 legibility |
| IDC-06 | D22 reflow/identity and D23 hit areas |

All are resolved as design requirements in docs/designs/camera-aware-reconstruction.md; no product implementation or successful actual UI/geometry QA is claimed. Claude Code remains unavailable. No external or cross-model coverage is added by this disposition.
