import type { Editor } from '../editor';
import { elementKey } from '../doc/actions';
import { canHaveMarkers, isStructural, isSvgChild, isSvgRoot } from '../doc/kinds';
import { ensureGroupMarker, followsLine, markerColor, markerOf, type MarkerEnd, setMarkerColor } from '../doc/markers';
import { collectFonts, collectPalette } from '../doc/palette';
import { computed, setAttr, setStyle } from '../doc/style';
import { addSvgTranslate, formatCssTranslate, parseCssTranslate, r2, readSvgTranslate } from '../util/geometry';
import {
  type Binding,
  type Control,
  colorControl,
  gridControl,
  noteControl,
  numberControl,
  segmentedControl,
  selectControl,
  sliderControl,
  textControl,
  togglesControl,
  buttonsControl,
} from './controls';

export interface Section {
  title: string;
  controls: Control[];
}

const WEIGHTS = [
  ['100', 'Thin'], ['200', 'Extra light'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'],
  ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Extra bold'], ['900', 'Black'],
].map(([value, label]) => ({ value, label: `${value} · ${label}` }));

const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted', 'double'].map((v) => ({ value: v, label: cap(v) }));

const SHADOWS: { value: string; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)', label: 'Soft' },
  { value: '0 4px 14px rgba(0, 0, 0, 0.16)', label: 'Medium' },
  { value: '0 14px 36px rgba(0, 0, 0, 0.26)', label: 'Strong' },
];

const DASHES = [
  { value: 'none', label: 'Solid' },
  { value: '6px, 4px', label: 'Dashed' },
  { value: '12px, 6px', label: 'Long dash' },
  { value: '2px, 3px', label: 'Dotted' },
];

/**
 * Build the property sections for the selection. Fields show the main
 * (last picked) element's values; every change is written to all selected
 * elements. Setters go through `editor.edit` with a merge key per
 * selection + property, so a slider drag or scrub is a single undo step.
 */
export function buildSections(editor: Editor, els: Element[]): Section[] {
  const el = els[els.length - 1];
  const multi = els.length > 1;
  const key = els.map(elementKey).join('+');
  const palette = () => (editor.doc ? collectPalette(editor.doc) : []);

  const css: Css = (prop, opts = {}) => ({
    get: opts.read ?? (() => computed(el, prop)),
    set: (v) =>
      editor.edit(`Change ${prop}`, () => {
        for (const e of els) opts.write ? opts.write(e, v) : setStyle(e, prop, v);
      }, `${key}:${prop}`),
  });
  const attr: Attr = (name) => ({
    get: () => el.getAttribute(name) ?? '',
    set: (v) => editor.edit(`Change ${name}`, () => els.forEach((e) => setAttr(e, name, v === '' ? null : v)), `${key}:@${name}`),
  });

  if (!multi && isStructural(el)) return pageSections(editor, el, css, palette);
  const svgCount = els.filter(isSvgChild).length;
  if (svgCount > 0 && svgCount < els.length) return mixedSections(css);
  if (svgCount) return svgSections(editor, el, els, css, attr, palette);

  const sections: Section[] = [];
  const hasText = !isSvgRoot(el) && !['img', 'hr', 'video', 'canvas', 'iframe'].includes(el.localName);
  if (hasText) sections.push(textSection(editor, el, els, css, palette));
  sections.push(fillSection(el, css, palette));
  sections.push(layoutSection(editor, el, els, css));
  sections.push(spacingSection(css));
  sections.push(effectsSection(css));
  if (!multi) {
    const content = contentSection(el, attr);
    if (content) sections.push(content);
    sections.push(customSection(editor, el));
  }
  return sections;
}

/** HTML and SVG picked together: only what both understand. */
function mixedSections(css: Css): Section[] {
  const opacity = css('opacity');
  return [
    {
      title: 'Effects',
      controls: [
        noteControl('Boxes and shapes are selected together, so only the settings they share are shown.'),
        sliderControl('Opacity', { min: 0, max: 100, suffix: '%' }, {
          get: () => Math.round((parseFloat(opacity.get()) || 0) * 100),
          set: (v, final) => opacity.set(String(r2(v / 100)), final),
        }),
      ],
    },
  ];
}

type Css = (prop: string, opts?: { read?: () => string; write?: (el: Element, v: string) => void }) => Binding<string>;
type Attr = (name: string) => Binding<string>;
type Palette = () => string[];

function textSection(editor: Editor, el: Element, els: Element[], css: Css, palette: Palette): Section {
  const fonts = editor.doc ? collectFonts(editor.doc) : [];
  const align = css('text-align', {
    read: () => {
      const v = computed(el, 'text-align');
      return v === 'start' ? 'left' : v === 'end' ? 'right' : v;
    },
  });
  const flag = (prop: string, on: string, off: string, test: (v: string) => boolean): Binding<boolean> => ({
    get: () => test(computed(el, prop)),
    set: (v) => editor.edit(`Change ${prop}`, () => els.forEach((e) => setStyle(e, prop, v ? on : off))),
  });
  return {
    title: 'Text',
    controls: [
      textControl('Font', css('font-family'), { list: fonts }),
      gridControl('', [
        numberControl('Size', css('font-size'), { inline: true, min: 1 }),
        numberControl('Line', css('line-height'), { inline: true, unit: '', step: 0.1, min: 0 }),
      ]),
      selectControl('Weight', WEIGHTS, css('font-weight')),
      colorControl('Colour', css('color'), { palette }),
      segmentedControl('Align', [
        { value: 'left', label: '⇤', title: 'Align left' },
        { value: 'center', label: '↔', title: 'Centre' },
        { value: 'right', label: '⇥', title: 'Align right' },
        { value: 'justify', label: '☰', title: 'Justify' },
      ], align),
      togglesControl('Style', [
        { label: 'B', title: 'Bold', className: 'b', bind: flag('font-weight', '700', '400', (v) => +v >= 600) },
        { label: 'I', title: 'Italic', className: 'i', bind: flag('font-style', 'italic', 'normal', (v) => v === 'italic') },
        { label: 'U', title: 'Underline', className: 'u', bind: flag('text-decoration-line', 'underline', 'none', (v) => v.includes('underline')) },
        { label: 'AA', title: 'Uppercase', bind: flag('text-transform', 'uppercase', 'none', (v) => v === 'uppercase') },
      ]),
      numberControl('Spacing', css('letter-spacing'), { step: 0.1 }),
    ],
  };
}

function fillSection(el: Element, css: Css, palette: Palette): Section {
  const controls: Control[] = [colorControl('Fill', css('background-color'), { none: 'transparent', palette })];
  if (computed(el, 'background-image') !== 'none') {
    controls.push(
      noteControl('Has a gradient or image on top of the fill.', {
        label: 'Remove it',
        run: () => css('background-image').set('none', true),
      }),
    );
  }
  const borderWidth = css('border-width', {
    read: () => computed(el, 'border-top-width'),
    write: (e, v) => {
      setStyle(e, 'border-width', v);
      // A width alone shows nothing while the style is "none".
      if (parseFloat(v) > 0 && computed(e, 'border-top-style') === 'none') setStyle(e, 'border-style', 'solid');
    },
  });
  controls.push(
    numberControl('Border', borderWidth, { min: 0 }),
    selectControl('Style', BORDER_STYLES, css('border-style', { read: () => computed(el, 'border-top-style') })),
    colorControl('Colour', css('border-color', { read: () => computed(el, 'border-top-color') }), { palette }),
    numberControl('Radius', css('border-radius', { read: () => computed(el, 'border-top-left-radius') }), { min: 0 }),
  );
  return { title: 'Fill & border', controls };
}

function layoutSection(editor: Editor, el: Element, els: Element[], css: Css): Section {
  const size = (dim: 'width' | 'height'): Binding<string> =>
    css(dim, {
      read: () => `${r2(el.getBoundingClientRect()[dim])}px`,
      write: (e, v) => setStyle(e, dim, toContentSize(e, dim, v)),
    });
  const shift = (axis: 0 | 1): Binding<string> =>
    css('translate', {
      read: () => `${parseCssTranslate(computed(el, 'translate'))[axis]}px`,
      write: (e, v) => {
        const cur = parseCssTranslate(computed(e, 'translate'));
        cur[axis] = parseFloat(v) || 0;
        if (computed(e, 'display') === 'inline') setStyle(e, 'display', 'inline-block');
        setStyle(e, 'translate', formatCssTranslate(cur[0], cur[1]));
      },
    });
  const z = css('z-index', {
    read: () => {
      const v = computed(el, 'z-index');
      return v === 'auto' ? '' : v;
    },
    write: (e, v) => {
      setStyle(e, 'z-index', v);
      // z-index only works on positioned elements.
      if (v && computed(e, 'position') === 'static') setStyle(e, 'position', 'relative');
    },
  });
  return {
    title: 'Size & position',
    controls: [
      gridControl('', [numberControl('W', size('width'), { inline: true, min: 0 }), numberControl('H', size('height'), { inline: true, min: 0 })]),
      gridControl('', [numberControl('X', shift(0), { inline: true }), numberControl('Y', shift(1), { inline: true })]),
      numberControl('Layer', z, { unit: '', placeholder: 'auto' }),
      buttonsControl([
        {
          label: 'Reset move',
          title: 'Put it back where the layout places it',
          run: () => editor.edit('Reset position', () => els.forEach((e) => setStyle(e, 'translate', ''))),
        },
        {
          label: 'Auto size',
          title: 'Remove the width/height set here',
          run: () =>
            editor.edit('Auto size', () => {
              for (const e of els) {
                setStyle(e, 'width', '');
                setStyle(e, 'height', '');
              }
            }),
        },
      ]),
    ],
  };
}

/** The W/H fields show the outer size; convert to what `width` means for this box. */
function toContentSize(el: Element, dim: 'width' | 'height', v: string): string {
  const m = /^(-?[\d.]+)px$/.exec(v);
  if (!m || computed(el, 'box-sizing') === 'border-box') return v;
  const sides = dim === 'width' ? ['left', 'right'] : ['top', 'bottom'];
  const extra = sides.reduce((s, side) => s + (parseFloat(computed(el, `padding-${side}`)) || 0) + (parseFloat(computed(el, `border-${side}-width`)) || 0), 0);
  return `${r2(Math.max(0, parseFloat(m[1]) - extra))}px`;
}

function spacingSection(css: Css): Section {
  const four = (kind: 'padding' | 'margin') =>
    gridControl(
      cap(kind),
      (['top', 'right', 'bottom', 'left'] as const).map((side) =>
        numberControl(side[0].toUpperCase(), css(`${kind}-${side}`), { inline: true, min: kind === 'padding' ? 0 : undefined }),
      ),
      2,
    );
  return { title: 'Spacing', controls: [four('padding'), four('margin')] };
}

function effectsSection(css: Css): Section {
  const opacity = css('opacity');
  return {
    title: 'Effects',
    controls: [
      sliderControl('Opacity', { min: 0, max: 100, suffix: '%' }, {
        get: () => Math.round((parseFloat(opacity.get()) || 0) * 100),
        set: (v, final) => opacity.set(String(r2(v / 100)), final),
      }),
      selectControl('Shadow', SHADOWS, shadowPreset(css('box-shadow'))),
      textControl('Custom', css('box-shadow'), { mono: true, placeholder: 'e.g. 0 2px 8px #0003' }),
    ],
  };
}

/** Map the computed shadow back to a preset name by comparing normalised values. */
function shadowPreset(bind: Binding<string>): Binding<string> {
  return {
    get: () => {
      const v = bind.get();
      if (v === 'none') return 'none';
      const norm = normShadow(v);
      return SHADOWS.find((s) => s.value !== 'none' && normShadow(s.value) === norm)?.value ?? '__custom';
    },
    set: bind.set,
  };
}

/** "rgba(0, 0, 0, 0.12) 0px 1px 3px 0px" and "0 1px 3px rgba(0,0,0,.12)" -> same key. */
function normShadow(v: string): string {
  return v
    .split(/,(?![^(]*\))/)
    .map((part) => {
      const color = /rgba?\([^)]*\)|#[0-9a-f]+/i.exec(part)?.[0] ?? '';
      const nums = part.replace(color, '').trim().split(/\s+/).map((n) => parseFloat(n) || 0);
      while (nums.length < 4) nums.push(0);
      return `${nums.join(',')}|${color.replace(/\s/g, '').replace(/0\./g, '.')}`;
    })
    .join(';');
}

function contentSection(el: Element, attr: Attr): Section | null {
  const controls: Control[] = [];
  if (el.localName === 'a') controls.push(textControl('Link', attr('href'), { placeholder: 'https://…' }));
  if (el.localName === 'img') {
    controls.push(textControl('Source', attr('src'), { mono: true }), textControl('Alt text', attr('alt')));
  }
  return controls.length ? { title: 'Content', controls } : null;
}

function customSection(editor: Editor, el: Element): Section {
  const id = elementKey(el);
  return {
    title: 'Custom CSS',
    controls: [
      textControl('Inline style of this element', {
        get: () => (el.getAttribute('style') ?? '').replace(/;\s*/g, ';\n').trim(),
        set: (v) =>
          editor.edit('Edit custom CSS', () => {
            const clean = v.replace(/\n/g, ' ').trim();
            setAttr(el, 'style', clean || null);
          }, `${id}:@style`),
      }, { multiline: true, mono: true, placeholder: 'color: red;\nborder: 2px dashed teal;' }),
    ],
  };
}

function pageSections(editor: Editor, el: Element, css: Css, palette: Palette): Section[] {
  const fonts = editor.doc ? collectFonts(editor.doc) : [];
  return [
    {
      title: 'Page',
      controls: [
        colorControl('Background', css('background-color'), { none: 'transparent', palette }),
        colorControl('Text', css('color'), { palette }),
        textControl('Font', css('font-family'), { list: fonts }),
        numberControl('Font size', css('font-size'), { min: 1 }),
      ],
    },
    spacingSection(css),
    customSection(editor, el),
  ];
}

// ---------------------------------------------------------------- SVG

function svgSections(editor: Editor, el: Element, els: Element[], css: Css, attr: Attr, palette: Palette): Section[] {
  const multi = els.length > 1;
  const key = els.map(elementKey).join('+');
  const sections: Section[] = [];
  const shape: Control[] = [];
  const isLine = el.localName === 'line' || el.localName === 'polyline';
  if (!isLine) shape.push(colorControl('Fill', css('fill'), { none: 'none', palette }));
  shape.push(
    colorControl('Stroke', css('stroke'), { none: 'none', palette }),
    numberControl('Width', css('stroke-width'), { min: 0, step: 0.5 }),
    selectControl('Line', DASHES, css('stroke-dasharray')),
    selectControl('Ends', [
      { value: 'butt', label: 'Flat' },
      { value: 'round', label: 'Round' },
      { value: 'square', label: 'Square' },
    ], css('stroke-linecap')),
  );
  const opacity = css('opacity');
  shape.push(
    sliderControl('Opacity', { min: 0, max: 100, suffix: '%' }, {
      get: () => Math.round((parseFloat(opacity.get()) || 0) * 100),
      set: (v, final) => opacity.set(String(r2(v / 100)), final),
    }),
  );
  sections.push({ title: el.localName === 'text' ? 'Text colour' : 'Shape', controls: shape });

  if (canHaveMarkers(el)) {
    const heads: Control[] = [];
    for (const which of ['start', 'end'] as MarkerEnd[]) {
      const marker = markerOf(el, which);
      if (!marker) continue;
      if (followsLine(marker)) {
        heads.push(noteControl(`${cap(which)} arrowhead follows the line colour.`));
        continue;
      }
      heads.push(
        colorControl(`${cap(which)} head`, {
          get: () => {
            const m = markerOf(el, which);
            return m ? markerColor(m) : '';
          },
          set: (v) =>
            editor.edit('Arrowhead colour', () => {
              for (const own of ensureGroupMarker(els.filter(canHaveMarkers), which)) setMarkerColor(own, v);
            }, `${key}:marker-${which}`),
        }, { palette }),
      );
    }
    if (heads.length) sections.push({ title: 'Arrowheads', controls: heads });
  }

  const shift = (axis: 0 | 1): Binding<string> => ({
    get: () => String(readSvgTranslate(el.getAttribute('transform'))[axis]),
    set: (v) =>
      editor.edit('Move', () => {
        for (const e of els) {
          const t = e.getAttribute('transform');
          const d = (parseFloat(v) || 0) - readSvgTranslate(t)[axis];
          setAttr(e, 'transform', addSvgTranslate(t, axis === 0 ? d : 0, axis === 1 ? d : 0) || null);
        }
      }, `${key}:shift`),
  });
  const geo: Control[] = [
    gridControl('Moved', [numberControl('X', shift(0), { inline: true, unit: '' }), numberControl('Y', shift(1), { inline: true, unit: '' })]),
  ];
  const nums = (names: string[]) =>
    gridControl('', names.map((n) => numberControl(n, attr(n), { inline: true, unit: '' })), 2);
  // Exact coordinates only make sense for one shape at a time.
  if (!multi) switch (el.localName) {
    case 'rect':
      geo.push(nums(['x', 'y', 'width', 'height']), gridControl('', [numberControl('rx', attr('rx'), { inline: true, unit: '', min: 0 })], 2));
      break;
    case 'circle':
      geo.push(nums(['cx', 'cy', 'r']));
      break;
    case 'ellipse':
      geo.push(nums(['cx', 'cy', 'rx', 'ry']));
      break;
    case 'line':
      geo.push(nums(['x1', 'y1', 'x2', 'y2']));
      break;
    case 'text':
      geo.push(nums(['x', 'y']));
      break;
    case 'image':
    case 'foreignObject':
      geo.push(nums(['x', 'y', 'width', 'height']));
      break;
  }
  sections.push({ title: 'Position', controls: geo });

  if (el.localName === 'text' || el.localName === 'tspan') {
    const text: Control[] = [];
    // With several selected the words differ per element; the styles below still apply to all.
    if (!multi && el.children.length === 0) {
      text.push(textControl('Text', {
        get: () => el.textContent ?? '',
        set: (v) => editor.edit('Edit text', () => { el.textContent = v; }, `${key}:text`),
      }));
    } else if (!multi) {
      text.push(noteControl('Has styled parts — select a part to edit its words.'));
    }
    text.push(
      textControl('Font', css('font-family'), { list: editor.doc ? collectFonts(editor.doc) : [] }),
      numberControl('Size', css('font-size'), { min: 1 }),
      selectControl('Weight', WEIGHTS, css('font-weight')),
      selectControl('Anchor', [
        { value: 'start', label: 'Start' },
        { value: 'middle', label: 'Middle' },
        { value: 'end', label: 'End' },
      ], css('text-anchor')),
    );
    sections.push({ title: 'Text', controls: text });
  }

  if (!multi) sections.push(customSection(editor, el));
  return sections;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
