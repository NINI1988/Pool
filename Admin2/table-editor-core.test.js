'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const core = require('./table-editor-core.js');

function selection(top, left, bottom = top, right = left) {
  return {
    start: { row: top, column: left },
    end: { row: bottom, column: right },
  };
}

test('finds and round-trips a Markdown table with formatted cells and links', () => {
  const source = [
    '| **Funktion** | **Name** | **E-Mail** | **Telefon** |',
    '| --- | --- | --- | --- |',
    '| **1. Vorsitzende** | Eva Schlüter | [eva.schlueter0412@gmail.com](mailto:eva.schlueter0412@gmail.com) | |',
  ].join('\n');
  const match = ('Text davor\n\n' + source + '\n\nText danach').match(core.TABLE_PATTERN);

  assert.ok(match);
  const model = core.parseTable(match[0]);
  assert.equal(model.format, core.FORMAT_MARKDOWN);
  assert.equal(core.getColumnCount(model), 4);
  assert.equal(model.rows[1].cells[0].text, '1. Vorsitzende');
  assert.equal(model.rows[1].cells[0].style['font-weight'], '700');
  assert.match(core.serializeMarkdown(model), /\*\*1\. Vorsitzende\*\*/);
  assert.match(core.serializeMarkdown(model), /\[eva\.schlueter0412@gmail\.com]/);
});

test('recognizes escaped pipes and pipes inside inline code', () => {
  const source = [
    '| Name | Ausdruck |',
    '| --- | :---: |',
    '| A \\| B | `left | right` |',
  ].join('\n');
  const match = ('Text davor\n\n' + source + '\n\nText danach').match(core.TABLE_PATTERN);

  assert.equal(match?.[0], source);
  const model = core.parseMarkdownTable(match[0]);
  assert.equal(model.rows[1].cells[0].text, 'A | B');
  assert.equal(model.rows[1].cells[1].text, '`left | right`');
  assert.match(core.serializeMarkdown(model), /A \\| B/);
});

test('parses and serializes the existing HTML table without changing its format', () => {
  const source = [
    '<table class="excel" width="460">',
    '<tr><td width="120">Datum</td><td>Termin</td></tr>',
    '<tr><td>01.01.</td><td style="background: red">Neujahr</td></tr>',
    '</table>',
  ].join('');
  const model = core.parseTable(source);
  assert.equal(model.format, core.FORMAT_HTML);
  assert.equal(model.tableStyle.width, '460px');
  assert.equal(model.rows[1].cells[1].style.background, 'red');
  assert.equal(model.columnWidths[0], '120px');

  const serialized = core.serializeTable(model);
  assert.match(serialized, /^<table class="excel"/);
  assert.match(serialized, /<col style="width: 120px">/);
  assert.match(serialized, /background: red/);
  assert.doesNotMatch(serialized, /^\|/);
});

test('imports Excel HTML styles, dimensions and merged cells', () => {
  const source = [
    '<style>.xl65 { background-color: #47D359; font-weight: 700; }</style>',
    '<table width="300"><tr height="28">',
    '<th class="xl65" colspan="2">Plan</th>',
    '</tr><tr><td rowspan="2">A</td><td style="text-align: right">1</td></tr>',
    '<tr><td>2</td></tr></table>',
  ].join('');
  const model = core.parseClipboardTable(source, '');

  assert.equal(model.tableStyle.width, '300px');
  assert.equal(model.rows[0].cells[0].colspan, 2);
  assert.equal(model.rows[0].cells[0].style['background-color'], '#47D359');
  assert.equal(model.rows[0].height, '28px');
  assert.equal(model.rows[1].cells[0].rowspan, 2);
  assert.match(core.serializeHtml(model), /colspan="2"/);
  assert.match(core.serializeHtml(model), /rowspan="2"/);
});

test('preserves supported inline HTML formatting as editable Markdown markup', () => {
  const source = [
    '<table><tr><td>',
    '<strong>Fett</strong> <em>Kursiv</em> <s>Alt</s> ',
    '<a href="/kontakt/">Kontakt</a><br><code>42</code>',
    '</td></tr></table>',
  ].join('');
  const model = core.parseHtmlTable(source);

  assert.equal(
    model.rows[0].cells[0].text,
    '**Fett** _Kursiv_ ~~Alt~~ [Kontakt](/kontakt/)\n`42`',
  );
  const serialized = core.serializeHtml(model);
  assert.match(serialized, /<strong>Fett<\/strong>/);
  assert.match(serialized, /<a href="\/kontakt\/">Kontakt<\/a>/);
});

test('pastes TSV values at the selected cell and grows the table', () => {
  const target = core.createEmptyModel(core.FORMAT_MARKDOWN, 2, 2);
  const clipboard = core.parseClipboardTable('', 'Alpha\tBeta\n10\t20');
  const pasted = core.pasteTable(target, clipboard, 1, 1);

  assert.equal(pasted.rows.length, 3);
  assert.equal(core.getColumnCount(pasted), 3);
  assert.equal(pasted.rows[1].cells[1].text, 'Alpha');
  assert.equal(pasted.rows[2].cells[2].text, '20');
  assert.equal(core.hasHtmlOnlyFormatting(clipboard), false);
});

test('recognizes a vertical one-column clipboard range and grows the table', () => {
  const target = core.createEmptyModel(core.FORMAT_MARKDOWN, 2, 2);
  const clipboard = core.parseClipboardTable('', 'Alpha\nBeta\nGamma');
  const pasted = core.pasteTable(target, clipboard, 1, 1);

  assert.ok(clipboard);
  assert.equal(clipboard.rows.length, 3);
  assert.equal(core.getColumnCount(clipboard), 1);
  assert.equal(pasted.rows.length, 4);
  assert.equal(pasted.rows[1].cells[1].text, 'Alpha');
  assert.equal(pasted.rows[3].cells[1].text, 'Gamma');
});

test('keeps Excel formatting in HTML and expands rows and columns', () => {
  const excelHtml = [
    '<style>.xl65 { background-color: #47d359; font-weight: 700; }</style>',
    '<table><col width="80"><col width="120"><col width="60">',
    '<tr height="24"><td class="xl65">A</td><td>B</td><td>C</td></tr>',
    '<tr><td>1</td><td>2</td><td>3</td></tr></table>',
  ].join('');
  const clipboard = core.parseClipboardTable(excelHtml, 'A\tB\tC\n1\t2\t3');
  const target = core.createEmptyModel(core.FORMAT_HTML, 1, 1);
  const pasted = core.pasteTable(target, clipboard, 0, 0);

  assert.equal(pasted.rows.length, 2);
  assert.equal(core.getColumnCount(pasted), 3);
  assert.deepEqual(pasted.columnWidths, ['80px', '120px', '60px']);
  assert.equal(pasted.rows[0].height, '24px');
  assert.equal(pasted.rows[0].cells[0].style['background-color'], '#47d359');
  assert.equal(pasted.rows[0].cells[0].style['font-weight'], '700');
});

test('keeps Markdown format and only pastes Excel values', () => {
  const excelHtml = [
    '<style>.xl65 { background-color: red; font-weight: 700; }</style>',
    '<table><tr><td class="xl65">A</td><td>B</td></tr>',
    '<tr><td>C</td><td>D</td></tr></table>',
  ].join('');
  const clipboard = core.parseClipboardTable(excelHtml, 'A\tB\nC\tD');
  const target = core.createEmptyModel(core.FORMAT_MARKDOWN, 1, 1);
  const pasted = core.pasteTable(target, clipboard, 0, 0);

  assert.equal(pasted.format, core.FORMAT_MARKDOWN);
  assert.equal(pasted.rows.length, 2);
  assert.equal(core.getColumnCount(pasted), 2);
  assert.equal(pasted.rows[0].cells[0].text, 'A');
  assert.deepEqual(pasted.rows[0].cells[0].style, {});
  assert.deepEqual(pasted.columnWidths, ['', '']);
  assert.equal(core.hasHtmlOnlyFormatting(clipboard), true);
});

test('supports row and column operations while preserving affected merges', () => {
  let model = core.changeFormat(core.createEmptyModel(core.FORMAT_MARKDOWN, 3, 3), core.FORMAT_HTML);
  model = core.setCellText(model, 0, 0, 'Merged');
  model = core.mergeSelection(model, selection(0, 0, 1, 1));

  const withoutSecondRow = core.removeRow(model, 1);
  assert.equal(withoutSecondRow.rows[0].cells[0].text, 'Merged');
  assert.equal(withoutSecondRow.rows[0].cells[0].rowspan, 1);
  assert.equal(withoutSecondRow.rows[0].cells[0].colspan, 2);

  const withoutFirstColumn = core.removeColumn(withoutSecondRow, 0);
  assert.equal(withoutFirstColumn.rows[0].cells[0].text, 'Merged');
  assert.equal(withoutFirstColumn.rows[0].cells[0].colspan, 1);

  assert.equal(core.addRow(withoutFirstColumn, 0).rows.length, 3);
  assert.equal(core.getColumnCount(core.addColumn(withoutFirstColumn, 0)), 3);
});

test('moves a spanning cell when its origin row or column is deleted', () => {
  let rowModel = core.changeFormat(
    core.createEmptyModel(core.FORMAT_MARKDOWN, 3, 2),
    core.FORMAT_HTML,
  );
  rowModel = core.setCellText(rowModel, 0, 0, 'Vertikal');
  rowModel = core.mergeSelection(rowModel, selection(0, 0, 1, 0));
  rowModel = core.removeRow(rowModel, 0);
  assert.equal(rowModel.rows[0].cells[0].text, 'Vertikal');
  assert.equal(rowModel.rows[0].cells[0].rowspan, 1);

  let columnModel = core.changeFormat(
    core.createEmptyModel(core.FORMAT_MARKDOWN, 2, 3),
    core.FORMAT_HTML,
  );
  columnModel = core.setCellText(columnModel, 0, 0, 'Horizontal');
  columnModel = core.mergeSelection(columnModel, selection(0, 0, 0, 1));
  columnModel = core.removeColumn(columnModel, 0);
  assert.equal(columnModel.rows[0].cells[0].text, 'Horizontal');
  assert.equal(columnModel.rows[0].cells[0].colspan, 1);
});

test('merges and splits rectangular HTML selections', () => {
  let model = core.changeFormat(core.createEmptyModel(core.FORMAT_MARKDOWN, 2, 2), core.FORMAT_HTML);
  model = core.setCellText(model, 0, 0, 'A');
  model = core.setCellText(model, 0, 1, 'B');
  model = core.mergeSelection(model, selection(0, 0, 1, 1));

  assert.equal(model.rows[0].cells[0].text, 'A\nB');
  assert.equal(model.rows[0].cells[0].rowspan, 2);
  assert.equal(model.rows[0].cells[0].colspan, 2);

  model = core.splitSelection(model, selection(1, 1));
  assert.equal(model.rows[0].cells[0].rowspan, 1);
  assert.equal(model.rows[0].cells[0].colspan, 1);
});

test('stores dimensions per selected columns and rows', () => {
  let model = core.createEmptyModel(core.FORMAT_HTML, 3, 3);
  model = core.setColumnWidth(model, selection(0, 1, 2, 2), '140px');
  model = core.setRowHeight(model, selection(1, 0, 2, 2), '55px');

  assert.deepEqual(model.columnWidths, ['', '140px', '140px']);
  assert.deepEqual(
    model.rows.map((row) => row.height),
    ['', '55px', '55px'],
  );
  assert.match(core.serializeHtml(model), /<col style="width: 140px">/);
  assert.match(core.serializeHtml(model), /<tr style="height: 55px">/);
});

test('visualizes whole-cell Markdown emphasis without accumulating markers', () => {
  let model = core.parseMarkdownTable([
    '| Fett | Kursiv | Beides |',
    '| --- | --- | --- |',
    '| **Text** | _Text_ | ***Text*** |',
  ].join('\n'));

  assert.equal(model.rows[1].cells[0].text, 'Text');
  assert.equal(model.rows[1].cells[0].style['font-weight'], '700');
  assert.equal(model.rows[1].cells[1].style['font-style'], 'italic');
  assert.deepEqual(model.rows[1].cells[2].style, {
    'font-style': 'italic',
    'font-weight': '700',
  });

  model = core.toggleCellStyle(model, selection(1, 0), 'font-weight', '700');
  assert.equal(core.serializeMarkdown(model).split('\n')[2], '| Text | _Text_ | ***Text*** |');
  model = core.toggleCellStyle(model, selection(1, 0), 'font-weight', '700');
  assert.equal(model.rows[1].cells[0].text, 'Text');
  assert.match(core.serializeMarkdown(model), /\| \*\*Text\*\* \|/);
});

test('only drops HTML-only formatting during an explicit Markdown conversion', () => {
  let model = core.changeFormat(core.createEmptyModel(core.FORMAT_MARKDOWN, 2, 2), core.FORMAT_HTML);
  model = core.applyStyle(model, selection(1, 0), 'background-color', '#ff0000');
  model = core.applyStyle(model, selection(1, 0), 'text-align', 'right');

  assert.equal(core.componentValueFromModel(model).format, core.FORMAT_HTML);
  const markdown = core.changeFormat(model, core.FORMAT_MARKDOWN);
  assert.equal(markdown.rows[1].cells[0].style['background-color'], undefined);
  assert.equal(markdown.rows[1].cells[0].style['text-align'], 'right');
});

test('updates related background and border styles atomically', () => {
  let model = core.changeFormat(core.createEmptyModel(core.FORMAT_MARKDOWN, 2, 2), core.FORMAT_HTML);
  model = core.applyStyles(model, selection(1, 0), {
    background: '',
    'background-color': '#00ff00',
    border: '1px solid #808080',
    'border-left-color': '',
  });

  assert.deepEqual(model.rows[1].cells[0].style, {
    'background-color': '#00ff00',
    border: '1px solid #808080',
  });
});

test('rejects unsafe and unsupported inline styles', () => {
  const style = core.parseStyle(
    'color: red; background-image: url(javascript:alert(1)); width: 100px; unknown: yes',
  );

  assert.deepEqual(style, { color: 'red', width: '100px' });
  assert.equal(core.sanitizeStyleValue('expression(alert(1))'), '');
});

test('component values are deterministic and recover from malformed data', () => {
  const model = core.parseMarkdownTable('| A | B |\n| --- | --- |\n| 1 | 2 |');
  const value = core.componentValueFromModel(model);

  assert.deepEqual(core.modelFromComponentValue(value), model);
  assert.equal(
    core.modelFromComponentValue({ format: 'html', data: '{broken' }).format,
    core.FORMAT_HTML,
  );
});

test('migrates version 1 cell dimensions and Markdown markers into version 2 fields', () => {
  const legacyValue = {
    format: 'markdown',
    data: JSON.stringify({
      version: 1,
      format: 'markdown',
      tableStyle: {},
      rows: [
        {
          cells: [
            {
              text: '***Überschrift***',
              header: true,
              colspan: 1,
              rowspan: 1,
              style: { width: '120px', height: '45px' },
            },
          ],
        },
      ],
    }),
  };
  const markdown = core.modelFromComponentValue(legacyValue);

  assert.equal(markdown.version, 2);
  assert.equal(markdown.rows[0].cells[0].text, 'Überschrift');
  assert.equal(markdown.rows[0].cells[0].style['font-weight'], '700');
  assert.equal(markdown.rows[0].cells[0].style['font-style'], 'italic');
  assert.deepEqual(markdown.columnWidths, ['']);
  assert.equal(markdown.rows[0].height, '');

  const legacyHtml = core.normalizeModel({
    version: 1,
    format: 'html',
    rows: [
      {
        cells: [core.createCell({ text: 'A', style: { width: '120px', height: '45px' } })],
      },
    ],
  });
  assert.deepEqual(legacyHtml.columnWidths, ['120px']);
  assert.equal(legacyHtml.rows[0].height, '45px');
  assert.deepEqual(legacyHtml.rows[0].cells[0].style, {});
});
