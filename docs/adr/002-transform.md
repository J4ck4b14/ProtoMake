# ADR 002: Affine transforms are canonical

Accepted for Milestone 0.

Store a six-number local affine matrix. Provide ordinary TRS composition at the API boundary. Reparenting with world preservation multiplies by the inverse new-parent world matrix before changing ownership.

Pure TRS cannot represent shear introduced by arbitrary rotated nonuniform parents. Storing an affine matrix preserves exact hierarchy geometry. The cost is that future inspector TRS controls must display shear explicitly or offer a documented constrained edit; they cannot silently discard it. Singular parent inversion is an explicit error. Local zero scales remain valid.
