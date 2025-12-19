---
name: control-flow
description: Human-readable control flow patterns for refactoring complex conditionals. Use when refactoring nested conditionals, improving code readability, or restructuring decision logic.
---

# Human-Readable Control Flow

When refactoring complex control flow, mirror natural human reasoning patterns:

1. **Ask the human question first**: "Can I use what I already have?" -> early return for happy path
2. **Assess the situation**: "What's my current state and what do I need to do?" -> clear, mutually exclusive conditions
3. **Take action**: "Get what I need" -> consolidated logic at the end
4. **Use natural language variables**: `canReuseCurrentSession`, `isSameSettings`, `hasNoSession`: names that read like thoughts
5. **Avoid artificial constructs**: No nested conditions that don't match how humans actually think through problems

Transform this: nested conditionals with duplicated logic
Into this: linear flow that mirrors human decision-making
