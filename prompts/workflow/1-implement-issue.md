# input:

---

# process:

- follow issue instructions to make changes
- see temp/ or request attachments for context files about the request
- tell me what to do (e.g. run scripts in terminal) and/or show you (e.g. files, console logs) to verify if output passes issue's acceptance criteria
- make these steps detailed and guided, especially if they're done outside an editor (e.g. supabase, postman, docker, etc.)
- assume that I don't know how to use or navigate through these apps
- resolve the path testing/docs/issues/NN-summarized-or-branch-name, where NN is the issue number and the suffix is a short summary of the issue (matching its branch name where possible, e.g. 11-staff-unavailability-blocks)
- create the folder if it doesn't exist yet
- write or update a single MD file directly in that folder documenting the verification steps for this issue — name it after the folder's descriptive suffix (e.g. staff-unavailability-blocks.md); create it fresh if this is the first pass, otherwise update the relevant section instead of duplicating the whole file
- if the issue involves testable API routes, add a same-named .postman_collection.json file directly in that folder; only add a postman/ subfolder if the issue needs more than one collection file
- if the issue involves DB objects (tables, RLS, functions), add a same-named .sql file directly in that folder; only add a supabase/ subfolder if the issue needs more than one sql file
- don't touch other issues' folders unless the issue explicitly spans them

---

# output:

- actual changes to the files mentioned (no need to print it out)
- actual creation/update of the MD verification doc and any Postman/Supabase files under testing/docs/issues/NN-summary (no need to print it out)
- numbered list of tasks to do to verify if we pass issue's acceptance criteria
