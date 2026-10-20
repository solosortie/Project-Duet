// Note validation, a faithful port of the rules in server.py. Pure functions: no I/O.
const COLORS = new Set(['#594739', '#a65f4c', '#66745a', '#bc8b3d', '#728b98', 'erase']);
const TOOLS = new Set(['pencil', 'ink', 'marker', 'erase']);
const PAPERS = new Set(['cream', 'rose', 'sage', 'blue']);
const FORMATS = new Set([1, 2, 3]);
const SIZES = new Set([32, 40, 52]);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

function validDrawing(drawing) {
  for (let i = 0; i < drawing.length; i++) {
    const s = drawing[i];
    if (s === null || typeof s !== 'object' || Array.isArray(s)) return false;
    if (!COLORS.has(s.color)) return false;
    if (!isInt(s.width) || s.width < 1 || s.width > 28) return false;
    if (!TOOLS.has('tool' in s ? s.tool : 'ink')) return false;
    const pts = s.points;
    if (!Array.isArray(pts) || pts.length < 1 || pts.length > 4000) return false;
    for (let j = 0; j < pts.length; j++) {
      const p = pts[j];
      if (!Array.isArray(p)) return false;
      const n = p.length;
      if (n !== 2 && n !== 3) return false;
      const x = p[0], y = p[1];
      if (!isNum(x) || x < 0 || x > 1000 || !isNum(y) || y < 0 || y > 1000) return false;
      if (n === 3) { const z = p[2]; if (!isNum(z) || z < 0 || z > 1) return false; }
    }
  }
  return true;
}

const countWords = (t) => { const m = t.match(/\S+/g); return m ? m.length : 0; };

// Returns {status, error} on failure, or {note} on success.
export function validateNote(data, person) {
  if (!person) return { status: 403, error: 'Choose your name first.' };
  const author = 'author' in data ? data.author : person;
  if (author !== person) {
    return { status: 409, error: 'Your identity changed in another tab. Close this draft and choose your name again; the draft is kept.' };
  }
  const text = 'text' in data ? data.text : '';
  const drawing = 'drawing' in data ? data.drawing : [];
  const paper = 'paper' in data ? data.paper : 'cream';
  const nonce = 'nonce' in data ? data.nonce : '';
  const format = 'format' in data ? data.format : 1;
  const textSize = 'text_size' in data ? data.text_size : 40;

  let valid = typeof text === 'string' && [...text].length <= 3000
    && Array.isArray(drawing) && drawing.length <= 500
    && PAPERS.has(paper)
    && typeof nonce === 'string' && [...nonce].length >= 8 && [...nonce].length <= 80
    && isInt(format) && FORMATS.has(format) && isInt(textSize) && SIZES.has(textSize);
  if (valid && format === 3) {
    valid = countWords(text) <= 200 && drawing.length === 0 && text.trim().length > 0;
  }
  if (valid) valid = validDrawing(drawing);
  if (!valid || (!text.trim() && drawing.length === 0)) {
    return { status: 400, error: 'Add a little writing or a drawing.' };
  }
  return { note: { text: text.trim(), drawing, paper, nonce, format, textSize } };
}
