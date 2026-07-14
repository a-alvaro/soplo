// D2Q9 lattice constants.
//
// Direction layout (rest, axes, diagonals):
//   6  2  5
//    \ | /
//   3- 0 -1
//    / | \
//   7  4  8

export const Q = 9;

export const ex = new Int8Array([0, 1, 0, -1, 0, 1, -1, -1, 1]);
export const ey = new Int8Array([0, 0, 1, 0, -1, 1, 1, -1, -1]);

// Opposite direction index for bounce-back: opp[i] returns the direction -e[i].
export const opp = new Uint8Array([0, 3, 4, 1, 2, 7, 8, 5, 6]);

export const w = new Float64Array([
  4 / 9,
  1 / 9,
  1 / 9,
  1 / 9,
  1 / 9,
  1 / 36,
  1 / 36,
  1 / 36,
  1 / 36,
]);

// Speed of sound squared, cs^2 = 1/3 in lattice units.
export const CS2 = 1 / 3;
