---
allowed-tools: Bash(git add:*), Bash(git status:*)
description: Stage modified tracked files for commit
model: claude-sonnet-4-5
---

# Stage Modified Files

Stage all modified tracked files (excluding untracked files) for the next commit.

## Instructions
1. Check `git status` to see what files are modified
2. Run `git add -u` to stage all modified and deleted tracked files
3. Show the final staged status

This command is designed to run before `/commit-message` to stage only the files you've edited in this session, without staging new untracked files.
