# House hero design QA

## Source truth

- State-page reference: `/var/folders/v9/fdxck81j7x7grf7fdqrs83h80000gp/T/codex-clipboard-209c98cb-b373-4c94-b84e-c98f549f95f8.png`
- Previous House hero: `/var/folders/v9/fdxck81j7x7grf7fdqrs83h80000gp/T/codex-clipboard-066a2bf2-bdae-438c-9c59-ae6fbefff9ad.png`
- Implementation capture: `/Users/aybas/.codex/visualizations/2026/08/14/01a000dc-2a39-78c3-8df9-8f74a1fce54f/house-hero-implementation-1440x900.png`
- Combined comparison: `/Users/aybas/.codex/visualizations/2026/08/14/01a000dc-2a39-78c3-8df9-8f74a1fce54f/state-reference-and-house-implementation.png`

## Capture conditions

- Page: `house.html?year=2024&w=0`
- Desktop viewport: 1440 × 900 CSS pixels
- Implementation screenshot: 1440 × 900 pixels
- State reference screenshot: 2848 × 1272 pixels
- Compared state: hand-drawn annotations revealed after the first scroll threshold

## Visual comparison

- Typography: the House title now uses the same large editorial serif hierarchy as the State title.
- Color: ink, red, and blue follow the State hero’s ordering and contrast.
- Illustration: the existing two-party hand-drawn delegation artwork is reused at the right, with its native aspect ratio preserved.
- Marks: the bundled blue oval and red underline reuse the State page’s exact assets, placement logic, scroll reveal timing, and reduced-motion fallback.
- Structure: the dark House banner and hero coverage card are removed. The open paper background, question, two actions, and lower divider now mirror the State opening.
- Intentional differences: House-specific language, active House navigation, and the House controls immediately below the hero remain distinct.

## Responsive and interaction checks

- 1440 × 900: balanced two-column hero; no clipping or horizontal overflow.
- 1024 × 768: two-column layout remains legible; artwork retains its aspect ratio.
- 430 × 932, 390 × 844, and 320 × 568: artwork hides, title and question reflow cleanly, buttons remain at least 54px tall, and page width stays within the viewport.
- The primary hero action lands on `#houseControls` with the sticky-header offset respected.
- The hand-drawn marks are initially hidden, reveal after scrolling, and remain visible thereafter.
- Browser console: no warnings or errors.

## Iteration history

1. Replaced the dark split-panel hero with the State page’s open editorial composition.
2. Removed the duplicated hero coverage summary while preserving the detailed panel-coverage meter lower on the page.
3. Tuned title sizes and mobile spacing after desktop, tablet, and compact-phone comparison.
4. Replaced the slogan-like draft with the descriptive title “See how state delegations shape the House” and a direct model question.

final result: passed

---

# Footer author-links design QA

## Source truth

- User-selected footer: `/var/folders/v9/fdxck81j7x7grf7fdqrs83h80000gp/T/codex-clipboard-46e3a710-6d8e-4836-8c9d-8f3b8e16e51e.png`
- State implementation crop: `/Users/aybas/.codex/visualizations/2026/08/14/01a000dc-2a39-78c3-8df9-8f74a1fce54f/footer-authors-implementation.png`
- Combined source and implementation comparison: `/Users/aybas/.codex/visualizations/2026/08/14/01a000dc-2a39-78c3-8df9-8f74a1fce54f/footer-authors-source-vs-implementation.png`

## Visual comparison

- The right-side explanatory sentence and obsolete methods link are replaced by the three paper authors in one compact row.
- Yunus C. Aybas and Oğuzhan Çelebi use clearly underlined personal-site links; Surabhi Dutt remains plain text because no personal website is available.
- Gold separators preserve the footer’s existing ink, paper, teal, and gold visual system without competing with the brand lockup.
- The footer remains compact at desktop widths and wraps safely below the brand on small screens.

## Responsive and interaction checks

- State and House at 1280 × 720: all names appear, both personal-site URLs are correct, and no horizontal overflow is present.
- State and House at 390 × 844: all names remain visible in one wrapping row, author link targets retain at least 44px height, and no page-level horizontal overflow is present.
- Keyboard focus uses a solid, high-contrast teal outline; hover color uses the established warm gold.
- State and House browser consoles contained no warnings or errors.

## Iteration history

1. Replaced the two page-specific footer sentences with one shared author list.
2. Added verified personal-site links for Aybas and Çelebi while leaving Dutt unlinked.
3. Added shared wrapping, hover, focus, and mobile target-size styles.
4. Compared the source and implementation in one combined image and checked both pages at desktop and compact-phone widths.

final result: passed

---

# State supporting-notes removal design QA

## Source truth

- Section selected for deletion: `/var/folders/v9/fdxck81j7x7grf7fdqrs83h80000gp/T/codex-clipboard-1c044fb3-4cdf-4af6-80a9-9eb0c35bd78c.png`
- Desktop implementation capture: `/Users/aybas/.codex/visualizations/2026/08/14/01a000dc-2a39-78c3-8df9-8f74a1fce54f/state-bottom-without-notes.png`
- Compact implementation capture: `/Users/aybas/.codex/visualizations/2026/08/14/01a000dc-2a39-78c3-8df9-8f74a1fce54f/state-bottom-without-notes-390x844.png`
- Combined before-and-after comparison: `/Users/aybas/.codex/visualizations/2026/08/14/01a000dc-2a39-78c3-8df9-8f74a1fce54f/state-notes-removal-comparison.png`

## Capture conditions

- Page: `index.html?verify=remove-notes`
- Desktop viewport and screenshot: 1440 × 900 CSS pixels and 1440 × 900 pixels at 1× density
- Compact viewport and screenshot: 390 × 844 CSS pixels and 390 × 844 pixels at 1× density
- Source screenshot: 2048 × 1001 pixels; normalized to 1400 × 684 pixels in the comparison
- Desktop implementation: normalized to 1400 × 875 pixels in the comparison
- State: default North Carolina 2018 election, scrolled to the end of Figure 04

## Findings

- No P0, P1, or P2 differences remain. The selected “Data, definitions, and methodology” section is absent, Figure 04 flows directly into the footer, and no empty card shell or excessive section-sized gap remains.
- Typography: all remaining figure and footer type preserves the established serif/sans hierarchy; no orphaned heading survives the deletion.
- Spacing and layout rhythm: the desktop and compact captures retain a deliberate closing gap between Figure 04 and the footer without the former full-page notes block.
- Colors and visual tokens: the paper background, gold divider, and ink footer remain unchanged.
- Image quality and asset fidelity: existing figure rendering and brand marks remain sharp and unchanged; the deleted section contained no required image asset.
- Copy and content: the deleted heading, three note cards, research disclaimer, footer “Data and methods” link, and visible “Definitions” link are gone. The paper remains available from the existing page actions.

## Responsive and interaction checks

- 1440 × 900: no horizontal overflow; Figure 04 and the footer form a clean page ending.
- 390 × 844: no horizontal page overflow; the existing chart remains horizontally scrollable and the footer follows without a blank panel.
- All remaining hash links resolve to an existing element.
- Browser console contained no warnings or errors.

## Comparison history

1. Removed the complete supporting-notes section and its obsolete CSS.
2. Removed the visible and hidden links that pointed to the deleted definition and method anchors.
3. Repointed retained source metadata to the bundled paper so exported source URLs do not use a deleted fragment.
4. Compared the desktop and compact page endings against the selected deletion target; no further visual fix was required.

final result: passed

---

# House chart chapter design QA

## Source truth

- State-page figure banner: `/var/folders/v9/fdxck81j7x7grf7fdqrs83h80000gp/T/codex-clipboard-c4b9d295-de12-4685-947e-febd06305fe8.png`
- House implementation capture: `/Users/aybas/.codex/visualizations/2026/08/14/01a000dc-2a39-78c3-8df9-8f74a1fce54f/house-trajectory-full-implementation.png`
- Focused House banner crop: `/Users/aybas/.codex/visualizations/2026/08/14/01a000dc-2a39-78c3-8df9-8f74a1fce54f/house-trajectory-banner-implementation.png`
- Combined comparison: `/Users/aybas/.codex/visualizations/2026/08/14/01a000dc-2a39-78c3-8df9-8f74a1fce54f/state-figures-and-house-trajectory-comparison.png`

## Capture conditions

- Page: `house.html?year=2024&w=0`
- Desktop viewport: 1440 × 900 CSS pixels
- State reference: 2848 × 540 pixels
- Focused House crop: 1280 × 240 pixels
- Both banners were normalized to 1400 pixels wide for the side-by-side comparison.

## Visual comparison

- Typography: the gold eyebrow, large white editorial serif title, muted supporting sentence, and compact right-hand count follow the State figure banner’s hierarchy.
- Spacing: the House banner uses the same 210px minimum height, 36px desktop inset, bottom alignment, and generous separation between copy and count.
- Color: the ink background, warm-white title, muted-white supporting copy, and gold labels match the State banner palette.
- Shape and depth: the irregular corner radii, dark hairline border, soft lower shadow, and offset gold edge reproduce the paper-card treatment.
- Structure: the live House reading and interactive chart sit in their own warm-paper panel below the chapter banner, preserving clarity and chart usability.
- Image and asset fidelity: no new image asset is required; this reference is a CSS-rendered editorial panel, and the implementation keeps that same asset-free treatment.
- Copy: House-specific wording replaces the State copy while retaining its direct instruction and short chapter-count label.

## Responsive and interaction checks

- 1440 × 900: banner and chart panel align cleanly, with no horizontal page overflow.
- 390 × 844: banner stacks naturally, the title remains readable, and the chart stays inside a clearly bounded horizontal-scroll region.
- The chart region remains keyboard-focusable and horizontally inspectable on narrow screens.
- Arrow-key adjustment of the House weight updates the chart reading and current-position marker.
- Browser console: no warnings or errors.

## Iteration history

1. Replaced the light chart-card heading with the same dark editorial chapter treatment used for State figures.
2. Separated the live reading and chart into a warm-paper panel so dynamic content does not disrupt the chapter hierarchy.
3. Tuned the compact breakpoint to stack the count, reduce padding, and preserve the source panel’s hand-finished shape.
4. Compared the focused banner and full page at desktop and compact-phone sizes; no P0, P1, or P2 visual differences remain.

final result: passed

---

# House weight-reading copy removal design QA

## Source truth

- User-selected control panel: `/var/folders/v9/fdxck81j7x7grf7fdqrs83h80000gp/T/codex-clipboard-d010141b-6371-47c3-9e72-9e765ff909cd.png`
- Revised implementation crop: `/Users/aybas/.codex/visualizations/2026/08/14/01a000dc-2a39-78c3-8df9-8f74a1fce54f/house-weight-reading-removal-implementation.png`
- Combined comparison: `/Users/aybas/.codex/visualizations/2026/08/14/01a000dc-2a39-78c3-8df9-8f74a1fce54f/house-weight-reading-removal-comparison.png`

## Capture conditions

- Page state: House Explorer, 2018, `w = 0.003250`.
- Desktop browser viewport: 1280 × 720 CSS pixels at 1× density.
- Source image: 2048 × 447 pixels, normalized to 1280 × 289 pixels.
- Implementation control panel: 1220 × 383 pixels, normalized to 1280 × 402 pixels.
- Compact check: 390 × 844 CSS pixels at 1× density.

## Findings

- No P0, P1, or P2 differences remain. The selected sentence is absent and the retained reading is exactly “99.7% local district results · 0.325% statewide representation.”
- Fonts and typography: the existing weight, percentage, and bold reading styles are unchanged.
- Spacing and layout rhythm: the shorter reading stays aligned inside the same bordered status strip; no empty placeholder or unexpected gap appears.
- Colors and visual tokens: the paper surface, ink text, and gold edge remain unchanged.
- Image quality and asset fidelity: this text-only edit introduces no image or icon changes.
- Copy and content: only “The House total changes only when a state crosses a switching point.” was removed; the live percentages remain dynamic.

## Responsive and interaction checks

- Desktop: the 2018 reading renders on one line with no horizontal page overflow.
- 390 × 844: the retained reading wraps naturally, the panel remains within the viewport, and no horizontal page overflow appears.
- Changing `w` continues to update both displayed percentages through the existing calculation path.
- Browser console contained no warnings or errors.

## Comparison history

1. Removed the requested trailing sentence from the dynamic House weight reading.
2. Added a regression assertion that prevents the removed copy from returning.
3. Compared the source and revised control panel in one combined image; no further visual correction was required.

final result: passed
