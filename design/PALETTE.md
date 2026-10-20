# Project Duet — design system

| Role | Color | Hex |
| --- | --- | --- |
| Background | Oat | `#F2E8D5` |
| Base paper | Cream | `#FFF6E5` |
| Lines, text | Cocoa | `#594739` |
| Primary actions, deer side | Moss | `#66745A` |
| Warm accent | Terracotta | `#A65F4C` |
| Cat | Honey | `#DBA654` |
| Quiet accent | Dusty blue | `#728B98` |
| Alternate paper | Peach | `#EFD2BD` |
| Alternate paper | Pale moss | `#DCE1C6` |
| Alternate paper | Blue-grey | `#D9E3E2` |

Duet Hand is an original locally bundled, rounded display font with reinforced strokes. Uppercase A–Z, digits, and basic punctuation; lowercase maps to the uppercase glyphs. The title and passphrase label use it. Georgia is the functional typeface for controls and names. Caveat is reserved for typed note content.

`build_font.py` contains the original letter centerlines and reproducible font generator. It requires fontTools only when rebuilding the font. The site itself has no font-building dependency.

Chat/deer always precedes Aryan/cat. Illustrations have a limited warm fill palette with cocoa outlines. Paper keeps small irregular edges, three deterministic tape arrangements, and minimal shadows. Drawings are cropped to visible ink, retaining a minimum width for a consistent scale. Marker transparency, pencil texture, and stylus pressure for ink are stored with each vector stroke.

No decorative hearts, snowflakes, empty-state slogans, or footer music bar. Settings holds sound and motion. Editing uses distinct SVG tool silhouettes with visible labels and selected states. Preview shows the exact cropped composition before database submission. Close preserves a separate note/canvas draft; Stick to the wall publishes it after server confirmation. Written notes use reflowing text and a live 200-word / 3,000-character limit. Canvas mode contains drawing-only controls. A dedicated coffee favicon replaces all page mugs. Entry, save, and editor-close events trigger brief ear/tail animation; OS reduced-motion preferences disable it. Button clicks use a quiet synthesized squish.
