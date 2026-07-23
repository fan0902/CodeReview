# CR Resizable Information Panel and Navigation Design

## Goal

Improve the code-reading workspace in three focused ways:

1. Let the user resize the right-side information panel and preserve that width across CR launches.
2. Keep Controller and Enum analysis scoped to the opened project instead of mixing in nested Git worktrees.
3. Bind code-location back navigation to `Control + -` on macOS.

## Confirmed Behavior

### Resizable information panel

- Add a vertical drag handle between the code editor and the information panel.
- Start at approximately 420 pixels when no saved preference exists.
- Clamp the width to a minimum of 320 pixels and a maximum of 50 percent of the workspace width.
- Update the grid continuously while dragging.
- Store the final width in browser `localStorage` and restore it on later launches.
- Preserve the existing collapse and expand control. Collapsing does not erase the saved width.
- At narrow responsive breakpoints, keep the existing compact rail behavior instead of forcing the saved desktop width.

### Main-project analysis boundary

- Treat `.worktrees/` directories inside an opened repository as separate checkouts, not part of the opened project analysis.
- Exclude `.worktrees/**` during the initial source scan and from filesystem watcher updates.
- As a result, Controller and Enum panels show results from the opened project root only.
- Keep the existing hidden-file toggle behavior in the file tree. When hidden files are enabled, `.worktrees` may still be browsed explicitly, but its files do not enter Controller or Enum analysis.

### Navigation shortcuts

- Register `Control + -` as navigation back in Monaco on macOS by using Monaco's physical Control modifier mapping.
- Register `Control + Shift + -` as navigation forward for symmetry.
- Preserve Command+click definition navigation and the F12 fallback.
- Continue using the existing workspace navigation history, including source file, line, and column.

## Architecture

### Layout state

The workspace store owns the information-panel width alongside its open state. A small persistence helper reads and validates the saved width, rejecting missing, malformed, or out-of-range values. `AppShell` applies the width through a CSS custom property and owns the pointer-drag lifecycle. Pointer capture keeps the drag stable when the cursor leaves the handle.

### Index filtering

The server index service extends its shared ignored-path rule to include `.worktrees`. The same rule is used by initial discovery and the watcher so that results cannot reappear after filesystem changes.

### Keyboard handling

`CodeViewer` changes the history key registrations from Monaco's `CtrlCmd` modifier to `WinCtrl`. On macOS, `WinCtrl` maps to the physical Control key, while `CtrlCmd` maps to Command.

## Error and Edge Handling

- Invalid persisted widths fall back to the default.
- Dragging outside the allowed range clamps cleanly rather than growing the panel beyond the usable editor area.
- Pointer cancellation ends the resize without corrupting state.
- `.worktrees` is excluded regardless of path separator, matching the existing cross-platform ignored-path expression.
- Back and forward commands are safe when history has no matching entry because the existing store leaves the current location unchanged.

## Testing

- Add web component tests for drag updates, minimum/maximum clamping, persistence, and restoration.
- Update Monaco command tests to prove `Control + -` invokes back and `Control + Shift + -` invokes forward while F12 remains available.
- Add an index-service test fixture containing a normal controller and a `.worktrees/<branch>/` controller; assert only the normal controller is indexed.
- Keep the existing unit, typecheck, build, Playwright, Swift launcher, repository-hygiene, bundle, smoke, and codesign verification.
- Rebuild the shared CR.app and perform a real browser acceptance check for resize persistence, clean Controller paths, definition jump, and Control+minus back navigation.

## Non-goals

- CR will not manage, switch, or display Git branches in this change.
- The file-tree hidden-files preference is unchanged.
- No new split-pane dependency is introduced.
- No changes are made to Command+click definition resolution or F12 behavior beyond regression coverage.
