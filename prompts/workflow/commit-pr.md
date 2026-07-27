# input:

---

# process:

- make commit messages and PR details for staged files
- only make the messages, I will commit and PR manually
- see prompts/ and .github/ for format and rules
- read from temp/context for shared context/reference files
- for each commit, add the `git add` commands for that commit's files
  directly under its directory structure block, so the files are staged
  without doing it manually
- the `git add` command(s) must work in the VSCode PowerShell terminal,
  whether given as a single line or split across multiple lines

---

# output:

- multiple commit messages (w/ their own updated files directory structure
  and `git add` commands for that commit) using markdown
- the PR fields using markdown
- updated test files that are not specified in the issue (optional/conditional)
