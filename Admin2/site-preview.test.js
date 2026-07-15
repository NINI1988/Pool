'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') {
    return undefined;
  }

  if (predicate(node)) {
    return node;
  }

  for (const child of node.children ?? []) {
    const match = findNode(child, predicate);

    if (match) {
      return match;
    }
  }

  return undefined;
}

test('uses the site stylesheet and content layout for page and post previews', () => {
  const previewStyles = [];
  const previewTemplates = new Map();
  const context = {
    CMS: {
      registerPreviewStyle(style) {
        previewStyles.push(style);
      },
      registerPreviewTemplate(name, component) {
        previewTemplates.set(name, component);
      },
    },
    createClass: (definition) => definition,
    h: (type, props, ...children) => ({ type, props, children }),
  };

  context.window = context;

  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, 'site-preview.js'), 'utf8'),
    context,
  );

  assert.deepEqual(previewStyles, ['../assets/css/main.css?v=1']);
  assert.equal(previewTemplates.get('pages'), previewTemplates.get('posts'));

  const bodyPreview = { type: 'body-preview' };
  const component = previewTemplates.get('posts');
  const rendered = component.render.call({
    props: {
      entry: {
        getIn(pathParts) {
          return pathParts[1] === 'title' ? 'Testbeitrag' : 'Beschreibung';
        },
      },
      widgetFor(name) {
        return name === 'body' ? bodyPreview : undefined;
      },
    },
  });
  const content = findNode(rendered, (node) => node.props?.className === 'content');

  assert.equal(rendered.props.className, 'page-shell');
  assert.equal(content.children[0], bodyPreview);
});

test('keeps wide content tables inside their own horizontal scroll area', () => {
  const stylesheet = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'css', 'main.css'),
    'utf8',
  );
  const tableRule = stylesheet.match(/\.content table\s*{([^}]*)}/)?.[1] ?? '';

  assert.match(tableRule, /display:\s*block;/);
  assert.match(tableRule, /width:\s*max-content;/);
  assert.match(tableRule, /max-width:\s*100%;/);
  assert.match(tableRule, /overflow-x:\s*auto;/);
});
