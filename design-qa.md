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
