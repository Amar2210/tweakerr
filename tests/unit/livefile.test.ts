import { describe, expect, it } from 'vitest';
import { applySwaps, findText, placeEditsBlock, saveLiveFile } from '../../src/doc/livefile';

const PAGE = `<html><head><title>x</title></head><body><h1>Order to cash</h1>
<script>
  const steps = [{ title: 'Invoice', note: "Finance sends it" }, { title: 'Cash', note: "Finance sends it" }];
  const tip = \`It's \${steps.length} steps\`;
</script></body></html>`;

describe('text swaps', () => {
  it('finds a label written once as a string in the code', () => {
    const f = findText(PAGE, 'Invoice')!;
    expect(PAGE.slice(f.index, f.index + f.length)).toBe("'Invoice'");
    expect(applySwaps(PAGE, [{ from: 'Invoice', to: 'Billing' }])).toContain("title: 'Billing'");
  });

  it('escapes the new words for the quotes they sit in', () => {
    const out = applySwaps(PAGE, [{ from: 'Invoice', to: "Customer's bill" }]);
    expect(out).toContain("title: 'Customer\\'s bill'");
  });

  it('refuses words written more than once, or built from pieces', () => {
    expect(findText(PAGE, 'Finance sends it')).toBeNull();
    expect(findText(PAGE, "It's 2 steps")).toBeNull();
    expect(findText(PAGE, 'Nowhere')).toBeNull();
  });

  it('falls back to plain text in the page', () => {
    expect(applySwaps(PAGE, [{ from: 'Order to cash', to: 'Order & cash' }])).toContain('<h1>Order &amp; cash</h1>');
  });

  it('applies swaps in order, so a changed label can change again', () => {
    const out = applySwaps(PAGE, [
      { from: 'Invoice', to: 'Bill' },
      { from: 'Bill', to: 'Billing' },
    ]);
    expect(out).toContain("title: 'Billing'");
  });
});

describe('words written several times', () => {
  const DATA = `<script>
  const nodes = [
    {id:"k_emp",t:"Employee data",team:"HR"},
    {id:"k_con",t:"Contract employees",team:"HR", note:"a } in a string", /* and { in a comment */},
    ["Travel", "HR"],
  ];
</script>`;

  it('picks the copy in the same {…} as the item\'s other words', () => {
    expect(findText(DATA, 'HR')).toBeNull();
    const out = applySwaps(DATA, [{ from: 'HR', to: 'People', anchor: 'Contract employees' }]);
    expect(out).toContain('{id:"k_con",t:"Contract employees",team:"People"');
    expect(out.match(/"HR"/g)).toHaveLength(2);
  });

  it('works for […] too, and ignores brackets inside strings and comments', () => {
    expect(applySwaps(DATA, [{ from: 'HR', to: 'People', anchor: 'Travel' }])).toContain('["Travel", "People"]');
    expect(applySwaps(DATA, [{ from: 'HR', to: 'People', anchor: 'Employee data' }])).toContain('t:"Employee data",team:"People"');
  });

  it('refuses when the anchor is itself written twice, or the group holds both copies', () => {
    expect(findText(DATA + '<script>x("Travel")</script>', 'HR', 'Travel')).toBeNull();
    expect(findText('<script>[{a:"X", b:"HR", c:"HR"}]</script>', 'HR', 'X')).toBeNull();
  });
});

describe('edits block', () => {
  const rules = ['#a { color: red !important; }'];

  it('goes at the end of <head>', () => {
    expect(placeEditsBlock(PAGE, rules)).toContain(
      '<title>x</title><style id="tweakerr-edits">\n/* Changes made with Tweakerr. Delete this block to undo them all. */\n#a { color: red !important; }\n</style>\n</head>',
    );
  });

  it('replaces the block from an earlier save, and goes away when empty', () => {
    const once = placeEditsBlock(PAGE, rules);
    const twice = placeEditsBlock(once, ['#b { color: blue !important; }']);
    expect(twice.match(/tweakerr-edits/g)).toHaveLength(1);
    expect(twice).toContain('#b { color: blue');
    expect(twice).not.toContain('#a {');
    expect(placeEditsBlock(once, [])).toBe(PAGE);
  });

  it('keeps Windows line endings', () => {
    const crlf = PAGE.replace(/\n/g, '\r\n');
    const out = saveLiveFile(crlf, rules, []);
    expect(out).toContain('<style id="tweakerr-edits">\r\n');
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('with no changes, saves the file exactly as it was', () => {
    expect(saveLiveFile(PAGE, [], [])).toBe(PAGE);
  });
});
