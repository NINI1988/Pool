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
  const registeredComponents = [];
  const documentListenerCalls = [];
  const context = {
    clearTimeout,
    console,
    document: {
      addEventListener(...args) {
        documentListenerCalls.push(['add', ...args]);
      },
      removeEventListener(...args) {
        documentListenerCalls.push(['remove', ...args]);
      },
    },
    setTimeout,
  };

  context.window = context;
  context.CMS = {
    registerEditorComponent(component) {
      registeredComponents.push(component);
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

  const markdownComponent = registeredComponents.find(({ id }) => id === 'editable-table');
  const htmlComponent = registeredComponents.find(({ id }) => id === 'editable-html-table');

  assert.equal(registeredComponents.length, 2);
  assert.equal(markdownComponent.label, 'Einfache Tabelle (Markdown)');
  assert.equal(htmlComponent.label, 'Formatierte Tabelle (HTML)');
  assert.equal(typeof markdownComponent.control.render, 'function');

  const source = '| A | B |\n| --- | ---: |\n| 1 | 2 |';
  const match = source.match(markdownComponent.pattern);
  const value = markdownComponent.fromBlock(match);

  assert.equal(value.format, 'markdown');
  assert.equal(markdownComponent.toBlock(value), source);
  assert.match(markdownComponent.toPreview(value), /^<table class="excel">/);
  assert.equal('<table><tr><td>A</td></tr></table>'.match(markdownComponent.pattern), null);
  assert.equal(source.match(htmlComponent.pattern), null);
  assert.equal(
    JSON.parse(htmlComponent.fields.find(({ name }) => name === 'data').default).format,
    'html',
  );
  const htmlSource = '<table><tr><td>A</td><td>B</td></tr></table>';
  const htmlValue = htmlComponent.fromBlock(htmlSource.match(htmlComponent.pattern));

  assert.equal(htmlValue.format, 'html');
  assert.match(htmlComponent.toBlock(htmlValue), /^<table class="excel">/);

  const formattedValue = markdownComponent.fromBlock(
    '| A | B |\n| --- | --- |\n| ***Text*** | Normal |'.match(markdownComponent.pattern),
  );
  const control = markdownComponent.control;
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
  const textarea = findNode(table, (node) => node.type === 'textarea');
  const editor = control.render.call(controlContext);

  assert.equal(boldButton.props['aria-pressed'], 'true');
  assert.equal(italicButton.props['aria-pressed'], 'true');
  assert.equal(textarea.props.onPaste, undefined);
  assert.equal(textarea.props.ref, undefined);
  assert.equal(editor.props.ref, control.setEditorElement);

  const editorElement = {};

  control.setEditorElement.call(controlContext, editorElement);
  control.setEditorElement.call(controlContext, null);

  assert.deepEqual(documentListenerCalls, [
    ['add', 'paste', control.handleDocumentPaste, true],
    ['remove', 'paste', control.handleDocumentPaste, true],
  ]);
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
  context.registeredComponents = [];
  context.CMS = {
    registerEditorComponent(component) {
      context.registeredComponents.push(component);
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

  const control = context.registeredComponents.find(({ id }) => id === 'editable-table').control;
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
  const pasteTarget = {};

  controlContext.editorElement = {
    contains(target) {
      return target === pasteTarget;
    },
  };
  const event = {
    target: pasteTarget,
    clipboardData: {
      getData(type) {
        if (type === 'text/plain') {
          return 'A\tB\nC\tD';
        }

        return type === 'text/html' ? '<table><tr><td>Falsch</td></tr></table>' : '';
      },
    },
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {
      stopped = true;
    },
  };

  control.handleDocumentPaste.call(controlContext, { target: {} });
  assert.equal(emitted, undefined);

  control.handleDocumentPaste.call(controlContext, event);
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
