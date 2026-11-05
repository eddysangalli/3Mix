# OBS33 QA checkpoint — 2026-11-05

Release status: NOT QUALIFIED.

## Executed
- Native QA PID 72492: create temporary scene, wait for frontend queue, select Preview, confirm actual state, trigger transition, confirm Program.
- Result: PASS via authenticated native WebSocket, not a UI click test.
- Cleanup: original Preview/Program restored to Cena and temporary scene absence confirmed by a subsequent read.
- Evidence: native-selection-polled.json.
- Earlier immediate-read tests failed; those results do not establish a persistent Preview-selection defect. Commands are asynchronous.

## Still required
- Native UI interaction, docking detach/reorder/restore, 1920x1080 and smaller/DPI checks.
- Screenshot comparison against established 3Mix layout; current Qt capture is 1920x1129 and does not establish GPU surface capture.
- Clean shutdown without crash.
- Build and runtime verification of pending Windows branding resources.
- Complete feature integration, package, installer/update/rollback and hardware qualifications where equipment exists.

Operator runtime was not replaced. This checkpoint is not Alpha release acceptance.
