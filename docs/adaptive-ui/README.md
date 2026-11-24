# Adaptive UI Specification

- Mockups and component library PDF: [Adaptive_UI_Specification_Kanoplich_Bahdan.pdf](Adaptive_UI_Specification_Kanoplich_Bahdan.pdf)
- Live component showcase route: `/design-system` ([frontend/src/pages/DesignSystemPage.tsx](../../frontend/src/pages/DesignSystemPage.tsx))

## 1. Breakpoints and layout behavior

All spacing, font sizes, and containers use relative units (`rem`, `clamp()`, `%`, `100dvh`, CSS Grid/Flexbox).

| Tier | Width / Condition | Tested Viewport | Navigation | Layout |
|---|---|---|---|---|
| Foldable / narrow | `<= 359px` | `320x658` | Compact bottom tab bar (44px) | Single-column cards, reduced padding |
| Mobile portrait | `360px-767px` | `375x812` | Fixed bottom tab bar with `safe-area-inset-bottom` | Card lists instead of tables; workspace defaults to Claims cards |
| Mobile landscape / keyboard | `height <= 500px` (`<= 1023px`) | `812x375` | Static unpinned bottom nav | Prevents soft keyboard from covering inputs |
| Tablet | `768px-1023px` | `768x1024` | Top bar + bottom tab bar | 2-column grids; stacked map and inspector |
| Desktop | `1024px-1919px` | `1440x900` | Persistent `15.5rem` left sidebar | Split view (Evidence Map + Claim Inspector) and sortable tables |
| Ultrawide / 4K | `>= 1920px` | `2560x1080` | Persistent sidebar + `104rem` max width | Centered container avoids overly wide lines |

## 2. Device detection and user display settings

- `useDeviceProfile()` ([frontend/src/hooks/useDeviceProfile.ts](../../frontend/src/hooks/useDeviceProfile.ts)) tracks breakpoint tier, viewport width/height, orientation, `devicePixelRatio`, aspect ratio, and touch support on resize and orientation change.
- `/settings` lets users switch between light and dark themes (`html[data-theme]`, stored in `localStorage` with `prefers-color-scheme` fallback) and adjust interface text scale (`90%`, `100%`, `112%`, `125%` via `html[data-scale]`).

## 3. Contrast and touch targets (WCAG 2.1 AA)

Tokens are defined in [frontend/src/styles/tokens.css](../../frontend/src/styles/tokens.css). All text/background pairs stay above the 4.5:1 AA threshold:

| Token | Light | Contrast (Light) | Dark | Contrast (Dark) |
|---|---|---:|---|---:|
| Primary text on surface | `#18181B` / `#FFFFFF` | 16.4:1 | `#F2F4F7` / `#1A1D21` | 16.9:1 |
| Primary accent | `#0F625C` / `#FFFFFF` | 7.1:1 | `#2DD4BF` / `#1A1D21` | 11.2:1 |
| NLI entailment | `#116944` / `#E5F5ED` | 6.5:1 | `#4ADE80` / `#1A1D21` | 10.6:1 |
| NLI contradiction | `#B42318` / `#FCEAE8` | 6.1:1 | `#F87171` / `#1A1D21` | 6.9:1 |
| NLI neutral | `#475467` / `#EEF1F5` | 7.5:1 | `#CBD5E1` / `#1A1D21` | 12.1:1 |

- Interactive elements use `--touch-target: 2.75rem` (44px minimum height on touch screens).
- All icons are inline SVGs from `lucide-react`.

## 4. Verification and PDF regeneration

From `frontend/`:

```bash
npm run test:e2e           # verifies 6 viewports, 0px overflow, >=44px touch targets, 125% scale
npm run docs:adaptive-pdf  # regenerates Adaptive_UI_Specification_Kanoplich_Bahdan.pdf
```
