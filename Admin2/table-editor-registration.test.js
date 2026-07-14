'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const adminDirectory = __dirname;

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') {
    return undefined;
  }

  if (predicate(node)) {
    return node;
  }

  for (const child of node.children ?? []) {
    const nestedChildren = Array.isArray(child) ? child : [child];

    for (const nestedChild of nestedChildren) {
      const match = findNode(nestedChild, predicate);

      if (match) {
        return match;
      }
    }
  }

  return undefined;
}

test('registers the table as an interactive Sveltia editor component', () => {
  let registeredComponent;
  const context = {
    clearTimeout,
    console,
    setTimeout,
  };

  context.window = context;
  context.CMS = {
    registerEditorComponent(component) {
      registeredComponent = component;
    },
  };
  context.createClass = (definition) => definition;
  context.h = (type, props, ...children) => ({ type, props, children });

  vm.runInNewContext(
    fs.readFileSync(path.join(adminDirectory, 'table-editor-core.js'), 'utf8'),
    context,
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(adminDirectory, 'table-editor.js'), 'utf8'),
    context,
  );

  assert.equal(registeredComponent.id, 'editable-table');
  assert.equal(registeredComponent.label, 'Tabelle');
  assert.equal(typeof registeredComponent.control.render, 'function');

  const source = '| A | B |\n| --- | ---: |\n| 1 | 2 |';
  const match = source.match(registeredComponent.pattern);
  const value = registeredComponent.fromBlock(match);

  assert.equal(value.format, 'markdown');
  assert.equal(registeredComponent.toBlock(value), source);
  assert.match(registeredComponent.toPreview(value), /^<table class="excel">/);

  const formattedValue = registeredComponent.fromBlock(
    '| A | B |\n| --- | --- |\n| ***Text*** | Normal |'.match(registeredComponent.pattern),
  );
  const control = registeredComponent.control;
  const controlContext = {
    ...control,
    state: {
      model: context.PoolTableEditorCore.modelFromComponentValue(formattedValue),
      selection: { start: { row: 1, column: 0 }, end: { row: 1, column: 0 } },
    },
  };
  const toolbar = control.renderToolbar.call(controlContext);
  const boldButton = findNode(toolbar, (node) => node.props?.['aria-label'] === 'Fett');
  const italicButton = findNode(toolbar, (node) => node.props?.['aria-label'] === 'Kursiv');
  const table = control.renderTable.call(controlContext);
  const tableScroll = findNode(
    table,
    (node) => node.props?.className === 'pte-table-scroll',
  );
  const textarea = findNode(table, (node) => node.type === 'textarea');

  assert.equal(boldButton.props['aria-pressed'], 'true');
  assert.equal(italicButton.props['aria-pressed'], 'true');
  assert.equal(tableScroll.props.onPasteCapture, control.handlePaste);
  assert.equal(textarea.props.onPaste, undefined);
});

test('intercepts a spreadsheet paste and distributes its cells', () => {
  let emitted;
  let prevented = false;
  let stopped = false;
  const context = {
    clearTimeout,
    console,
    setTimeout,
  };

  context.window = context;
  context.CMS = {
    registerEditorComponent(component) {
      context.registeredComponent = component;
    },
  };
  context.createClass = (definition) => definition;
  context.h = (type, props, ...children) => ({ type, props, children });

  vm.runInNewContext(
    fs.readFileSync(path.join(adminDirectory, 'table-editor-core.js'), 'utf8'),
    context,
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(adminDirectory, 'table-editor.js'), 'utf8'),
    context,
  );

  const control = context.registeredComponent.control;
  const controlContext = {
    ...control,
    state: {
      model: context.PoolTableEditorCore.createEmptyModel('markdown', 2, 2),
      selection: { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
    },
    setState() {},
    emitModel(model, selection) {
      emitted = { model, selection };
    },
  };
  const event = {
    clipboardData: {
      getData(type) {
        return type === 'text/plain' ? 'A\tB\nC\tD' : '';
      },
    },
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {
      stopped = true;
    },
  };

  control.handlePaste.call(controlContext, event);
  clearTimeout(controlContext.pasteMessageTimer);

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(emitted.model.rows.length, 3);
  assert.equal(context.PoolTableEditorCore.getColumnCount(emitted.model), 3);
  assert.equal(emitted.model.rows[1].cells[1].text, 'A');
  assert.equal(emitted.model.rows[2].cells[2].text, 'D');
  assert.equal(emitted.selection.start.row, 1);
  assert.equal(emitted.selection.start.column, 1);
  assert.equal(emitted.selection.end.row, 2);
  assert.equal(emitted.selection.end.column, 2);
});

test('keeps the official Sveltia 0.170.8 bundle byte-for-byte unchanged', () => {
  const bundle = fs.readFileSync(
    path.join(adminDirectory, 'sveltia-cms-original-0.170.8.js'),
  );
  const checksum = crypto.createHash('sha256').update(bundle).digest('hex');

  assert.equal(checksum, '89e68943587a689f4369b773fba3a5b81f4088ddf97aaf05aee6e45911f2f037');
});

test('keeps the cell selection marker inside the table overflow area', () => {
  const css = fs.readFileSync(path.join(adminDirectory, 'table-editor.css'), 'utf8');
  const selectionRule = css.match(/\.pte-cell\.is-selected::after\s*\{([^}]+)\}/)?.[1];

  assert.ok(selectionRule, 'Expected a CSS rule for selected table cells');
  assert.match(selectionRule, /inset:\s*0;/);
  assert.match(selectionRule, /box-shadow:\s*inset\b/);
  assert.doesNotMatch(selectionRule, /inset:\s*-/);
});

test('stretches cell textareas to the full table row height', () => {
  const css = fs.readFileSync(path.join(adminDirectory, 'table-editor.css'), 'utf8');
  const cellRule = css.match(/\.pte-cell\s*\{([^}]+)\}/)?.[1];
  const textareaRule = css.match(/\.pte-cell textarea\s*\{([^}]+)\}/)?.[1];

  assert.ok(cellRule, 'Expected a CSS rule for table cells');
  assert.ok(textareaRule, 'Expected a CSS rule for table cell textareas');
  assert.match(cellRule, /height:\s*1px;/);
  assert.match(textareaRule, /height:\s*100%;/);
});
