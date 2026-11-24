# Front-End Architecture and Development — Criteria (Stage 3)

Source: EHU Diploma Project Knowledge Base (`04-technical-requirements/04d-frontend-and-ux/frontend/`).

## Notes and Context

Your Front-End project must show a deliberate architecture choice, state management, modularity, routing, API interaction, and engineering best practices.
A simple set of pages without architectural decisions does not count as a complete FE application.

**Important:** The application must be a SPA (Single Page Application) built with a modern framework: Angular, React, Vue.js, or a similar one.

---

## Minimum Requirements (for 5 points)

### Documentation
Required sections:
- Front-End application architecture diagram (modules, components, routes, state management)
- Architecture approach description (e.g., component-based approach, Flux/Redux approach, micro frontends if used)
- API documentation that the client works with (data schemas, methods, request/response examples)
- User flows / navigation diagram (how the user moves through the application)
- Tech stack justification (why Angular/React/Vue, the state manager, and the UI kit)

### Architecture
Minimum architecture requirements:
- Separation into:
  - Components (UI elements)
  - Containers/Pages (pages and logical sections)
  - Services / Composables / Hooks (API calls and business logic)
  - Modules (required for Angular)
- Use routing (at least 3–4 routes)
- State management:
  - Local state + Global state (Redux/NgRx/Pinia/Vuex/Zustand/RxJS) or a clear explanation of why it is not needed
- Clear project structure: folders for `components`, `pages`, `services`, data `models`, and `styles`
- API interaction quality:
  - Work with a real API or a mock server
  - Clear data interfaces/types (TypeScript required for Angular, recommended for React/Vue)
  - Centralized request handling (Axios service, Angular HttpClient service, fetch wrapper)
  - Error handling and loading states

### Implementation
The Front-End must:
- Be built with a bundler (Vite / Angular CLI / Create React App / Webpack)
- Have a component-based UI (a single "all-in-one" component is not allowed)
- Use:
  - reusable components
  - layout components
  - a UI library (Material, PrimeNG, Ant Design, Bootstrap) or custom components
- Implement:
  - forms (reactive/controlled)
  - form validation
  - data tables/lists
  - filtering/search/sorting (at least 1 element)
- Additional requirements:
  - Responsive layout (at least desktop + mobile)
  - Clean, readable code
  - ESLint/TSLint + Prettier (or another formatter)
  - Basic logging (e.g., logging errors to console or a service)

### Error Handling
- Implement a global error handler (interceptor / error boundary)
- Show clear error messages to the user (toast / snackbar / dialog)
- Handle `401` / `403` / `404` / `500` correctly
- Use skeleton / loading states for all async operations

### Testing
- Unit tests for at least 3 key components or services
- Integration / E2E tests (1–2 tests), e.g., Cypress, Playwright, or Jest/Vitest + Testing Library
- Test forms, states, or API logic

### Restrictions (Not Allowed)
- Inline styles without a reason, no CSS architecture
- A single component for the entire project
- Storing tokens or passwords in the code
- Unhandled API errors
- Using `any` without justification
- A "SPA" made of static HTML pages without a real UI framework

---

## Maximum Requirements (for 10 points)

All minimum requirements plus completing **2–3 of the directions below**:

### Direction 1: Advanced Architecture
- Micro frontends (Module Federation, Web Components, Nx)
- BFF (Backend for Frontend)
- Clear separation into feature modules
- Lazy Loading of modules and routes
- Clean Architecture / Feature-Sliced Design / Domain-Driven Front-End

### Direction 2: Advanced State Management
- NgRx / Redux Toolkit with modules/slices
- Reactive state management (RxJS, Signals, Vue reactivity)
- Selectors, effects, memoization
- Complex chains of async operations

### Direction 3: Performance
- Code splitting and lazy loading
- Component memoization
- Using Web Workers
- Lighthouse >= 90 for desktop and mobile
- Bundle size reduction, performance analysis

### Direction 4: Advanced UI/UX
- Animations (Framer Motion, Angular Animations)
- Custom component design kit
- Data visualization (charts, dashboards)
- Dark/light theme
- Accessibility (WCAG): ARIA attributes, keyboard navigation, contrast
