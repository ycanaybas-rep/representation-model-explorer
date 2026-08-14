# Districts to Delegations — Model Explorer

A standalone conference edition of the interactive model from *Representation in District-Based Elections*.

The publication URL is configured as:

<https://representation.yunusaybas.com>

## What is included

- The complete Model explorer and its 270 bundled state-year election profiles
- A House explorer that applies one shared `w` to separate state-level optima, then completes the 435-seat composition with fixed observed assignments outside the panel
- Election diagnostics, first-switch weights, custom profiles, advanced specifications, and four interactive figures
- A downloadable copy of the paper
- In-page data, diagnostic, and methodology notes
- Responsive and keyboard-accessible interactions
- Local-only custom profile storage; no API, analytics service, login, or server-side database

The visitor-facing navigation intentionally contains two pages: **State** (`index.html`) and **House** (`house.html`). The former Paper, Methods, and State Lab pages are not part of this publication package.

The House page models the supplied election panel and keeps the observed election assignments of outside-panel seats fixed as `w` changes. For 2024, 343 seats are modeled and the remaining 92 stay fixed at 34 Democratic and 58 Republican. The 2000–2004 views also retain the observed Independent seats. Democratic and Republican vote shares are equal-district two-party averages for covered districts because the source does not contain raw turnout totals. The House chart aggregates the dataset’s authoritative state-by-state switching schedules across the full `w` range and reports Democratic share out of all 435 seats.

Outside-panel assignments are audited against the [U.S. House party-division records](https://history.house.gov/Institution/Party-Divisions/Party-Divisions/) and the Clerk’s [official election-statistics archive](https://history.house.gov/Institution/Election-Statistics/). The delayed 2018 NC-09 and 2020 NY-22 outcomes are treated consistently with the bundled panel’s completed-election assignments.

## Run locally

No build step or secret configuration is required.

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open <http://127.0.0.1:4173/>.

## Validate a release

Node.js 20 or newer is sufficient; there are no third-party package dependencies.

```sh
npm test
```

The test suite checks the election data, diagnostics, state and House model behavior, UI contracts, two-page publication structure, local asset availability, custom-domain metadata, and common credential patterns.

## Publishing

The repository is prepared for GitHub Pages branch publishing from `main` and `/(root)`:

- `CNAME` declares `representation.yunusaybas.com`.
- `.nojekyll` tells GitHub Pages to serve the static files directly.
- `robots.txt`, `sitemap.xml`, canonical metadata, and social metadata use the final HTTPS address.
- `.github/workflows/quality.yml` runs the complete audit on every push to `main` and on pull requests.

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for the GitHub Pages and Squarespace DNS setup.

## Data and interpretation

The model uses author-supplied normalized two-party district vote shares and election-level targets. District drawings are schematic, not geographic maps. Results are methodological outputs, not official election results or legal determinations.

The bundled KaTeX distribution retains its upstream license in `vendor/katex/LICENSE`.

## Repository license

No open-source license is granted by this repository. Unless the copyright holders add a license, the source, data, paper, and visual assets remain protected by their applicable copyrights.
