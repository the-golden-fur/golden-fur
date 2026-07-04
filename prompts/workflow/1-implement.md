# input:

---

# process:

- follow issue instructions to make changes
- see temp/ or request attachments for context files about the request
- tell me what to do (e.g. run scripts in terminal) and/or show you (e.g. files, console logs) to verify if output passes issue's acceptance criteria
- make these steps detailed and guided, especially if they're done outside an editor (e.g. supabase, postman, docker, etc.)
- assume that I don't know how to use or navigate through these apps
- figure out the current sprint and epic from the issue (e.g. Epic 1-A) and resolve the path testing/docs/sprints/sprint-X/epic-X/issue-X
- create the folder if it doesn't exist yet
- write or update a single MD file directly in epic-X/ documenting the verification steps for this issue — create it fresh if this is the first issue touching the epic, otherwise update the relevant section instead of duplicating the whole file
- if the issue involves testable API routes, create epic-X/issue-X/postman/ (if it doesn't exist) and add a new collection JSON file inside it for this issue — one file per issue, never edit a previous issue's collection file
- if the issue involves DB objects (tables, RLS, functions), create epic-X/issue-X/supabase/ (if it doesn't exist) and add a new .sql file inside it for this issue — one file per issue, never edit a previous issue's sql file
- name files consistently: issueXX-verification.md (in epic-X/ root), issueXX.postman_collection.json (in epic-X/issue-Xpostman/), issueXX.sql (in epic-X/issue-X/supabase/)
- don't touch other epics' folders unless the issue explicitly spans them

---

# output:

- actual changes to the files mentioned (no need to print it out)
- actual creation/update of the MD verification doc and any Postman/Supabase files under testing/docs/sprints/sprint-X/epic-X/issue-X (no need to print it out)
- numbered list of tasks to do to verify if we pass issue's acceptance criteria
