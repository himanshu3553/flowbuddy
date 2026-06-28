The Studio app-shell sidebar — logo, workspace switcher, the 6-item nav, pinned Settings, and a user footer. The active item carries the indigo-50 fill + filled glyph.

```jsx
import { Sidebar, defaultNavItems } from '...';
<Sidebar active="Knowledge Base" onNavigate={(route, label) => setScreen(label)} />
```

- Defaults to `defaultNavItems`; pass your own `items` to add/remove. Settings is always pinned to the bottom.
- `active` matches by label or route. Add a `badge` to any item (e.g. pending approvals → the amber "5").
- 230px wide; pair with `PageHeader` + a `#f6f7f9` content column to form a screen.
