# Rules documents

Put the official Riftbound Core Rules PDF here.

This folder exists so the rules can be read from the repository when the sites
that host them are not reachable from the build environment. `coach/rules.md`
is the distilled result — that file is what the coach actually reads, and it
is written by hand with each constraint attributed to a rule reference.

The PDF itself is a working input, not part of the tool. Once its constraints
are distilled it can be removed again; see the note in `coach/rules.md`.
