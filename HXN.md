---
layout: page
title: Notation
permalink: /notation/
---


# HXN — Hex eXchange Notation

**Version:** 1 &nbsp;·&nbsp; **Status:** Draft &nbsp;·&nbsp; **April 2026**

HXN is a binary notation format for Hexagonal Tic-Tac-Toe board positions and game records.  
It encodes to a URL-safe base64url string with no padding.

---

## Design Goals

| Goal | Implementation |
|------|---------------|
| Compact | Varint coords: ±63 fits in 1 byte each. Typical positions < 20 bytes. |
| URL-safe | base64url (`-`, `_`) without `=` padding |
| Versioned | Version nibble in byte 0; decoders reject unknown versions |
| Extensible | Optional sections (labels, metadata) via header flags |
| Universal | Legal and illegal board states, infinite board, full game records |
| Standalone | No external dependencies; coordinate system self-contained |

---

## Game Summary

Two players (X and O) place stones on an infinite hexagonal grid using axial coordinates.

**Turn order:**
1. X places **1 stone** at center **(0, 0)** — the implicit first move
2. O places **2 stones**
3. X places **2 stones**
4. Alternating 2-stone turns thereafter

**Win condition:** 6 of a player's stones in a straight line on any of the 3 hex axes.

**Placement constraint:** A new stone must be placed within 8 hex-steps of any existing stone.

---

## Coordinate System

Axial coordinates (q, r):
- q increases to the right
- r increases down-right
- Third axis s = -q - r (never stored; always derivable)

Hex distance: `d(q, r) = (|q| + |r| + |q + r|) / 2`

The 6 neighbor directions: `(±1, 0), (0, ±1), (±1, ∓1)`

---

## Encoding

### String Form

Byte array → base64url (RFC 4648 §5, no padding):
- `+` → `-`, `/` → `_`, no trailing `=`

### Primitive: Unsigned Varint

Groups of 7 bits, LSB first. Bit 7 of each byte signals continuation:

```
encode(u):
  while u ≥ 128: emit (u & 0x7F | 0x80); u >>= 7
  emit u

decode:
  v = 0, shift = 0
  loop: b = next byte
    v |= (b & 0x7F) << shift; shift += 7
    if !(b & 0x80): break
  return v
```

| Value | Bytes |
|-------|-------|
| 0–127 | 1 |
| 128–16383 | 2 |
| 16384–2097151 | 3 |

### Primitive: Signed Coordinate

Zigzag-encode then varint:
```
zigzag(n)  = n ≥ 0 ? 2n : (-2n - 1)
dezigzag(u) = (u & 1) ? -(u >>> 1) - 1 : (u >>> 1)
```

| Coord | Zigzag | Varint bytes |
|-------|--------|--------------|
| 0 | 0 | 1 |
| -1 | 1 | 1 |
| 1 | 2 | 1 |
| -63 | 125 | 1 |
| 63 | 126 | 1 |
| -64 | 127 | 1 |
| 64 | 128 | 2 |

A coord pair `(q, r)` encodes as two consecutive zigzag-varints.

---

## Byte 0: Header

```
 7   6   5   4   3   2   1   0
┌───────────────┬───┬───┬───┬───┐
│   VERSION (4) │ M │ G │ E │ L │
└───────────────┴───┴───┴───┴───┘
```

| Bits | Name | Description |
|------|------|-------------|
| 7–4  | V    | Format version. **Must be 0x1.** Decoders reject other values. |
| 3    | M    | Metadata section present |
| 2    | G    | Game mode (ordered sequence). If 0 = State mode (unordered). |
| 1    | E    | Explicit color per stone. If 0 = derived from index/parity. |
| 0    | L    | Labels section present |

---

## Body: State Mode (G = 0)

Represents a board snapshot. Stone order within each color is **ring-sort**:  
ascending hex distance, then ascending q, then ascending r.

### E = 0 — Parity-legal board

Colors implied by stone counts (all X first, then O):

```
varint(xCount)
varint(oCount)
[xCount × coord_pair]   ← X stones, ring-sorted
[oCount × coord_pair]   ← O stones, ring-sorted
```

### E = 1 — Explicit colors

Handles any board state including illegal parity:

```
varint(totalCount)
[totalCount × (uint8 color, coord_pair)]
```

Color byte: `0x01` = X, `0x02` = O. Stones in ring-sort order.

---

## Body: Game Mode (G = 1)

Records the full move sequence in play order.

```
varint(moveCount)
[moveCount × move]
```

**E = 0** — each move is just `coord_pair`; colors derived by parity rule:

| Move index *i* | Color |
|---------------|-------|
| 0 | X |
| *i* > 0 | C = ⌊(*i* − 1) / 2⌋; C even → O, C odd → X |

This encodes: X at center, then O O, X X, O O, X X, …

**E = 1** — each move is `uint8 color, coord_pair`.

> **Note:** The first move (X at (0,0)) **should** be included in the sequence.  
> Implementations **may** treat a missing first move as implicit.

---

## Labels Section (L = 1)

Appended directly after stone data:

```
varint(labelCount)
[labelCount × (coord_pair, varint(value))]
```

Value encoding: `0–25` = `'a'–'z'`, `26+` = number `(value − 26 + 1)`.

---

## Metadata Section (M = 1)

Appended last. Key-value pairs terminated by key `0x00`:

```
[key_byte, value_data]*
0x00
```

Strings are `varint(byteLength) + UTF-8 bytes`.

| Key | Type | Field |
|-----|------|-------|
| `0x01` | string | Position / game name |
| `0x02` | string | X player name |
| `0x03` | string | O player name |
| `0x04` | uint8  | Result: 0=ongoing, 1=X wins, 2=O wins, 3=draw |
| `0x05` | string | Platform / source |
| `0x06` | string | Start datetime (ISO 8601: `YYYY-MM-DD HH:MM:SS`) |
| `0x07` | varint | Time control — base time (seconds) |
| `0x08` | varint | Time control — increment per turn (seconds) |
| `0x09` | string | Time control type: `"absolute"`, `"fischer"` |
| `0x0A` | string | End reason: `"win"`, `"time"`, `"resign"`, `"draw"` |
| `0x00` | —      | End of metadata |

Decoders **must** ignore unknown keys and skip their values.  
Unknown key format: `varint(byteLength) + bytes` (same as string).

---

## Legality

A board state is **legal** if reachable through valid game play.

Let `x` = X stone count, `o` = O stone count:

```
if x is even:  o must equal x
if x is odd:   o ∈ { x−1, x, x+1 }
```

Legal states after each complete game phase:

| Phase | x | o |
|-------|---|---|
| X opens | 1 | 0 |
| O places 2 | 1 | 2 |
| X places 2 | 3 | 2 |
| O places 2 | 3 | 4 |
| X places 2 | 5 | 4 |

Mid-turn states (one stone of a 2-stone turn placed) are also legal:  
e.g. (x=1, o=1), (x=2, o=2), (x=3, o=3), …

For illegal states, always use **E = 1** (explicit colors).

---

## Examples

### Example 1 — Simple position (legal, state mode)

Board: X at (0,0), O at (1,0) and (-1,0)

```
Header:  0x10  →  V=1, M=0, G=0, E=0, L=0
xCount:  0x01
oCount:  0x02
X stone: zigzag(0)=0→0x00, zigzag(0)=0→0x00
O[0]:    zigzag(1)=2→0x02, zigzag(0)=0→0x00
O[1]:    zigzag(-1)=1→0x01, zigzag(0)=0→0x00

Bytes:   10 01 02 00 00 02 00 01 00
Base64url: EAECAAIAAQ==  →  EAECAAIAAQ
```

### Example 2 — Game record (5 moves)

Opening: X(0,0), O(1,-1), O(-1,1), X(2,0), X(-2,0)

```
Header:  0x14  →  V=1, G=1, E=0
count:   0x05
move 0:  00 00  (X at 0,0)
move 1:  02 01  (O at 1,-1)
move 2:  01 02  (O at -1,1)
move 3:  04 00  (X at 2,0)
move 4:  03 00  (X at -2,0)
```

### Example 3 — Position with metadata

```
Header:  0x18  →  V=1, M=1, G=0, E=0
... stones ...
Metadata:
  0x01  06  "Longsword Opening"   (key=name, length=6)
  0x04  01                        (key=result, X wins)
  0x00                            (end)
```

---

## Use Cases

| Scenario | Recommended flags | Notes |
|----------|------------------|-------|
| Share a board position | `0x10` (V=1, state, parity) | Smallest for legal boards |
| Share an illegal setup | `0x12` (V=1, state, explicit) | Editor or analysis |
| Record a full game | `0x14` (V=1, game, parity) | Sequence; first move included |
| Annotated position | `0x11` (V=1, state, labels) | For diagrams |
| Tournament game | `0x1D` (V=1, game+meta+labels) | Full record with players/time |

---

## Format Comparison

| Format | Typical size (10 stones) | Ordered | Infinite board | Illegal boards | Versioned |
|--------|--------------------------|---------|----------------|----------------|-----------|
| URLCodec | ~6 chars | No | No | Yes | No |
| BSN | ~14 chars | Yes | Limited* | No | No |
| BKE | ~15 chars | No | Yes | No | No |
| HTN | ~30 chars | Yes | Yes | No | No |
| Axial | ~50 chars | No | Yes | Yes | No |
| **HXN** | **~12 chars** | **Both** | **Yes** | **Yes** | **Yes** |

*BSN coordinates overflow past radius 127 (byte value 255).

---

## Implementation Notes

- Decoders **must** reject version nibble ≠ 1
- Decoders **should** ignore unknown metadata keys
- Board size is **never stored**; always derived from the bounding coordinate range
- Encoders **should** use ring-sort for reproducible output in state mode
- The zigzag right-shift must be **unsigned** (`>>>` in JavaScript, `>> 1` with unsigned cast in C)
- When decoding for display, add a padding ring around the content bounding box for visual margin

---

## Changelog

| Version | Date | Notes |
|---------|------|-------|
| 1 | April 2026 | Initial specification |