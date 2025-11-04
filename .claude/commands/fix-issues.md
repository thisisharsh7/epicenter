---
allowed-tools: Bash(*), Read, Write, Edit, Glob, Grep, Task, WebFetch
description: Automatically fix multiple GitHub issues in parallel using git worktrees and sub-agents
model: claude-sonnet-4-5
argument-hint: [label] [limit] [--dry-run]
dangerouslyDisableSandbox: true
---

# Parallel GitHub Issue Fixer

Automatically fetch GitHub issues, create isolated git worktrees, spawn parallel sub-agents to implement fixes, and create pull requests for review.

## Arguments

- `$1`: GitHub issue label filter (default: "ready-to-fix")
- `$2`: Maximum number of issues to process (default: 3)
- `$3`: Optional `--dry-run` flag to plan without execution

User provided: $ARGUMENTS

---

## Phase 1: Issue Discovery & Planning

### Step 1.1: Fetch GitHub Issues

```bash
gh issue list \
  --label "${1:-ready-to-fix}" \
  --state open \
  --limit "${2:-3}" \
  --json number,title,body,labels,url \
  --jq '.[] | {number, title, body, labels: [.labels[].name], url}'
```

### Step 1.2: Analyze Feasibility

For each issue, determine if it's auto-fixable based on:
- Clear reproduction steps
- Specific error messages or file references
- Not labeled "needs-discussion" or "breaking-change"
- Has enough context to locate relevant code

Create a plan listing:
- Issue #: [number]
- Title: [title]
- Fixable: YES/NO
- Reason: [brief assessment]
- Estimated complexity: LOW/MEDIUM/HIGH

### Step 1.3: Get User Confirmation

Present the plan to the user with:
- Total issues found: X
- Auto-fixable: Y
- Skipped: Z (with reasons)

Ask: "Proceed with creating worktrees and spawning fix agents for Y issues? (yes/no)"

If `--dry-run` flag is present, stop here and show the plan only.

---

## Phase 2: Git Worktree Setup

For each fixable issue, create an isolated workspace:

### Step 2.1: Create Branch Name

Generate semantic branch name:
```
fix/issue-{number}-{kebab-case-short-title}
```

Example: `fix/issue-123-memory-leak-transcription`

### Step 2.2: Create Git Worktree

```bash
# Create worktree directory
WORKTREE_PATH="/Users/braden/Code/whispering/.conductor/issue-{number}"
BRANCH_NAME="fix/issue-{number}-{short-title}"

# Ensure we're starting from latest main
git fetch origin main

# Create worktree with new branch tracking origin/main
git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" origin/main

# Verify creation
ls -la "$WORKTREE_PATH"
```

### Step 2.3: Track Worktree Metadata

Store worktree information for cleanup:
```bash
echo "$WORKTREE_PATH|$BRANCH_NAME|{issue_number}" >> /tmp/claude-worktrees-session-{timestamp}.txt
```

---

## Phase 3: Parallel Agent Execution

Spawn one sub-agent per fixable issue using the Task tool. All agents run in parallel.

### Sub-Agent Prompt Template

For each issue, spawn a Task agent with this comprehensive prompt:

```
You are an autonomous bug-fixing agent. Your mission: fix GitHub issue #{number} in an isolated git worktree.

CRITICAL CONSTRAINTS:
- Work ONLY in this directory: {worktree_path}
- Use absolute paths for ALL file operations
- Do NOT modify files outside this worktree
- Run ALL commands with dangerouslyDisableSandbox: true

ISSUE DETAILS:
Title: {title}
Body: {body}
URL: {url}
Labels: {labels}

WORKTREE INFO:
Path: {worktree_path}
Branch: {branch_name}
Base: origin/main

YOUR WORKFLOW:

1. CONTEXT GATHERING (15 min max)
   - Read the issue carefully, extract key details
   - Identify error messages, stack traces, file references
   - Use Grep to search for relevant code patterns
   - Use Glob to find related files
   - Understand the codebase architecture around the bug

2. REPRODUCTION (if applicable)
   - Verify you can reproduce the issue
   - Check existing tests related to the bug
   - Document reproduction steps

3. SOLUTION DESIGN
   - Identify root cause
   - Design minimal fix (prefer simple over clever)
   - Consider edge cases and potential side effects
   - Plan test strategy

4. IMPLEMENTATION
   - Make code changes using Edit/Write tools
   - Use absolute paths: {worktree_path}/src/...
   - Follow project style guidelines from CLAUDE.md
   - Keep changes focused and minimal

5. TESTING & VALIDATION
   - Run relevant test suites:
     ```bash
     cd {worktree_path}
     npm test -- --grep "{relevant_test_pattern}"
     ```
   - Run full test suite if time permits:
     ```bash
     npm test
     ```
   - Fix any test failures
   - Run linter/formatter:
     ```bash
     npm run lint
     npm run format
     ```

6. COMMIT & PUSH
   - Stage changes:
     ```bash
     cd {worktree_path}
     git add .
     ```
   - Create conventional commit:
     ```bash
     git commit -m "fix(scope): resolve issue #{number}

{detailed_description}

Fixes #{number}"
     ```
   - Push to remote:
     ```bash
     git push -u origin {branch_name}
     ```

7. PULL REQUEST CREATION
   - Create PR using gh CLI:
     ```bash
     cd {worktree_path}
     gh pr create \
       --title "fix: {title}" \
       --body "$(cat <<'EOF'
Fixes #{number}

## Problem
{brief_problem_description}

## Solution
{technical_explanation_of_fix}

## Testing
- [ ] Existing tests pass
- [ ] Added/updated tests for fix
- [ ] Manual testing completed

## Checklist
- [x] Code follows project style guidelines
- [x] Commit follows conventional commit format
- [x] PR links to issue #{number}
EOF
)" \
       --label "automated-fix" \
       --assignee @me
     ```

8. REPORT RESULTS
   Provide a structured summary:

   ✅ SUCCESS or ❌ FAILURE

   Issue: #{number}
   Branch: {branch_name}
   Worktree: {worktree_path}
   PR URL: {pr_url} (if created)

   Changes made:
   - File 1: {description}
   - File 2: {description}

   Tests: PASSED/FAILED (details)

   Notes: {any important observations}

   If FAILURE:
   - Reason: {why could not fix}
   - Recommendation: {suggest manual investigation or needs-discussion label}

FAILURE SCENARIOS - When to abort:
- Cannot locate relevant code after 15 minutes
- Issue requires architectural changes (scope too large)
- Tests fail after fix attempt (root cause unclear)
- Issue is actually a feature request, not a bug
- Insufficient information to reproduce

In case of failure:
1. Do NOT create a PR
2. Do NOT push commits
3. Leave worktree intact for manual inspection
4. Report detailed failure reason

Remember: Quality over speed. A correct, tested fix is better than a quick broken one.
```

### Parallel Execution

Invoke all sub-agents in a SINGLE message with multiple Task tool calls:

```
Task(subagent_type: "general-purpose", description: "Fix issue #123", prompt: {sub_agent_prompt_123})
Task(subagent_type: "general-purpose", description: "Fix issue #456", prompt: {sub_agent_prompt_456})
Task(subagent_type: "general-purpose", description: "Fix issue #789", prompt: {sub_agent_prompt_789})
```

This launches all agents simultaneously, maximizing parallelism.

---

## Phase 4: Results Aggregation

After all sub-agents complete (this blocks until all finish):

### Step 4.1: Collect Results

Parse each agent's final report and aggregate:

```
PARALLEL FIX SUMMARY
====================

Total issues processed: {N}
Successful fixes: {success_count}
Failed attempts: {failure_count}

SUCCESS:
- Issue #{num1}: {title1}
  PR: {pr_url1}
  Branch: {branch1}

- Issue #{num2}: {title2}
  PR: {pr_url2}
  Branch: {branch2}

FAILED:
- Issue #{num3}: {title3}
  Reason: {failure_reason3}
  Worktree: {path3} (preserved for manual inspection)

NEXT STEPS:
1. Review PRs: gh pr list --author @me --label automated-fix
2. Inspect failed worktrees manually
3. Clean up successful worktrees (see Phase 5)
```

### Step 4.2: Create Tracking Issue (Optional)

Optionally create a meta-issue tracking this batch:

```bash
gh issue create \
  --title "Automated fix batch: {timestamp}" \
  --body "Parallel fix run initiated by user

Successful PRs:
- #{pr1}
- #{pr2}

Failed issues requiring manual review:
- #{issue3}: {reason}

Session ID: {timestamp}" \
  --label "automated-fix-batch"
```

---

## Phase 5: Cleanup

### Step 5.1: Remove Successful Worktrees

For issues with successfully created PRs:

```bash
# Read session file
cat /tmp/claude-worktrees-session-{timestamp}.txt | while IFS='|' read -r path branch issue; do
  # Check if PR was created for this issue
  PR_EXISTS=$(gh pr list --head "$branch" --json number --jq length)

  if [ "$PR_EXISTS" -gt 0 ]; then
    echo "Removing worktree: $path (PR created)"
    git worktree remove "$path" --force
    echo "✓ Cleaned up: $branch"
  else
    echo "⚠ Preserving worktree: $path (no PR, likely failed)"
  fi
done
```

### Step 5.2: Preserve Failed Worktrees

Leave failed worktrees intact with a note:

```bash
# For each failed worktree, create a README
echo "This worktree was preserved because the automated fix failed.

Issue: #{number}
Reason: {failure_reason}
Date: {timestamp}

To manually investigate:
1. cd {worktree_path}
2. Review partial changes: git status
3. Continue fix manually or delete worktree: git worktree remove {worktree_path}
" > {worktree_path}/AUTOMATED_FIX_FAILED.md
```

### Step 5.3: Final Cleanup Report

```
CLEANUP COMPLETE
================

Removed worktrees: {count}
Preserved for manual review: {count}

To view preserved worktrees:
  git worktree list

To remove a specific worktree:
  git worktree remove /Users/braden/Code/whispering/.conductor/issue-{number}

To remove ALL worktrees from this session:
  git worktree list | grep '/issue-' | awk '{print $1}' | xargs -n1 git worktree remove --force
```

---

## Phase 6: Final Instructions to User

Present actionable next steps:

```
🎯 AUTOMATED FIX COMPLETE

✅ {success_count} PR(s) created and ready for review
❌ {failure_count} issue(s) require manual attention

REVIEW YOUR PRs:
  gh pr list --author @me --label automated-fix

VIEW SPECIFIC PR:
  gh pr view {pr_number}

REVIEW PR IN BROWSER:
  gh pr view {pr_number} --web

MERGE A PR (after review):
  gh pr merge {pr_number} --squash

MANUAL INVESTIGATION NEEDED:
{list_of_preserved_worktrees_with_paths}

CLEANUP ALL REMAINING WORKTREES:
  git worktree list | grep '.conductor/issue-' | awk '{print $1}' | xargs -n1 git worktree remove --force

Questions or issues? Review the session log above or run again with fewer issues.
```

---

## Error Handling & Edge Cases

### Issue Fetch Failures
- If `gh issue list` fails: Check authentication (`gh auth status`)
- If no issues found: Suggest different label or broader filter
- If API rate limited: Show current limit status (`gh api rate_limit`)

### Worktree Creation Failures
- If worktree path exists: Auto-cleanup old worktree first
- If branch exists: Use `git worktree add -B` to force checkout
- If disk space low: Warn and limit to 2 issues max

### Agent Execution Failures
- If agent times out (>30 min): Kill and mark as failed
- If agent crashes: Preserve worktree, include error trace in report
- If multiple agents fail: Suggest reducing parallelism

### PR Creation Failures
- If push fails: Check git credentials, try SSH vs HTTPS
- If PR already exists: Link to existing PR instead
- If branch protection: Document requirements in report

### Cleanup Failures
- If worktree removal blocked: Force removal or document for manual cleanup
- If branch deletion fails: Leave branch intact (PRs need them)

---

## Configuration & Customization

Users can customize behavior by editing this file:

```markdown
### Configuration Variables (edit as needed)

DEFAULT_LABEL="ready-to-fix"
DEFAULT_LIMIT=3
MAX_AGENT_TIMEOUT=30  # minutes
WORKTREE_BASE_PATH="/Users/braden/Code/whispering/.conductor"
REQUIRE_TESTS=true
AUTO_CLEANUP=true
CREATE_BATCH_ISSUE=false
```

---

## Advanced Usage

### Target Specific Issues by Number
```
/fix-issues "123,456,789"
```

### Combine Multiple Labels
```
/fix-issues "bug,high-priority" 5
```

### Dry Run to Plan First
```
/fix-issues ready-to-fix 10 --dry-run
```

### Resume Failed Fixes Manually
```bash
cd /Users/braden/Code/whispering/.conductor/issue-{number}
# Make your changes
git add .
git commit -m "fix: manual completion of automated fix"
git push -u origin {branch-name}
gh pr create --title "..." --body "..."
```

---

## Safety & Best Practices

✅ DO:
- Start with small batches (3-5 issues)
- Review automated PRs before merging
- Use `--dry-run` first for large batches
- Keep issues well-labeled and documented
- Run during low-activity periods

❌ DON'T:
- Run on critical production branches
- Process vague or under-specified issues
- Merge PRs without testing
- Ignore failed worktrees (investigate or clean up)
- Run concurrently with manual development

---

## Troubleshooting

**"No fixable issues found"**
- Check issue labels and filters
- Ensure issues have sufficient detail
- Verify GitHub CLI authentication

**"Worktree creation failed"**
- Check disk space: `df -h`
- Remove stale worktrees: `git worktree prune`
- Verify git repository health: `git fsck`

**"Agent timed out"**
- Reduce parallelism (fewer issues)
- Check for network/API issues
- Increase timeout in configuration

**"Tests failing after fix"**
- Review agent's implementation
- Check if tests were already failing
- Manually investigate in preserved worktree

**"PR creation failed"**
- Verify GitHub CLI auth: `gh auth status`
- Check repository permissions
- Ensure branch was pushed: `git branch -r | grep {branch-name}`

---

## Notes

- This command requires `dangerouslyDisableSandbox: true` for git operations across worktrees
- Each agent operates independently; there's no shared state between parallel fixes
- Worktrees share the same .git directory but have separate working directories
- Failed fixes preserve worktrees for manual investigation
- Successful PRs automatically clean up their worktrees
- Use conventional commit format for all automated commits
- All PRs are labeled "automated-fix" for easy filtering

---

**Execution begins now. Starting Phase 1: Issue Discovery...**
