# Design QA — Issue #60 UI/UX redesign

## Comparison target

- Source visual truth: `C:\Users\SSAFY\.codex\generated_images\01a018db-0b48-7723-9ab4-c072b3d2befe\exec-5cc5e0f1-66f1-42b3-9adc-e28f8636ec5f.png`
- Rendered implementation: `C:\Users\SSAFY\Desktop\Ko\exammoa\implementation-home-desktop.png`
- Full-view comparison: `C:\Users\SSAFY\Desktop\Ko\exammoa\design-qa-comparison.png`
- Focused comparison: `C:\Users\SSAFY\Desktop\Ko\exammoa\design-qa-focus.png`
- Responsive evidence: `C:\Users\SSAFY\Desktop\Ko\exammoa\implementation-home-mobile.png`
- Route/state: `/`, light theme, 2026-08-19, 관심 시험 3개, 접수 중 데이터가 있는 상태

## Viewport and normalization

- Source pixels: 1487 × 1058.
- Implementation browser CSS viewport: 1440 × 1024, `devicePixelRatio: 1`.
- Implementation screenshot pixels: 1425 × 1013. Browser scrollbars account for the difference from the requested CSS viewport.
- Full-view normalization: both images were bicubic-normalized to 1425 × 1013 and placed side by side in one comparison image.
- Mobile verification viewport: 390 × 844 CSS px. Home, 탐색, 상세, 캘린더 모두 `scrollWidth <= innerWidth`; the persistent calendar control remained within the viewport.

## Full-view comparison evidence

The second-pass comparison preserves the approved composition: logo/search/calendar header, greeting and date row, 8-category grid, three-row open-registration panel, and full-width three-row favorites table. The implementation's live category taxonomy and current exam data differ from the static concept copy, but the hierarchy, density, proportions, and interaction placement remain equivalent.

Required fidelity surfaces:

- Fonts and typography: Pretendard-first system sans stack, restrained 400/550/650/750 weights, matching title/section/body hierarchy, tabular dates, and no visible clipping at the desktop target.
- Spacing and layout rhythm: page width increased to 1376px so the 1440px composition keeps approximately 32px outer margins; panel proportions, 8-tile grid, row density, radii, dividers, and vertical rhythm now align with the approved target.
- Colors and tokens: warm `#F7F8F5` canvas, white surfaces, `#16232C` ink, and restrained `#137D78` teal map to the approved comfortable/minimal direction. Status fills remain readable without relying on color alone.
- Image quality and asset fidelity: open-registration provider marks use official YBM and Q-Net SVG assets. No custom inline SVG, emoji, CSS drawing, or placeholder logo is used. Interface icons use one Phosphor outline family.
- Copy and content: static guidance copy matches the approved direction. Category names and exam rows intentionally use the repository's real taxonomy and current data rather than hard-coded mock content.
- Accessibility and behavior: semantic links/buttons, visible focus rings, labelled icon controls, 44px mobile targets, `aria-pressed` favorites, and text status labels are present.

## Focused region comparison evidence

`design-qa-focus.png` compares the open-registration panel and favorites table at readable scale. It confirms provider-logo treatment, status badges, row dividers, label hierarchy, table columns, and calendar actions after the fixes below.

## Comparison history

### Pass 1 — blocked

- [P2] Header search was constrained to 380px and used a neutral border, materially changing the approved header proportions.
  - Fix: removed the inherited 380px cap, restored a 680px search track, and applied the approved teal border.
- [P2] Provider logos were replaced by generic category icons.
  - Fix: added official YBM and Q-Net SVG assets and mapped current agencies to those marks.
- [P2] Favorites-table calendar action was implemented as a detail chevron.
  - Fix: restored the visible calendar column and linked each row to a one-exam calendar state.
- [P2] Open-registration rows included an extra favorite action not present in the approved composition.
  - Fix: removed the extra star and kept the single detail chevron.
- [P2] The 720px minimum-width favorites table increased the 390px mobile document width to 703px.
  - Fix: contained desktop overflow, reduced the mobile table to essential columns, removed the mobile minimum width, and verified all four primary routes at 390px.

### Pass 2 — passed

- Post-fix full and focused comparisons show no remaining actionable P0/P1/P2 mismatch.
- Accepted product constraint: category labels and exam names reflect current structured data, so they do not duplicate the static concept's sample taxonomy or dates.

## Primary interactions tested

- Header search for `정보처리기사` navigates to `/exams?q=정보처리기사` and renders results.
- `IT · 개발` category tile navigates to `/exams?category=it`.
- Favorites-table calendar button navigates to a calendar URL containing exactly that exam and renders one selected chip.
- Earlier route checks also covered open-status filtering, exam detail navigation, and multi-favorite calendar comparison.
- Browser console warnings/errors checked after final interactions: none.

## Findings

No actionable P0, P1, or P2 findings remain. No focused-region fidelity gap remains that blocks handoff.

## Implementation checklist

- [x] Approved header action (`시험 찾기`) removed.
- [x] Approved desktop composition implemented with live data.
- [x] Favorites persistence and calendar handoff implemented.
- [x] Official provider assets and consistent icon library applied.
- [x] Desktop and mobile route verification completed.
- [x] 742 tests, TypeScript check, CI gate, and production build passed.

final result: passed
