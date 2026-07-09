# input:

---

# process:

- follow request instructions to make changes
- see temp/ or request attachments for context files about the request
- tell me what to do (e.g. run scripts in terminal) and/or show you (e.g. files, console logs) to verify if output passes the request
- make these steps detailed and guided, especially if they're done outside an editor (e.g. supabase, postman, docker, etc.)
- assume that I don't know how to use or navigate through these apps
- resolve the path testing/docs/custom/NN-summarized-or-branch-name, where NN is the next sequential 2-digit number and the suffix is a short summary of the request (matching its branch name where possible, e.g. 01-fix-mfa)
- create the folder if it doesn't exist yet
- write or update a single MD file directly in that folder documenting the verification steps for this request — name it after the folder's descriptive suffix (e.g. fix-mfa.md); create it fresh if this is the first pass, otherwise update the relevant section instead of duplicating the whole file
- if the request involves testable API routes, add a same-named .postman_collection.json file directly in that folder; only add a postman/ subfolder if the request needs more than one collection file
- if the request involves DB objects (tables, RLS, functions), add a same-named .sql file directly in that folder; only add a supabase/ subfolder if the request needs more than one sql file
- don't touch other custom folders unless the request explicitly spans them

---

# output:

- actual changes to the files mentioned (no need to print it out)
- actual creation/update of the MD verification doc and any Postman/Supabase files under testing/docs/custom/NN-summary (no need to print it out)
- numbered list of tasks to do to verify if we pass the request's acceptance criteria
