---
name: triage-one-by-one
description: >-
  Triage IDEAS.yaml entries and open backlog todos one at a time with the
  operator. Use when the user wants to go through ideas or tickets
  interactively, decide keep, delete, reframe, merge, or park for each one,
  and update the files as each decision lands.
---

# Triage one by one

Work through `IDEAS.yaml` and open todos under `.lumpcode/lumps/{backlog,docs,qol,bugfixes}/backlogItems/todo/` one item at a time. The operator decides. Update the file for that item only after they accept a change. Do not start the next item until they say this one is done.

`ideas-to-backlog` batches and waits for "done for today". `auto-triage` decides alone. This skill is the live pass with the operator.

## Each item

1. Name the item and quote its task in one or two sentences.
2. Say why it could be interesting or useful for Lumpcode. If it is not useful, say that and why. Look at the code and the other open items before judging. Do not invent a use to be polite.
3. Propose one action: keep, delete, reframe, merge into a named item, or park (`blocked` on an idea, or `manual: true` on a todo). One sentence on why that action.
4. Ask: "Is that what you meant? Yes, no, or a sharper version."
5. On yes, apply that edit and stop. Ask: "Are we done with this item?"
6. On a sharper version, edit to match it, show the resulting task, and ask again if we are done. Do not open the next item inside that same reply.
7. On no, stay on this item and ask what to change. Do not edit yet.

A "yes" to the proposal is not "done". Only an explicit done moves on.

## Edits

- Delete removes the idea entry or the todo folder.
- Reframe rewrites `task` (and `name` or `priority` when the operator asked).
- Merge folds this item into the one they named, then deletes this item.
- Park an idea with a non-empty `blocked` string so auto-triage skips it.
- Park a todo with `manual: true` and `workflow` containing `manualReq`. Do not set a boolean `manualReq` field. That field is ignored.
- Auto-triage leaves a todo alone when its `workflow` contains `manualReq`. A missing `requirements.md` on any other todo can still be rewritten. `manual: true` only skips the backlog lump.
- Do not promote a pile of ideas in this pass. Promoting one item is fine when the operator asks for that item.
