# Touchline — Claude Code context

Read these before doing anything:

@docs/PROJECT_BRIEF.md
@DEVELOPMENT.md
@AGENTS.md

Current state: all ten milestones are built, plus suspensions (derived from results), in-match management and scouting (save format v9). Outstanding: device testing with
docs/DEVICE_TEST_CHECKLIST.md and the first EAS build (see DEVELOPMENT.md section 5). Run
`npm run test:all` (not just `npm test`) after engine or balance changes, and keep `npm run lint` clean. Work one milestone at a time, explain decisions
(the user is a CS student who wants to understand the code), and run `npm run typecheck` and
`npm test` before claiming anything works. Keep DEVELOPMENT.md updated at the end of each session.

The user works on Windows (PowerShell). Give copy-pasteable commands in code blocks.
