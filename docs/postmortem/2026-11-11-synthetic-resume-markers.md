# Synthetic Python resume missing markers

Investigate missing visible list markers in the exact Python PDF/PNG despite passing canonical word geometry. Preserve all prior proof, compare canonical pixels and reproduce before changing downstream rendering.

- Symptom: Firstmate image review found missing markers in the eleven-bullet Python sample at first work entry, second importer bullet and middle portal bullet. Other samples appeared intact.
- Impact: correct text coordinates alone do not establish complete visible bullet layout; implementation handoff paused before commit.
- Evidence: final-proof Python PNG `586f77ea68806444c66021695909b50ea5b2226498e906cecd4005c5f88dd879.png`, SHA256 `b8eedc253220792ee5f9d5f6492b17069ff2b61b14bfbe1707d336460ae36f80`. Prior full282 tests/build passed but excluded raster marker presence.
- Lookup: postmortem-memory `PDF missing bullet marker CMU` saved privately; shell marker-output references do not apply to raster glyphs.
- Status: resolved as display artifact by exact pixel identity and marker checks; no portfolio assets or baselines changed.
- Follow-up: retain executable marker coverage and all prior proof; owner registers the reviewed incident hash. No production fix required.
- Canonical learning ledger updates remain Firstmate-owned under worker outside-write restrictions.

## Resolution

The exact production PNG, independent canonical PNG and three HTML/Chrome counterfactual PNGs are byte-identical: SHA256 `b8eedc253220792ee5f9d5f6492b17069ff2b61b14bfbe1707d336460ae36f80`. Full decoded RGB diff has no differing pixels. All eleven expected marker neighborhoods have43–48 nonwhite pixels, including the first two questioned markers (45,48). Firstmate independently confirmed all eleven regions. This is a display/view artifact, not a PDF rendering defect. No production source, font, spacing or portfolio asset was changed.

The memory search produced unrelated shell marker-output incidents; no prior remedy was reused. Added a Poppler PGM raster assertion for every selected claim's native disc in both production and canonical PDFs, using only existing tools and Node buffers. Prior word geometry remains intact. Exact investigation and counterfactual artifacts remain private in `marker-investigation.md` and adjacent files. Final focused/full results are recorded in the CI plan.

## Raster-check setup correction

The first added raster check stopped before pixel inspection: `spawnSync` returned null status for the approximately1.94MB grayscale144dpi page because its default stdout buffer is1MB. This is a test harness limit, not a PDF problem. Record lookup `spawnSync ENOBUFS maxBuffer raster` privately; inspect the captured child error, then raise only this bounded raster subprocess buffer to4MB (the fixed Letter raster is1,938,816 pixels). Preserve the failed282-test log; rebuild remained exit0. Rerun focused/full checks after this correction, retaining all old proof.

Final verification: captured child error is ENOBUFS (statusnull,1,089,536 stdout bytes). With bounded4MB, focused5/5 tests pass; final environment-enabled suite282/282 in26 files,0 skips, exit0; build exit0. All34 production/canonical marker windows contain at least43 dark pixels. Final preview PNG hashes match the already inspected exact bytes. No renderer defect/fix; only improved test coverage and bounded harness buffer. Remaining external learning registration is Firstmate-owned.
