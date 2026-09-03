# Plan

## Columns

- `draft/`: New tasks, not yet prioritized.
- `in-progress/`: Active work.
- `qa/`: Ready for review.
- `complete/`: Done.

## File Naming

- Use `<id>-<slug>.md` format (e.g., `123-fix-login.md`).
- IDs are unique across all columns.

## Frontmatter

```yaml
id: 123
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
owner: @username
assignee: @username
```

## Plan Body

1. **Goal**: What to accomplish.
2. **Success Criteria**: How to measure success.
3. **Scope**: What's included/excluded.
4. **Safety**: Risks and mitigations.
5. **Inputs Available**: Existing resources.
6. **Outputs Required**: Deliverables.
7. **Test Plan**: How to verify.
8. **Verification**: Who approves.
9. **Notes/Edge Cases**: Additional context.
