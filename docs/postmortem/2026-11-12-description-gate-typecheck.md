# Source gate return-type typecheck failure

The first PR1 typecheck rejected retained sync code after a gate was declared to return `never`. Runtime behavioral tests passed; no external requests or publication occurred. Correct the gate's public return annotation to `void` while retaining its unconditional runtime refusal, then rerun typecheck and request-counter tests.

- Symptom/evidence: first `pnpm build` reported TS2339/TS2322 `never` narrowing throughout indeed-sync.ts after assertAutomated. Six defining behavioral tests passed first. Raw output was observed in worker transcript.
- Lookup before remediation: canonical postmortem-memory query `TypeScript never unreachable property` returned local-typescript-assertion-narrowing-guard. That finding concerns redundant discriminant assertions, so its exact remedy does not apply. Current diagnostic is an unconditional `never` public call, rather than a runtime data union.
- Cause: explicitly typed `never` makes the remainder of a caller statically unreachable. Retaining the existing disabled implementation avoids deleting unrelated behavior but still requires a `void` guard contract.
- Resolution: public gate annotations become void, runtime throw stays unconditional; fresh `pnpm build` exited 0; six defining behavioral tests, including zero-request/browser counters, passed. Subsequent actual CLI proof confirms accepted version/PDF/history/invalidation and local fixture attachment.
- Learning ownership: worker is authorized to write only this worktree and exact task proof/status paths. External canonical ledger writes under /home/kevin/linux-config/dot_agents/skills/postmortem-memory are outside that scope; supervisor must register the reviewed final report/hash. No installed copy was changed.
