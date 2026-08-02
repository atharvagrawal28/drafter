# One-shot migrations

These scripts each ran **once**, to move the domain files in `data/` from one
shape to the next as the registry grew:

| Script | What it did |
|---|---|
| `extend-samples.ts` | Extended the two sample issuers when the registry grew past what they covered |
| `apply-corpus-upgrade.ts` | Applied the 13 requirements the 17-DRHP corpus study justified, each stamped with its `corpus_evidence` |
| `apply-applicability.ts` | Added sector-conditional applicability gates, so a services issuer is not marked down for having no factory |

They are kept because they record **why** the data files look the way they do,
and each carries the evidence for its own changes in comments.

**They are not re-runnable.** Their output is already committed in `data/`, and
running one again would apply the same edit twice. Nothing in the build, the
app or the verification suites imports them, `npm run verify` is what protects
those files now.
