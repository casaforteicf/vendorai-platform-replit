# Dev IA runtime isolation

The Dev IA overlay is intentionally lazy-loaded and wrapped in its own error boundary from `App.tsx`.
If the Dev IA bundle or component fails at runtime, the core VendorAI application must continue rendering normally.
