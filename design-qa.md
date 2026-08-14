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

final result: passed
