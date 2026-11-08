// Note validation, a faithful port of the rules in server.py. Pure functions: no I/O.
// Any #rrggbb colour is allowed (the colour menu lets people add their own); 'erase' marks eraser strokes.
const HEX = /^#[0-9a-f]{6}$/;
const validColor = (c) => c === 'erase' || (typeof c === 'string' && HEX.test(c));
const TOOLS = new Set(['pencil', 'ink', 'marker', 'erase', 'text', 'fill']);
const FILL_MAX_POINTS = 1500, FILL_MAX_LOOPS = 24;
const TEXT_SIZES = new Set([28, 40, 56, 80]);
const TEXT_BAD = /[\u0000-\u0009\u000b-\u001f\u007f]/;   // newlines are fine, other control characters are not
const PAPERS = new Set(['cream', 'rose', 'sage', 'blue']);
const FORMATS = new Set([1, 2, 3]);
const SIZES = new Set([32, 40, 52]);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

function validDrawing(drawing) {
  for (let i = 0; i < drawing.length; i++) {
    const s = drawing[i];
    if (s === null || typeof s !== 'object' || Array.isArray(s)) return false;
    if (!validColor(s.color)) return false;
    const tool = 'tool' in s ? s.tool : 'ink';
    if (!TOOLS.has(tool)) return false;
    if (tool === 'fill') {   // a flood fill, stored as the outline of the filled area: closed loops of integer points
      if (s.color === 'erase' || s.width !== 1 || !Array.isArray(s.points) || !Array.isArray(s.loops)) return false;
      if (s.points.length < 3 || s.points.length > FILL_MAX_POINTS || s.loops.length < 1 || s.loops.length > FILL_MAX_LOOPS) return false;
      let sum = 0;
      for (const n of s.loops) { if (!isInt(n) || n < 3) return false; sum += n; }
      if (sum !== s.points.length) return false;
      for (const p of s.points) { if (!Array.isArray(p) || p.length !== 2 || !isInt(p[0]) || p[0] < 0 || p[0] > 1000 || !isInt(p[1]) || p[1] < 0 || p[1] > 720) return false; }
      continue;
    }
    if (tool === 'erase') {
      if (!isInt(s.width) || s.width < 8 || s.width > 100) return false;
    } else if (tool === 'marker') {   // the dry marker is a wide brush
      if (!isInt(s.width) || s.width < 1 || s.width > 60) return false;
    } else if (tool !== 'text') {
      if (!isInt(s.width) || s.width < 1 || s.width > 28) return false;
    } else if (!isInt(s.width) || s.width < 1 || s.width > 28) {
      return false;
    }
    if (tool === 'text') {   // text placed on the page: one anchor point, a box width and height, and the words
      if (s.color === 'erase' || typeof s.text !== 'string' || !s.text.trim() || [...s.text].length > 500 || TEXT_BAD.test(s.text)) return false;
      if (!TEXT_SIZES.has(s.size) || !isInt(s.w) || s.w < 100 || s.w > 1000 || !isInt(s.h) || s.h < 1 || s.h > 720) return false;
      if (!Array.isArray(s.points) || s.points.length !== 1) return false;
    }
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
