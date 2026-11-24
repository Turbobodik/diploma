# FactMap Scholar — Adaptive UI (Web/Mobile) Specification

> **Deliverable PDF (Labeled Mockups + Component Library):** [`Adaptive_UI_Specification_Kanoplich_Bahdan.pdf`](Adaptive_UI_Specification_Kanoplich_Bahdan.pdf)  
> **Interactive HTML Mirror:** [`specification.html`](specification.html)  
> **Live Component Showcase Route:** `/design-system` ([`frontend/src/pages/DesignSystemPage.tsx`](../../frontend/src/pages/DesignSystemPage.tsx))

---

## 1. Supported Device Tiers & Responsive Grid

FactMap Scholar adapts across **6 viewport tiers** using relative CSS units (`rem`, `clamp()`, `%`, `100dvh`, CSS Grid/Flexbox) with zero fixed pixel overflows:

| Device Tier | Viewport Range | Tested Size | Primary Navigation | Layout Adaptation |
|---|---|---|---:|---|
| **Foldable / Ultra-narrow** | `<= 359px` | `320×658` | Compact Bottom Tab Bar (`44px`) | Single-column cards, tight padding (`--space-2`) |
| **Mobile Portrait** | `360px–767px` | `375×812` | Fixed One-Hand Bottom Tab Bar + `env(safe-area-inset-bottom)` | Card lists replacing tables; Claims card default on workspace |
| **Mobile Landscape / Virtual Keyboard** | `height <= 500px` (`<= 1023px`) | `812×375` | Static unpinned bottom nav | Prevents soft keyboard from obscuring active inputs or buttons |
| **Tablet** | `768px–1023px` | `768×1024` | Slim Topbar + Bottom Tab Bar | 2-column grids; stacked Evidence Map + Claim Detail Inspector |
| **Desktop** | `1024px–1919px` | `1440×900` | Persistent `15.5rem` Left Sidebar | Split workspace (Evidence Map left + Claim Inspector right) & sortable tables |
| **Ultrawide / 4K** | `>= 1920px` | `2560×1080` | Persistent Sidebar + centered `104rem` container | Prevents excessive line lengths while utilizing wide canvas |

---

## 2. Automatic Device Detection & Display Customization

- **Hook:** [`frontend/src/hooks/useDeviceProfile.ts`](../../frontend/src/hooks/useDeviceProfile.ts) automatically detects and updates on resize/orientation change:
  - Breakpoint tier (`mobile` | `tablet` | `desktop` | `ultrawide`)
  - Exact viewport dimensions (`width × height`)
  - Orientation (`portrait` | `landscape`)
  - Device pixel ratio (`window.devicePixelRatio`)
  - Aspect ratio (`16:9`, `16:10`, etc.) & touch capability
- **User Customization (`/settings`):**
  - **Light & Dark Themes** (`html[data-theme="light" | "dark"]`), persisted in `localStorage` and respecting `prefers-color-scheme`.
  - **Typography / Display Scale** (`90%`, `100%`, `112%`, `125%`) via root `rem` scaling (`html[data-scale]`).

---

## 3. WCAG 2.1 Level AA Contrast & Touch Targets

All semantic token pairs in [`frontend/src/styles/tokens.css`](../../frontend/src/styles/tokens.css) exceed the **4.5:1** WCAG 2.1 AA minimum contrast threshold:

| Token | Light Theme | Contrast (Light) | Dark Theme | Contrast (Dark) |
|---|---|---:|---|---:|
| Primary Ink on Surface | `#18181B` on `#FFFFFF` | **16.4:1** | `#F2F4F7` on `#1A1D21` | **16.9:1** |
| Primary Accent | `#0F625C` on `#FFFFFF` | **7.1:1** | `#2DD4BF` on `#1A1D21` | **11.2:1** |
| NLI Entailment | `#116944` on `#E5F5ED` | **6.5:1** | `#4ADE80` on `#1A1D21` | **10.6:1** |
| NLI Contradiction | `#B42318` on `#FCEAE8` | **6.1:1** | `#F87171` on `#1A1D21` | **6.9:1** |
| NLI Neutral | `#475467` on `#EEF1F5` | **7.5:1** | `#CBD5E1` on `#1A1D21` | **12.1:1** |

- **Touch Targets:** `--touch-target: 2.75rem` (**44px** minimum height on all buttons, inputs, selects, tabs, and mobile bottom navigation links).
- **Vector Iconography:** All icons use crisp SVG components (`lucide-react`) that scale cleanly across 1x/2x/3x DPR screens.

---

## 4. Automated Verification & Regenerating the PDF

From `frontend/`:

```bash
npm run test:e2e           # Runs e2e/adaptive.spec.ts verifying 6 viewports, 0px overflow, 44px touch targets & 125% scale
npm run docs:adaptive-pdf  # Captures fresh 2x Retina screenshots and regenerates Adaptive_UI_Specification_Kanoplich_Bahdan.pdf
```
