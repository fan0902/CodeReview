# CR Index-Ready Query Refresh Design

## Context

Opening a project starts indexing asynchronously. The Controller panel can request
`/api/controllers` before the index has analyzed any files, cache the empty result,
and continue to show no endpoints after the index status reaches `ready`.

## Chosen Design

The existing index-status polling component will detect the transition to `ready`
and invalidate the active project's Controller query. React Query will then fetch
the completed index exactly once for that transition.

The refresh stays scoped to the current project query key. Opening a different
project naturally creates a different key, and repeated status reads while already
ready do not trigger repeated invalidations.

## Alternatives Considered

- Poll from the Controller panel while its result is empty. This duplicates index
  lifecycle knowledge inside a feature panel and cannot distinguish an unfinished
  index from a project that genuinely has no controllers.
- Make project opening wait for the full index. This would remove the race but make
  large projects feel blocked and require a broader backend API change.

## Error Handling

Existing status and Controller error states remain unchanged. If invalidating the
query fails, React Query retains its normal error behavior and the status control
continues to support manual refresh.

## Verification

A component test will prove that a Controller query is invalidated when indexing
changes from `scanning` to `ready`, and that repeated `ready` responses do not cause
an invalidation loop. The complete unit, typecheck, build, Playwright, Swift,
bundle-signature, and macOS Smoke gates will then be rerun.
