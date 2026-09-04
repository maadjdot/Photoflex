# Project Document Persistence Architecture

## Decision

Project metadata is not the persistence home for every future feature. Each large editable artifact is treated as an independent document with its own revision and save Interface.

- Project workspace: name, memo, sources, navigation resume state and document identifiers.
- Worktable document: placements, groups, links and Sequence piles. Callers save through `ProjectStore.saveWorktable`.
- Sequence document: order, segments and reading units. It already has an independent revision.
- Version document: immutable Sequence snapshot, written atomically with the Sequence when required.
- Future Book document: page plan, layout and output settings; it must not be appended to `ProjectWorkspace`.
- Future AI session document: messages, tool results and generated proposals; it must not share the workspace revision.
- Future project-management document: tasks, milestones and collaborators; it receives its own revision policy.

`ProjectWorkspace.worktableDraft` remains temporarily readable for backup and storage-schema compatibility. New UI code must use the Worktable-specific save Interface so the browser Adapter can move the payload to a dedicated object store without changing callers.

## Concurrency

Every mutable document uses compare-and-swap revisions. A caller must surface conflicts and must not interpret a structured `Result` as a boolean. Queued writes capture the project/document generation and ignore completions from an obsolete route.

## Image policy

- Contact Sheet thumbnail: 512 px.
- Table visible card: 768 px.
- Sequence visible canvas card: 1536 px.
- Read current and prefetched neighbors: 2048 px.
- Explicit single-photo inspection: original file.

Only visible canvas images hold leases. Derived previews are cached by photo id and maximum edge.
