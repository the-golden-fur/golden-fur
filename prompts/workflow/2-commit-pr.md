# input:

---

# process:

- make commit messages and PR details for staged files
- only make the messages, I will commit and PR manually
- see prompts/ and .github/ for format and rules
- for each commit, add the `git add` commands for that commit's files
  directly under its directory structure block, so the files are staged
  without doing it manually

---

# output:

- multiple commit messages (w/ their own updated files directory structure
  and `git add` commands for that commit) using markdown
- the PR fields using markdown
- updated test files that are not specified in the issue (optional/conditional)
