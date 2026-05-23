---
mode: primary
description: General-purpose coding agent for implementing changes directly
model: openai/gpt-5.5
variant: medium
temperature: 0.2
permission:
  "*": allow
  task:
    "*": deny
  doom_loop: ask
  external_directory:
    "*": ask
    /Users/zoubair/.local/share/opencode/tool-output/*: allow
    /var/folders/3s/qdbpzys94jb188kh88k0fcjh0000gn/T/opencode/*: allow
    /Users/zoubair/.claude/skills/supabase/*: allow
    /Users/zoubair/.claude/skills/supabase-postgres-best-practices/*: allow
    /Users/zoubair/.agents/skills/agent-browser/*: allow
    /Users/zoubair/.agents/skills/supabase/*: allow
    /Users/zoubair/.agents/skills/supabase-postgres-best-practices/*: allow
    /Users/zoubair/Documents/onehealth-connector/.claude/skills/frontend-design/*: allow
    /Users/zoubair/Documents/onehealth-connector/.agents/skills/frontend-design/*: allow
    /Users/zoubair/Documents/onehealth-connector/.cursor/skills/frontend-design/*: allow
    /Users/zoubair/Documents/onehealth-connector/.cursor/skills/dashboard-design/*: allow
    /Users/zoubair/Documents/onehealth-connector/.cursor/skills/component-patterns/*: allow
    /Users/zoubair/Documents/onehealth-connector/.cursor/skills/accessibility/*: allow
    /Users/zoubair/.config/opencode/skills/web-artifacts-builder/*: allow
    /Users/zoubair/.config/opencode/skills/browser-testing-with-devtools/*: allow
    /Users/zoubair/.config/opencode/skills/codemap/*: allow
    /Users/zoubair/.config/opencode/skills/frontend-design/*: allow
    /Users/zoubair/.config/opencode/skills/frontend-ui-engineering/*: allow
    /Users/zoubair/.config/opencode/skills/code-simplification/*: allow
    /Users/zoubair/.config/opencode/skills/debugging-and-error-recovery/*: allow
    /Users/zoubair/.config/opencode/skills/deprecation-and-migration/*: allow
    /Users/zoubair/.config/opencode/skills/planning-and-task-breakdown/*: allow
    /Users/zoubair/.config/opencode/skills/using-agent-skills/*: allow
  plan_enter: deny
  plan_exit: deny
  read:
    "*.env": ask
    "*.env.*": ask
    "*.env.example": allow
  council_session: deny
  skill:
    agent-browser: allow
    browser-testing-with-devtools: allow
    codemap: allow
    code-simplification: allow
    debugging-and-error-recovery: allow
    deprecation-and-migration: allow
    frontend-design: allow
    frontend-ui-engineering: allow
    planning-and-task-breakdown: allow
    supabase: allow
    supabase-postgres-best-practices: allow
    using-agent-skills: allow
  context7_*: deny
---


