# Workbench Design

Reference: [Claude design analysis](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/claude/DESIGN.md). This is a community analysis, not an official Anthropic specification.

Use a warm off-white canvas, dark ink, restrained coral actions, and subtle separators. Adapt these to a compact working interface: application navigation, readable lesson documents, role tabs, and a quiet composer. Teal, amber, and red distinguish status; do not encode status through color alone.

Use system fonts with Chinese fallbacks. Headings remain compact, body text 14-16px, letter spacing zero. Controls use recognizable icons, visible focus, and descriptive tooltips. Prefer plain sections over nested cards, with radii at most 8px for framed controls.

Keep all styling scoped to workbench and Kaogong views. Preserve DSH and Better Sidebar themes and native conversation behavior. No brand logos, proprietary font downloads, marketing hero, or decorative gradients.

Desktop pairs learning material with role chat; narrow screens use a single active pane. Images and tables must remain readable. Test long Chinese labels, keyboard navigation, loading/error states, and restored windows.

This records design direction only; it does not claim a rendered or verified implementation.
