# Original 3Mix header in Windows caption area

QA-only opt-in: `THREEMIX_QA_INTEGRATED_TITLEBAR=1`. Operator runtime not modified.

The existing Menu CEF widget is reused; the original footer is retained without mirrored native actions. Caption space follows native Windows button rectangles. The header mask is recalculated on resize. A narrow empty strip invokes Qt system move on the actual header child.

Executed evidence in project QA: full RelWithDebInfo build passed; original More Tools menu opened by physical click; restore/maximize geometry inspected; physical drag moved window from (2,53) to (58,88); native minimize/maximize clicks changed Windows state; native X opened translated Save and close, followed by normal process exit. Captured glyph pixels showed complete minimize, maximize and close shapes. Extracted native icon visually inspected: white 3Mix symbol, not OBS; proportional icon generated from lab/logo3mix/icon vranco.png with transparent padding and seven ICO sizes.

Limits: process-only QT_SCALE_FACTOR=1.25 tested geometrically, native DPI stayed 96. Physical multi-DPI, Snap Layout hover, exhaustive header actions and long-running lifecycle are not qualified. This is not an Alpha installer release. Feature remains QA opt-in; no operator deployment. Earlier evidence includes failures and must not be interpreted as all tests on a single run. Raw evidence remains in qa-finalizacao/obs33-native-smoke, outside this native worktree.

Follow-up: native drag hit-test now reads the same measured caption reservation used by the layout instead of a fixed 160-pixel exclusion. Full RelWithDebInfo rebuild passed after normal QA save/close. Interactive regression of this follow-up remains pending; do not infer physical DPI qualification.
