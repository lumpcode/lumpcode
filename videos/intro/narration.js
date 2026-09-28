// Single source for the burned-in captions and the pacing.
// Each cue lasts as long as macOS `say` takes to speak it (measured, not mixed into the audio);
// scene elements with data-cue="<index>" appear when that cue starts.
// `caption` overrides the on-screen text when the spoken form differs (e.g. "N P M").
window.NARRATION = [
  {
    id: 'title',
    cues: [
      { say: 'This is Lumpcode.' },
      { say: 'It runs your coding agent on repeat, one pull request at a time.' },
    ],
  },
  {
    id: 'problem',
    cues: [
      { say: 'Some work is too big for one chat.' },
      { say: 'A migration across two hundred files.', caption: 'A migration across 200 files.' },
      { say: 'A backlog of tickets.' },
      { say: 'A test suite to build out.' },
      { say: 'Your agent is great at one task. Lumpcode runs the whole list.' },
    ],
  },
  {
    id: 'lump',
    cues: [
      { say: "You describe the whole campaign once, in your repo. That's called a lump." },
      { say: 'It is one config file. What to work on,', caption: "It's one config file. What to work on," },
      { say: 'what to prompt,' },
      { say: 'and which agent to use.' },
    ],
  },
  {
    id: 'contexts',
    cues: [
      { say: 'Every item the lump matches becomes a context.' },
      { say: 'Here, each component and its test file form one context.' },
      { say: 'A context can be one file, a group of files, or a ticket.' },
    ],
  },
  {
    id: 'run',
    cues: [
      { say: 'Try it on your laptop with lumpcode run.', caption: 'Try it on your laptop with lumpcode run.' },
      { say: 'Lumpcode picks the next unfinished context, and runs your agent on it.' },
      { say: 'When it is done, you review the diff, and commit it.', caption: "When it's done, you review the diff and commit it." },
      { say: 'If the prompt needs tweaking, the first result shows it.' },
    ],
  },
  {
    id: 'worker',
    cues: [
      { say: 'Then, leave a worker running. A second clone, and one command: lumpcode start.', caption: 'Then leave a worker running. A second clone and one command: lumpcode start.' },
      { say: 'It picks up every lump in the repo, and pushes a branch for each piece of work.' },
      { say: 'Push a new lump, and the worker finds it on its next pass. Nothing to deploy or register.' },
    ],
  },
  {
    id: 'review',
    cues: [
      { say: 'You open each branch as a pull request, fix anything the agent missed, and merge.' },
      { say: 'Lumpcode never merges anything itself.' },
      { say: 'A bad result is one small pull request to adjust or close, not a two hundred file diff.', caption: 'A bad result is one small pull request to adjust or close, not a 200-file diff.' },
    ],
  },
  {
    id: 'git',
    cues: [
      { say: 'There is no database, and no account.', caption: "There's no database and no account." },
      { say: 'What is done, and what is left, is read from the commits on your git remote.', caption: "What's done and what's left is read from the commits on your git remote." },
      { say: 'Close the laptop. The next run picks up exactly where the last one stopped.' },
    ],
  },
  {
    id: 'steps',
    cues: [
      { say: 'Each context can run several steps in order.' },
      { say: 'Gate them on your build or your tests,' },
      { say: 'and feed the failure back to the agent, until it passes.', caption: 'and feed the failure back to the agent until it passes.' },
    ],
  },
  {
    id: 'agents',
    cues: [
      { say: 'Use the agent you already have. Cursor, Copilot C L I, Claude Code, Codex, or Open Code.', caption: 'Use the agent you already have: Cursor, Copilot CLI, Claude Code, Codex, or OpenCode.' },
      { say: 'It never merges, and a worker only touches its own lump branches.' },
    ],
  },
  {
    id: 'cta',
    cues: [
      { say: 'Install it with N P M,', caption: 'Install it with npm,' },
      { say: 'run lumpcode setup in your repo, and get your first pull request today.' },
      { say: 'Lumpcode. Your coding agent, on repeat.' },
    ],
  },
]
