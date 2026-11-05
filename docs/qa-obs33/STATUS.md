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
- Repeat shutdown coverage for Save and Cancel paths; investigate outstanding bmem allocations.
- Visually verify Windows/taskbar icons; branding resources compiled successfully in c234b8e24.
- Complete feature integration, package, installer/update/rollback and hardware qualifications where equipment exists.

Operator runtime was not replaced. This checkpoint is not Alpha release acceptance.

## Subsequent native run (PID 54216)
- Build with restored Windows/Qt branding and translated DSK/close dialog: PASS.
- Startup completed; process responded with 3Mix QA title.
- Windows UI Automation, restricted to QA PID, read the actual question and buttons: Salvar e fechar / Descartar e fechar / Cancelar.
- Close request followed by invoking Descartar e fechar: process exited without force; log reached context teardown and final profiler output. Numeric exit code was not captured.
- This validates that one modal path, not Save/Cancel or operator project persistence.
- Log reported 690 outstanding bmem allocations; source counter is read after run_program returns and does not identify allocation sizes or owners. Root cause remains unknown.
- Archived distinct runs reported 730, 2356 and 98994 allocations; these are not a controlled growth comparison.
- QBoxLayout insertion warning was corrected in 577c6a5bc; build PASS, warning absence not yet retested.
- No claim of complete native UI, hardware, DPI, distribution or Alpha qualification.
