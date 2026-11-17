# Attribution for the anatomy points (`atlas.bin`)

`atlas.bin` holds the points the brain is drawn with:

- 20,000 points scattered over the structures of a human brain (cortex by region, limbic structures, cerebellum and brainstem), each with its region and structure.
- 25,211 points on the brainstem, the spinal cord and cauda equina, the spinal nerve roots, the cranial nerves, the face and neck nerves and the main nerve trunks of the whole body, in the same frame as the brain, each with the point before it along its fibre.

**Source models.** Z-Anatomy, the libre 3D atlas of anatomy, shared under the Creative Commons Attribution-ShareAlike 4.0 International licence (CC BY-SA 4.0): https://github.com/Z-Anatomy/Models-of-human-anatomy. Z-Anatomy is built on BodyParts3D, © The Database Center for Life Science (DBCLS), shared under CC BY-SA 2.1 Japan.

**Point layouts.** The point layouts were derived from those models by mindcorpus (https://mindcorpus.org) and shared under CC BY-SA 4.0. 2Brain re-encodes them unchanged in position into this binary file (int16 coordinates at 1/2048 of a unit, plus region, structure and fibre indices).

**Licence.** This file and the points inside it are shared under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), as that licence requires. Anyone who copies them must carry this credit with them.

Everything else in 2Brain — the code that places notes on these points, the renderer and the interface — is 2Brain's own and is not covered by this notice.

## Format

Little-endian.

| bytes | field |
| --- | --- |
| 4 | magic `2BAT` |
| 2 | version (1) |
| 2 | scale S (2048): a coordinate is `int16 / S` |
| 4 | brain point count Nb |
| 4 | body point count Nn |
| 8 × Nb | brain: x, y, z (int16), region (uint8), structure (uint8) |
| 10 × Nn | body: x, y, z (int16), part (uint8), structure (uint8), previous point on the fibre (uint16, 65535 for none) |

x is across, y up and z forwards. Brain regions: 0 prefrontal, 1 frontal, 2 parietal, 3 occipital, 4 temporal, 5 limbic, 6 cerebellum, 7 brainstem. Body parts: 0 brainstem, 1 spinal cord, 2 cauda equina, 3 spinal nerve roots, 4 cranial nerves, 5 nerve trunks, 6 face nerves, 7 neck nerves.
