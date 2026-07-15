import {
  $applyNodeReplacement as applyNodeReplacement,
  $createParagraphNode as createParagraphNode,
  $getRoot as getRoot,
  createEditor,
  DecoratorNode,
  ElementNode,
} from 'lexical';
import { describe, expect, test, vi } from 'vitest';

import { registerCursorBoundaryClicks } from './node_modules/@sveltia/ui/dist/components/text-editor/cursor-boundaries.js';

class TestCodeNode extends ElementNode {
  static getType() {
    return 'code';
  }

  static clone(node) {
    return new TestCodeNode(node.__key);
  }

  createDOM() {
    return document.createElement('code');
  }

  updateDOM() {
    return false;
  }
}

class TestDecoratorNode extends DecoratorNode {
  static getType() {
    return 'test-decorator';
  }

  static clone(node) {
    return new TestDecoratorNode(node.__key);
  }

  isInline() {
    return false;
  }

  createDOM() {
    return document.createElement('div');
  }

  updateDOM() {
    return false;
  }

  decorate() {
    return null;
  }
}

class TestRootElement {
  attributes = new Set();
  listeners = new Map();
  focus = vi.fn();
  firstElementChild = {
    getBoundingClientRect: () => ({ top: 20 }),
  };
  lastElementChild = {
    getBoundingClientRect: () => ({ bottom: 80 }),
  };

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  toggleAttribute(name, force) {
    if (force) {
      this.attributes.add(name);
    } else {
      this.attributes.delete(name);
    }
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  pointerDown(clientY, target = this) {
    const event = {
      button: 0,
      clientY,
      target,
      preventDefault: vi.fn(),
    };

    this.listeners.get('pointerdown')?.(event);
    return event;
  }
}

const createCodeNode = () => applyNodeReplacement(new TestCodeNode());
const createDecoratorNode = () => applyNodeReplacement(new TestDecoratorNode());

const readNodeTypes = (editor) =>
  editor.getEditorState().read(() =>
    getRoot()
      .getChildren()
      .map((node) => node.getType()),
  );

const createHarness = (createNodes, { isCodeEditor = false } = {}) => {
  const editor = createEditor({
    namespace: `cursor-boundaries-${crypto.randomUUID()}`,
    nodes: [TestCodeNode, TestDecoratorNode],
  });
  const rootElement = new TestRootElement();

  registerCursorBoundaryClicks({ editor, rootElement, isCodeEditor });
  editor.update(
    () => {
      getRoot().append(...createNodes());
    },
    { discrete: true },
  );

  return { editor, rootElement };
};

describe('registerCursorBoundaryClicks()', () => {
  test.each([
    ['code block', () => [createCodeNode()], 'code'],
    ['decorator', () => [createDecoratorNode()], 'test-decorator'],
  ])(
    'exposes click areas without automatically adding paragraphs around a %s',
    (_name, createNodes, expectedType) => {
      const { editor, rootElement } = createHarness(createNodes);

      expect(readNodeTypes(editor)).toEqual([expectedType]);
      expect(rootElement.hasAttribute('data-cursor-boundary-before')).toBe(true);
      expect(rootElement.hasAttribute('data-cursor-boundary-after')).toBe(true);
    },
  );

  test('adds and selects a paragraph before the first terminal block on click', () => {
    const { editor, rootElement } = createHarness(() => [createCodeNode()]);
    const event = rootElement.pointerDown(10);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(rootElement.focus).toHaveBeenCalledOnce();
    expect(readNodeTypes(editor)).toEqual(['paragraph', 'code']);
    expect(rootElement.hasAttribute('data-cursor-boundary-before')).toBe(false);
  });

  test('adds and selects a paragraph after the last terminal block on click', () => {
    const { editor, rootElement } = createHarness(() => [createDecoratorNode()]);

    rootElement.pointerDown(90);

    expect(readNodeTypes(editor)).toEqual(['test-decorator', 'paragraph']);
    expect(rootElement.hasAttribute('data-cursor-boundary-after')).toBe(false);
  });

  test('ignores clicks inside a block', () => {
    const { editor, rootElement } = createHarness(() => [createCodeNode()]);
    const nestedTarget = {};
    const event = rootElement.pointerDown(10, nestedTarget);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(readNodeTypes(editor)).toEqual(['code']);
  });

  test('does not expose click areas for regular paragraphs', () => {
    const { editor, rootElement } = createHarness(() => [createParagraphNode()]);

    rootElement.pointerDown(10);

    expect(rootElement.hasAttribute('data-cursor-boundary-before')).toBe(false);
    expect(rootElement.hasAttribute('data-cursor-boundary-after')).toBe(false);
    expect(readNodeTypes(editor)).toEqual(['paragraph']);
  });

  test('leaves dedicated code editors unchanged', () => {
    const { editor, rootElement } = createHarness(() => [createCodeNode()], {
      isCodeEditor: true,
    });

    rootElement.pointerDown(10);

    expect(rootElement.hasAttribute('data-cursor-boundary-before')).toBe(false);
    expect(rootElement.hasAttribute('data-cursor-boundary-after')).toBe(false);
    expect(readNodeTypes(editor)).toEqual(['code']);
  });
});
