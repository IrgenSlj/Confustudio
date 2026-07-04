# CS-Score — pattern text notation

CS-Score is a **lossless, line-oriented mini-notation** for sequencer patterns. Raw
project JSON is token-hostile (a 16-step track with p-locks is hundreds of tokens);
CS-Score gives the music agent the same affordance coding agents get from source
code: compact, diffable, human-readable text that maps exactly to the musical model.

It is implemented as a **pure kernel module** — `src/kernel/score.js` — with no DOM,
Web Audio, or global state, so it is fully unit-testable and round-trip-provable.

```
# bank A · pattern 3 · 132bpm · len 16 · swing 54%
T1 kick |X...X...X...X...|
T2 hat |..x...x...x...x.| p:vel=0.6
T3 acid |C2...D#2...C2...G1...| s:5,13 a:9
L T3.cutoff |. . . . 46 . . . 62 . . . 80 . . .|
T4 clap |....X.......X...| c:13=3:4
```

## API

```js
import { parseScore, emitScore, normalizeScore, noteNameToMidi, midiToNoteName } from './src/kernel/score.js';

parseScore(text); // → { ok:true, pattern } | { ok:false, errors }
emitScore(pattern); // → canonical CS-Score text (exact inverse of parse)
normalizeScore(text); // → canonical text (parse + re-emit) | { ok:false, errors }
noteNameToMidi(name); // → MIDI number | null
midiToNoteName(midi); // → note-name string
```

The **round-trip property** holds for the representable subset:

```
normalizeScore(emitScore(parseScore(x).pattern)) === normalizeScore(x)
```

`emitScore` always produces one deterministic **canonical form**, so `normalizeScore`
is idempotent and canonical text is its own normal form. (`tests/score-roundtrip.mjs`
asserts this across a spread of fixtures.)

The tools `score.read(bank, pattern)` / `score.write(bank, pattern, text)` (a later
phase) sit on top of this module: `score.write` compiles the parsed fragment to
ordinary commands on the active branch, so undo / branching / audit all still hold.
This module itself is just the pure parse ⇄ emit boundary.

## Lines

A score is a sequence of lines. Blank lines are ignored. Each non-blank line is one of:

| Line        | Purpose                                          |
| ----------- | ------------------------------------------------ |
| `# …`       | Header (metadata) or comment                     |
| `T<n> …`    | A track block (identity + step grid + modifiers) |
| `L <ref> …` | A p-lock lane (per-step parameter values)        |

**Comments** begin at the first `#` that is at the start of a line or preceded by
whitespace. A `#` inside a note name (e.g. `D#2`) is therefore never mistaken for a
comment, and trailing `# …` comments may follow any line.

## Header

The first `#` line that contains recognized keywords is the header. All fields are
optional and order-independent on input; the canonical (emitted) order is fixed:

```
# bank <B> · pattern <N> · <bpm>bpm · len <L> · swing <S>%
```

| Field         | Grammar | Meaning                                  |
| ------------- | ------- | ---------------------------------------- |
| `bank <B>`    | word    | Bank name/letter                         |
| `pattern <N>` | integer | Pattern number                           |
| `<bpm>bpm`    | number  | Tempo                                    |
| `len <L>`     | integer | Pattern length = number of steps per bar |
| `swing <S>%`  | number  | Swing percentage                         |

`len` is the source of truth for the step count. If the header omits `len`, it is
inferred from the first track's step count. `len` is always emitted (it is derivable);
the other fields are emitted only when present.

## Track line

```
T<n> <name> |<grid>| <modifiers>       # optional comment
```

- **`T<n>`** — 1-based track number (`T1` → track index 1).
- **`<name>`** — everything between the track id and the first `|`, trimmed.
- **`|<grid>|`** — the step grid, wrapped in pipes.
- **`<modifiers>`** — optional space-separated `p:` / `s:` / `a:` / `c:` fields.

### Step symbols (grid)

The grid is lexed into **one token per step**. Whitespace between cells is ignored on
input (you may space cells out for readability); the canonical form packs drum/note
cells with no spaces.

| Symbol               | Meaning                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `.`                  | Rest (inactive step)                                                           |
| `X`                  | Trig — active step at the track's default velocity, inheriting the track pitch |
| `x`                  | Ghost — active step at low velocity (0.35), for pocket/feel                    |
| `C2`, `D#2`, `G1`, … | Note — active step with an explicit pitch (tonal tracks)                       |

Note tokens lex greedily and unambiguously: a note is `letter + optional #/b + octave`,
so `C2..D#2` reads as `C2`, `.`, `.`, `D#2`. The number of tokens **must equal `len`** —
a mismatch is a tolerant error (pad short bars with `.`).

Accent, slide, and trig-condition are **not** carried by grid symbols; they are set by
the modifiers below (so an accented trig still shows as `X`, marked by an `a:` field).

### Modifiers

| Field            | Example     | Meaning                                                                                                      |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `p:key=val`      | `p:vel=0.6` | Track-level default. Keys: `vel`, `prob`, `gate` (all numeric)                                               |
| `s:step[,step…]` | `s:5,13`    | Mark step(s) as **slide** (per-step glide; CS-ACID). `s:5=slide` is accepted; the `=slide` tag is decorative |
| `a:step[,step…]` | `a:9`       | Mark step(s) as **accent**                                                                                   |
| `c:step=cond`    | `c:13=3:4`  | Set a **trig condition** on a step                                                                           |

Step numbers are **1-based** and must fall within the bar. Canonical emit order is
`p:` (keys sorted) · `s:` (one comma list) · `a:` (one comma list) · `c:` (one per step).

## Trig conditions

The `c:` grammar matches the sequencer engine exactly (`src/kernel/event-compiler.js`,
Studio Manual §M-3):

| Condition                      | Fires when                              |
| ------------------------------ | --------------------------------------- |
| `always`                       | Every pass (default; never emitted)     |
| `1st`                          | First loop only                         |
| `not1st`                       | Every loop except the first             |
| `every2` / `every3` / `every4` | Every 2nd / 3rd / 4th pass              |
| `A:B`                          | On pass A of every B passes, e.g. `3:4` |
| `random`                       | Uses the step probability               |
| `fill`                         | Only while the fill button is held      |
| `not_fill`                     | Only while fill is **not** held         |

Input aliases are canonicalized: `first` → `1st`, `not_first` / `not:first` → `not1st`.

## P-lock lanes

A lane assigns a parameter value **per step** for a track — the substrate for filter
sweeps, sample-start chopping, pitch locks, etc.

```
L T<track>.<param> |<cells>|
```

- **`T<track>.<param>`** — target track number and parameter name (e.g. `T3.cutoff`,
  `T1.sampleStart`, `T2.delaySend`). The param name is any track/patch parameter.
- **`<cells>`** — one cell per step; each cell is either `.` (no lock at this step) or a
  number (the locked value). Cells are **whitespace-separated** (numbers can be
  multi-digit, so unlike the trig grid they are not packed). The cell count must equal `len`.

On parse, lane values fold into the target track's `steps[i].paramLocks[param]`. On
emit, one lane line is reconstructed per (track, locked param), params sorted. Lane
lines are emitted immediately after their track block.

## Note names ⇄ MIDI

Standard MIDI naming spanning `C-1` (0) … `G9` (127), with **middle C = C4 = 60**.

- `noteNameToMidi(name)` accepts sharps (`#`) and flats (`b`) and negative octaves
  (`C-1`); returns `null` for anything unparseable or out of the 0–127 range.
- `midiToNoteName(midi)` renders the **canonical** name using sharps (so `Db4` parses
  to 61 and emits back as `C#4`).

Examples: `C-1`→0, `G1`→31, `C2`→36, `D#2`→39, `C4`→60, `G9`→127.

## Tolerant-error contract

The parser is **tolerant**: malformed input never throws. `parseScore` returns

```js
{ ok: false, errors: [{ line, col, message, hint }, …] }
```

where `line`/`col` are 1-based and `hint` is an actionable suggestion — the errors are
agent feedback, so the model can self-correct. Errors are sorted by line then column,
and a single call reports as many independent problems as it can find. Detected
conditions include:

- **Bad bar width** — a track or lane bar whose step count ≠ `len`.
- **Unknown step symbol** — a grid character that is not `.` `X` `x` or a note.
- **Note missing octave / out of range** — e.g. bare `C`, or a note beyond `C-1..G9`.
- **Unknown / malformed modifier** — an unrecognized prefix, a `p:` key outside
  `vel|prob|gate`, a non-numeric value, or a bad step list.
- **Unknown trig condition** — a `c:` condition outside the grammar above.
- **Missing `|…|` bar**, **invalid lane target**, **lane targeting an unknown track**,
  and **step references out of range**.

`normalizeScore` returns the canonical string on success, or the same
`{ ok:false, errors }` shape on failure.

## Design notes / judgment calls

- **`len` = token count, not character count.** Each step is one lexed token. Because
  drum symbols (`.` `X` `x`) are single characters, a packed drum bar's character count
  equals its step count; note tokens are multi-character but still one step each. The
  brief's illustrative acid example (`|C2..D#2.C2..G1..|`, 11 tokens under a `len 16`
  header) is a sketch — real bars must have exactly `len` step tokens (pad with `.`).
- **Trig grid packs; lane grid is space-separated.** Trig cells pack unambiguously
  because each token starts with a distinct character class. Lane cells hold arbitrary
  numbers, which cannot be packed unambiguously, so they are whitespace-separated.
- **`ghost` and `slide` are explicit step flags.** The model's `Step` has no dedicated
  slide field and encodes ghosts only via low velocity; CS-Score surfaces both as
  explicit booleans in the parsed fragment so the notation round-trips losslessly.
  Ghost velocity is a fixed constant (0.35); per-step velocity is otherwise a
  track default (`p:vel`) or a `velocity` p-lock lane.
- **Representable subset.** `emitScore` is the exact inverse of `parseScore` for what
  the notation can express (active/ghost/note/accent/slide/trig-condition/p-locks +
  header meta). Arbitrary per-step velocities not expressible via `p:vel`, ghost, or a
  velocity lane are outside the representable subset by design.
