# Adaptive UI Requirements (Web/Mobile) — Criteria (Stage 3)

Source: EHU Diploma Project Knowledge Base (`04-technical-requirements/04d-frontend-and-ux/adaptive-ui/`).

## UI Design Specification

Adaptive UI makes sure the interface displays correctly and conveniently on devices with different screen sizes, pixel densities, and orientations.
Goal: keep functionality, visual consistency, and usability regardless of the device type.

---

## Minimum Requirements for a Passing Grade

### General Criteria
- Support **3 main device types** (mobile phone, tablet, desktop).
- For mobile applications, support common aspect ratios (e.g., 16:9, 21:9) and portrait/landscape modes.
- What is checked:
  - Interface displays correctly when screen resolution and orientation change (no overlapping elements).
  - Relative units are used (`rem`, `em`, `%`, `vw`/`vh`, `clamp()`).
  - Interface works correctly when browser zoom or system settings change.

### Visual Criteria
- Scale fonts, icons, and images without distortion.
- Apply a consistent color palette and typography across all devices.
- What is checked:
  - Final result of how images display on different devices.
  - Minimum size of interactive elements for small touch-screen devices (**at least 44px**).
  - Contrast and readability on different backgrounds and compliance with **WCAG 2.1 Level AA** (at least **4.5:1** for text).
  - Consistent color palette and typography across all devices.

### Structural Criteria
- Interactive UI elements and static content blocks adjust to screen resolution and orientation.
- Main navigation is available on all devices.
- What is checked:
  - Interface is built on a responsive grid.
  - Blocks scale properly when screen width changes.
  - Main navigation is always available.

---

## Maximum Project Requirements

### Addition to General Criteria
- Support any screen type (including 4K, ultrawide, foldable, smartwatch / ultra-narrow).
- Implement automatic device detection (pixel density, orientation, aspect ratio).
- Use a Design System.

### Addition to Visual Criteria
- Implement light/dark theme support.
- Use SVG images for icons.
- Allow users to customize display settings (scale, color scheme).

### Addition to Structural Criteria
- Rebuild the application layout when screen size changes.
- Adapt mobile version for one-hand use and platform system patterns (Android bottom navigation / iOS tab bar).
- UI elements must not be covered by the keyboard.

---

## General Document Requirements

Submit the final document in one of these formats:
- Figma project (preferred);
- Adobe XD / Sketch file;
- **PDF export of mockups** (if online access is not possible).

Required contents:
- All pages and components must have clear labels.
- Provide **3 variants for different devices** (Mobile, Tablet, Desktop).
- Create a **library of reusable components**.
- For interactive elements, show the **appearance for different states** (default, hover, focus, active, disabled, error).
