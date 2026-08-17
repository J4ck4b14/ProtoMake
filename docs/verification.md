# Milestone 0 verification

The automated gate is `npm run typecheck && npm run lint && npm test && npm run build`.

The test suite covers entity/component lifetime, immutable snapshots, registry validation, activity inheritance, hierarchy cycles and missing parents, exact affine reparenting, atomic singular-parent rejection, deep iterative traversal, deterministic scene round trips, runtime-world isolation, corrupt project/scene rejection, migration chains, events and lifecycle timing/error cleanup.

The browser smoke procedure is:

1. Run the development server and open its URL.
2. Click Run acceptance check. Require PASS for two entities and preserved hierarchy.
3. Start the runtime and observe fixed updates increase.
4. Pause, record the count, Step and require exactly one extra update.
5. Resume, then Stop and require stopped state.
6. Check the browser reports no uncaught errors and the page fits an 800px-wide desktop viewport.
7. Repeat against `npm run preview` to exercise production output.

The browser procedure remains pending: the local browser binary was unavailable and the remote browser connection failed during navigation. No visual verification or successful browser interaction is claimed. Vite development startup, a clean npm ci, all 36 automated tests, typecheck, lint/format/boundary checks and the production build succeeded. Unit/integration tests are reproducible with the declared dependency set.

A remote GitHub CI run has not been performed. Publishing packages, building creator games, rendering sprites and editing scenes are outside this milestone.
