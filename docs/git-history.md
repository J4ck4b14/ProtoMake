# Git commit history and reflogs

ProtoMake uses ordinary Git commits as its published development history. `git log` reads those commits and is what hosting services such as GitHub display. A reflog is different: it is local recovery metadata that records movements of references such as `HEAD` and branches.

## Reflog line format

A typical local reflog entry has this shape:

```text
<old-object-id> <new-object-id> Developer <developer@example.com> <unix-seconds> <timezone>\t<action>
```

For example:

```text
0000000000000000000000000000000000000000 0123456789abcdef0123456789abcdef01234567 Developer <developer@example.com> 1788297240 +0200\tcommit (initial): Create project foundation
```

The fields are:

- **old object ID** — the commit/reference value before the operation. Forty zeroes mean the ref did not previously exist, as with an initial commit.
- **new object ID** — the commit/reference value after the operation.
- **identity** — the Git identity used for the local ref update.
- **Unix timestamp** — whole seconds since `1970-01-01 00:00:00 UTC`.
- **timezone offset** — the local UTC offset recorded with that operation, such as `+0200`.
- **action/message** — why the ref moved, such as `commit`, `checkout`, `reset` or `rebase`.

## Commit dates versus reflog dates

Commit objects contain author and committer identities and dates. Those values are part of the commit object and therefore affect its object ID. Reflog timestamps describe local ref movements instead. Editing a reflog does not alter a commit's author, committer, parent, tree, message, date or hash.

Useful inspection commands:

```bash
git log --format=fuller
git log --graph --decorate --oneline --all
git reflog
```

The first two inspect published commit history. The third inspects local recovery history.

## Why reflogs are not release artifacts

Files such as `.git/logs/HEAD` and `.git/logs/refs/heads/main` are implementation details of a local repository. They are not tracked files and are not transferred by a normal `git push`. Release archives should contain project sources and documentation, not the `.git` directory.

`HISTORY.md` provides a durable, human-readable milestone summary without depending on local reflog state.
