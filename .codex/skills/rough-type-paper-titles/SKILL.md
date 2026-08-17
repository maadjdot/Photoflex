---
name: rough-type-paper-titles
description: Create original cover or UI title visuals with a solid paper-texture background and bold, organically imperfect typewriter lettering. Use when a user wants customizable title text, background color, canvas ratio, or rough print texture for a cover, poster, social thumbnail, UI panel, splash screen, or title card.
---

# Rough Type Paper Titles

Create a calm, minimal title visual in which paper texture and uneven mechanical ink carry the personality. Keep the design original; treat any provided reference as direction, never as a cover to copy.

## Gather the brief

Collect these values. Make sensible defaults when they are omitted.

- **Text** — required; preserve capitalization and punctuation verbatim.
- **Use** — `cover` or `ui`. Default: `cover`.
- **Canvas** — ratio or target dimensions. Defaults: 16:9 for video/social covers, 4:5 for portrait covers, 1:1 for square UI tiles.
- **Background** — a color name or hex value. Default: warm off-white `#F2E8D5`.
- **Title scale** — `quiet`, `title`, or `hero`. Default: `title`.
- **Alignment** — left, centered, or right. Default: left.

For UI, favor clear contrast, a smaller title, and enough clear margin for controls. For a cover, allow more empty space and a more assertive title.

## Generate

Use the Image Generation tool. Frame the request as an original minimal title card, not an imitation of a named artist or existing cover.

Specify all of the following in the image prompt:

- The exact text in quotation marks, with an instruction that it must be reproduced verbatim and that no other text may appear.
- A single-color background in the requested color, with tactile paper fibers, mild pressed-paper variation, and faint irregular aging. Do not add objects, borders, photos, gradients, or decorative frames unless the user asks.
- Large, dark typewriter-like letters in near-black or a color that contrasts with the paper.
- Organic printing defects: vary darkness per character; add only a few random double strikes, tiny worn flecks, uneven ink pooling, and soft rough edges. Keep defects non-repeating and text legible.
- Requested alignment, scale, and generous clear margin. Use the selected use case to determine hierarchy.

Use this layout guide:

- **quiet**: title uses roughly 15–25% of canvas width.
- **title**: 30–50% of canvas width; the default for covers.
- **hero**: 55–80% of canvas width; split across lines only if readability benefits.

## Inspect and refine

Check the generated image before delivery:

- Confirm every character, comma, apostrophe, and capitalization matches the requested text.
- Confirm the title is clearly the primary visual at the selected scale.
- Confirm the background remains a single color with paper texture rather than a vignette or scene.
- Confirm imperfections differ between letters and have not reduced readability.

If a text or texture issue appears, edit only that attribute in one follow-up pass. Preserve the approved color, aspect ratio, and composition.

## Prompt skeleton

Use this as the starting point, replacing bracketed values:

```text
Create an original [cover/UI] title visual at [canvas]. Use a single [background color] paper surface with subtle natural fibers and gentle pressed-paper variation. Add only this exact title: "[text]". Set it [alignment] at [quiet/title/hero] scale. Use bold, dark, typewriter-like lettering with random, non-repeating ink density, occasional worn flecks, soft rough edges, and a few restrained double strikes. Keep all letters fully legible. No other text, logos, objects, frames, gradients, or watermarks.
```
