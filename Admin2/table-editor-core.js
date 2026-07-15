/*
 * Shared table model and conversion functions for the Sveltia table editor.
 *
 * This file deliberately has no CMS or UI dependency. It can be loaded in the
 * browser and required from Node's built-in test runner.
 */
(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.PoolTableEditorCore = api;
  }
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  const FORMAT_MARKDOWN = 'markdown';
  const FORMAT_HTML = 'html';
  const TABLE_MODEL_VERSION = 2;

  const ALIGNMENTS = new Set(['', 'left', 'center', 'right']);
  const VERTICAL_ALIGNMENTS = new Set(['', 'top', 'middle', 'bottom']);
  const SAFE_STYLE_PROPERTIES = new Set([
    'background',
    'background-color',
    'border',
    'border-bottom',
    'border-bottom-color',
    'border-bottom-style',
    'border-bottom-width',
    'border-color',
    'border-left',
    'border-left-color',
    'border-left-style',
    'border-left-width',
    'border-right',
    'border-right-color',
    'border-right-style',
    'border-right-width',
    'border-style',
    'border-top',
    'border-top-color',
    'border-top-style',
    'border-top-width',
    'border-width',
    'color',
    'font-family',
    'font-size',
    'font-style',
    'font-variant',
    'font-weight',
    'height',
    'padding',
    'padding-bottom',
    'padding-left',
    'padding-right',
    'padding-top',
    'text-align',
    'text-decoration',
    'vertical-align',
    'white-space',
    'width',
    'word-wrap',
  ]);

  const HTML_TABLE_SOURCE = '<table\\b[^>]*>[\\s\\S]*?<\\/table>';
  // The separator line keeps this deliberately broad row matcher from
  // recognizing arbitrary prose. A broad matcher is needed for escaped pipes
  // and pipe characters inside inline code.
  const MARKDOWN_ROW_SOURCE = '[ \\t]*\\|?.*\\|.*\\|?[ \\t]*';
  const MARKDOWN_SEPARATOR_SOURCE =
    '[ \\t]*\\|?[ \\t]*:?-+:?[ \\t]*(?:\\|[ \\t]*:?-+:?[ \\t]*)+\\|?[ \\t]*';
  const MARKDOWN_TABLE_SOURCE =
    MARKDOWN_ROW_SOURCE + '\\n' + MARKDOWN_SEPARATOR_SOURCE + '(?:\\n' + MARKDOWN_ROW_SOURCE + ')*';
  const HTML_TABLE_PATTERN = new RegExp(HTML_TABLE_SOURCE, 'im');
  const MARKDOWN_TABLE_PATTERN = new RegExp(MARKDOWN_TABLE_SOURCE, 'im');
  const TABLE_PATTERN = new RegExp('(?:' + HTML_TABLE_SOURCE + '|' + MARKDOWN_TABLE_SOURCE + ')', 'im');

  function toPositiveInteger(value, fallback) {
    const number = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function decodeHtmlEntities(value) {
    const named = {
      amp: '&',
      apos: "'",
      gt: '>',
      lt: '<',
      nbsp: '\u00a0',
      quot: '"',
    };

    return String(value ?? '').replace(
      /&(#(?:\d+|x[0-9a-f]+)|[a-z0-9]+);/gi,
      function (match, entity) {
        if (entity[0] !== '#') {
          return named[entity.toLowerCase()] ?? match;
        }

        const hexadecimal = entity[1]?.toLowerCase() === 'x';
        const number = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
        return Number.isFinite(number) ? String.fromCodePoint(number) : match;
      },
    );
  }

  function sanitizeStyleValue(value) {
    const normalized = String(value ?? '').trim();

    if (
      !normalized ||
      /(?:expression|javascript|url\s*\(|[{}])/i.test(normalized) ||
      normalized.includes(';')
    ) {
      return '';
    }

    return normalized === 'general' ? 'left' : normalized;
  }

  function normalizeStyle(style) {
    if (!style || typeof style !== 'object' || Array.isArray(style)) {
      return {};
    }

    const normalized = Object.fromEntries(
      Object.entries(style)
        .map(([property, value]) => [String(property).toLowerCase().trim(), sanitizeStyleValue(value)])
        .filter(([property, value]) => SAFE_STYLE_PROPERTIES.has(property) && value),
    );

    if (normalized['text-align'] && !ALIGNMENTS.has(normalized['text-align'])) {
      delete normalized['text-align'];
    }

    if (
      normalized['vertical-align'] &&
      !VERTICAL_ALIGNMENTS.has(normalized['vertical-align'])
    ) {
      delete normalized['vertical-align'];
    }

    return normalized;
  }

  function parseStyle(styleValue) {
    const style = {};

    String(styleValue ?? '')
      .split(';')
      .forEach(function (declaration) {
        const colon = declaration.indexOf(':');

        if (colon < 1) {
          return;
        }

        const property = declaration.slice(0, colon).trim().toLowerCase();
        const value = sanitizeStyleValue(declaration.slice(colon + 1));

        if (SAFE_STYLE_PROPERTIES.has(property) && value) {
          style[property] = value;
        }
      });

    return style;
  }

  function serializeStyle(style) {
    return Object.entries(normalizeStyle(style))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([property, value]) => property + ': ' + value)
      .join('; ');
  }

  function normalizeDimension(value) {
    const normalized = sanitizeStyleValue(value);

    if (!normalized) {
      return '';
    }

    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      return normalized + 'px';
    }

    return /^(?:\d+(?:\.\d+)?)(?:px|pt|pc|cm|mm|in|em|rem|%)$/i.test(normalized)
      ? normalized
      : '';
  }

  function extractMarkdownCellFormatting(value, style) {
    let text = String(value ?? '');
    const nextStyle = normalizeStyle(style);
    const markers = [
      { marker: '**', property: 'font-weight', value: '700' },
      { marker: '__', property: 'font-weight', value: '700' },
      { marker: '*', property: 'font-style', value: 'italic' },
      { marker: '_', property: 'font-style', value: 'italic' },
    ];
    let markerFound = true;

    while (markerFound) {
      markerFound = false;

      for (const { marker, property, value: styleValue } of markers) {
        if (
          text.length > marker.length * 2 &&
          text.startsWith(marker) &&
          text.endsWith(marker)
        ) {
          text = text.slice(marker.length, -marker.length);
          nextStyle[property] = styleValue;
          markerFound = true;
          break;
        }
      }
    }

    return { text, style: nextStyle };
  }

  function normalizeMarkdownStyle(style) {
    const normalized = normalizeStyle(style);
    const result = {};
    const alignment = normalized['text-align'];
    const weight = normalized['font-weight'];

    if (alignment && ALIGNMENTS.has(alignment)) {
      result['text-align'] = alignment;
    }

    if (weight === '700' || weight === 'bold') {
      result['font-weight'] = '700';
    }

    if (normalized['font-style'] === 'italic') {
      result['font-style'] = 'italic';
    }

    return result;
  }

  function createCell(overrides) {
    const value = overrides && typeof overrides === 'object' ? overrides : {};

    return {
      text: String(value.text ?? ''),
      header: Boolean(value.header),
      colspan: toPositiveInteger(value.colspan, 1),
      rowspan: toPositiveInteger(value.rowspan, 1),
      style: normalizeStyle(value.style),
    };
  }

  function createEmptyModel(format, rowCount, columnCount) {
    const safeFormat = format === FORMAT_HTML ? FORMAT_HTML : FORMAT_MARKDOWN;
    const rows = Math.max(1, toPositiveInteger(rowCount, 3));
    const columns = Math.max(1, toPositiveInteger(columnCount, 3));

    return {
      version: TABLE_MODEL_VERSION,
      format: safeFormat,
      tableStyle: {},
      columnWidths: Array(columns).fill(''),
      rows: Array.from({ length: rows }, function (_, rowIndex) {
        return {
          height: '',
          cells: Array.from({ length: columns }, function () {
            return createCell({ header: rowIndex === 0 });
          }),
        };
      }),
    };
  }

  function getColumnCount(model) {
    return Math.max(1, ...model.rows.map((row) => row.cells.length));
  }

  function normalizeModel(input, preferredFormat) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.rows) || !input.rows.length) {
      return createEmptyModel(preferredFormat, 3, 3);
    }

    const format = input.format === FORMAT_HTML ? FORMAT_HTML : FORMAT_MARKDOWN;
    const columnCount = Math.max(
      1,
      ...input.rows.map((row) => (Array.isArray(row?.cells) ? row.cells.length : 0)),
    );
    const rows = input.rows.map(function (row, rowIndex) {
      const cells = Array.isArray(row?.cells) ? row.cells.map(createCell) : [];

      while (cells.length < columnCount) {
        cells.push(createCell({ header: format === FORMAT_MARKDOWN && rowIndex === 0 }));
      }

      const inferredHeight = cells.map((cell) => cell.style.height).find(Boolean);
      const height = normalizeDimension(row?.height ?? inferredHeight);

      cells.forEach(function (cell) {
        delete cell.style.height;
      });

      return { height, cells };
    });
    const configuredWidths = Array.isArray(input.columnWidths) ? input.columnWidths : [];
    const columnWidths = Array.from({ length: columnCount }, function (_, columnIndex) {
      const inferredWidth = rows
        .map((row) => row.cells[columnIndex]?.style.width)
        .find(Boolean);
      return normalizeDimension(configuredWidths[columnIndex] ?? inferredWidth);
    });

    rows.forEach(function (row) {
      row.cells.forEach(function (cell) {
        delete cell.style.width;
      });
    });

    if (format === FORMAT_MARKDOWN) {
      rows.forEach(function (row, rowIndex) {
        row.cells.forEach(function (cell) {
          const formatted = extractMarkdownCellFormatting(cell.text, cell.style);
          cell.text = formatted.text;
          cell.header = rowIndex === 0;
          cell.colspan = 1;
          cell.rowspan = 1;
          cell.style = normalizeMarkdownStyle(formatted.style);
        });
        row.height = '';
      });
      columnWidths.fill('');
    }

    const model = {
      version: TABLE_MODEL_VERSION,
      format,
      tableStyle: format === FORMAT_HTML ? normalizeStyle(input.tableStyle) : {},
      columnWidths,
      rows,
    };

    clampSpans(model);
    return model;
  }

  function cloneModel(model) {
    return normalizeModel(JSON.parse(JSON.stringify(normalizeModel(model))));
  }

  function clampSpans(model) {
    const rowCount = model.rows.length;
    const columnCount = getColumnCount(model);

    model.rows.forEach(function (row, rowIndex) {
      row.cells.forEach(function (cell, columnIndex) {
        cell.rowspan = Math.min(toPositiveInteger(cell.rowspan, 1), rowCount - rowIndex);
        cell.colspan = Math.min(toPositiveInteger(cell.colspan, 1), columnCount - columnIndex);
      });
    });
  }

  function createCoverage(model) {
    const normalized = normalizeModel(model);
    const rowCount = normalized.rows.length;
    const columnCount = getColumnCount(normalized);
    const coverage = Array.from({ length: rowCount }, function () {
      return Array(columnCount).fill(null);
    });

    normalized.rows.forEach(function (row, rowIndex) {
      row.cells.forEach(function (cell, columnIndex) {
        if (coverage[rowIndex][columnIndex]) {
          return;
        }

        const origin = { row: rowIndex, column: columnIndex };

        for (let rowOffset = 0; rowOffset < cell.rowspan; rowOffset += 1) {
          for (let columnOffset = 0; columnOffset < cell.colspan; columnOffset += 1) {
            const targetRow = rowIndex + rowOffset;
            const targetColumn = columnIndex + columnOffset;

            if (targetRow < rowCount && targetColumn < columnCount && !coverage[targetRow][targetColumn]) {
              coverage[targetRow][targetColumn] = origin;
            }
          }
        }
      });
    });

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        coverage[rowIndex][columnIndex] ??= { row: rowIndex, column: columnIndex };
      }
    }

    return coverage;
  }

  function getSelectionBounds(selection, model) {
    const maxRow = model.rows.length - 1;
    const maxColumn = getColumnCount(model) - 1;
    const start = selection?.start ?? { row: 0, column: 0 };
    const end = selection?.end ?? start;
    const clamp = (value, maximum) => Math.max(0, Math.min(maximum, Number(value) || 0));
    const startRow = clamp(start.row, maxRow);
    const endRow = clamp(end.row, maxRow);
    const startColumn = clamp(start.column, maxColumn);
    const endColumn = clamp(end.column, maxColumn);

    return {
      top: Math.min(startRow, endRow),
      bottom: Math.max(startRow, endRow),
      left: Math.min(startColumn, endColumn),
      right: Math.max(startColumn, endColumn),
    };
  }

  function getSelectedOrigins(model, selection) {
    const normalized = normalizeModel(model);
    const coverage = createCoverage(normalized);
    const bounds = getSelectionBounds(selection, normalized);
    const seen = new Set();
    const origins = [];

    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let column = bounds.left; column <= bounds.right; column += 1) {
        const origin = coverage[row][column];
        const key = origin.row + ':' + origin.column;

        if (!seen.has(key)) {
          seen.add(key);
          origins.push(origin);
        }
      }
    }

    return origins;
  }

  function applyStyles(model, selection, styles) {
    const next = cloneModel(model);
    const safeStyles = Object.entries(styles ?? {})
      .map(([property, value]) => [
        String(property).toLowerCase(),
        sanitizeStyleValue(value),
      ])
      .filter(([property]) => SAFE_STYLE_PROPERTIES.has(property));

    if (!safeStyles.length) {
      return next;
    }

    if (next.format === FORMAT_MARKDOWN) {
      const bounds = getSelectionBounds(selection, next);
      const alignmentEntry = safeStyles.find(([property]) => property === 'text-align');

      if (!alignmentEntry) {
        return next;
      }

      const alignmentValue = alignmentEntry[1];
      const alignment = ALIGNMENTS.has(alignmentValue) ? alignmentValue : '';

      for (let column = bounds.left; column <= bounds.right; column += 1) {
        next.rows.forEach(function (row) {
          if (alignment) {
            row.cells[column].style['text-align'] = alignment;
          } else {
            delete row.cells[column].style['text-align'];
          }
        });
      }

      return next;
    }

    getSelectedOrigins(next, selection).forEach(function ({ row, column }) {
      const style = next.rows[row].cells[column].style;

      safeStyles.forEach(function ([property, value]) {
        if (value) {
          style[property] = value;
        } else {
          delete style[property];
        }
      });
    });

    return next;
  }

  function applyStyle(model, selection, property, value) {
    return applyStyles(model, selection, { [property]: value });
  }

  function toggleCellStyle(model, selection, property, enabledValue) {
    const next = cloneModel(model);
    const origins = getSelectedOrigins(next, selection);
    const shouldEnable = origins.some(function ({ row, column }) {
      return next.rows[row].cells[column].style[property] !== enabledValue;
    });

    origins.forEach(function ({ row, column }) {
      const style = next.rows[row].cells[column].style;

      if (shouldEnable) {
        style[property] = enabledValue;
      } else {
        delete style[property];
      }
    });

    return next;
  }

  function toggleMarkdownEmphasis(model, selection, marker) {
    return marker === '**' || marker === '__'
      ? toggleCellStyle(model, selection, 'font-weight', '700')
      : toggleCellStyle(model, selection, 'font-style', 'italic');
  }

  function setColumnWidth(model, selection, value) {
    const next = cloneModel(model);

    if (next.format !== FORMAT_HTML) {
      return next;
    }

    const bounds = getSelectionBounds(selection, next);
    const width = normalizeDimension(value);

    for (let column = bounds.left; column <= bounds.right; column += 1) {
      next.columnWidths[column] = width;
    }

    return next;
  }

  function setRowHeight(model, selection, value) {
    const next = cloneModel(model);

    if (next.format !== FORMAT_HTML) {
      return next;
    }

    const bounds = getSelectionBounds(selection, next);
    const height = normalizeDimension(value);

    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      next.rows[row].height = height;
    }

    return next;
  }

  function setCellText(model, rowIndex, columnIndex, text) {
    const next = cloneModel(model);

    if (next.rows[rowIndex]?.cells[columnIndex]) {
      next.rows[rowIndex].cells[columnIndex].text = String(text ?? '');
    }

    return next;
  }

  function addRow(model, afterRow) {
    const next = cloneModel(model);
    const columnCount = getColumnCount(next);
    const insertAt = Math.max(0, Math.min(next.rows.length, Number(afterRow) + 1 || 1));

    next.rows.forEach(function (row, rowIndex) {
      row.cells.forEach(function (cell) {
        if (rowIndex < insertAt && rowIndex + cell.rowspan > insertAt) {
          cell.rowspan += 1;
        }
      });
    });

    next.rows.splice(insertAt, 0, {
      height: '',
      cells: Array.from({ length: columnCount }, function () {
        return createCell({ header: next.format === FORMAT_MARKDOWN && insertAt === 0 });
      }),
    });

    if (next.format === FORMAT_MARKDOWN) {
      next.rows.forEach(function (row, rowIndex) {
        row.cells.forEach(function (cell) {
          cell.header = rowIndex === 0;
        });
      });
    }

    clampSpans(next);
    return next;
  }

  function addColumn(model, afterColumn) {
    const next = cloneModel(model);
    const columnCount = getColumnCount(next);
    const insertAt = Math.max(0, Math.min(columnCount, Number(afterColumn) + 1 || 1));

    next.rows.forEach(function (row) {
      row.cells.forEach(function (cell, columnIndex) {
        if (columnIndex < insertAt && columnIndex + cell.colspan > insertAt) {
          cell.colspan += 1;
        }
      });
      row.cells.splice(insertAt, 0, createCell());
    });
    next.columnWidths.splice(insertAt, 0, '');

    clampSpans(next);
    return next;
  }

  function removeRow(model, rowIndex) {
    const next = cloneModel(model);

    if (next.rows.length <= 1) {
      return next;
    }

    const index = Math.max(0, Math.min(next.rows.length - 1, Number(rowIndex) || 0));
    const coverage = createCoverage(next);
    const origins = new Map();

    coverage[index].forEach(function (origin) {
      origins.set(origin.row + ':' + origin.column, origin);
    });

    origins.forEach(function ({ row, column }) {
      const cell = next.rows[row].cells[column];

      if (row < index && row + cell.rowspan > index) {
        cell.rowspan -= 1;
      } else if (row === index && cell.rowspan > 1) {
        next.rows[index + 1].cells[column] = createCell({
          ...cell,
          rowspan: cell.rowspan - 1,
        });
      }
    });

    next.rows.splice(index, 1);

    if (next.format === FORMAT_MARKDOWN) {
      next.rows.forEach(function (row, currentRow) {
        row.cells.forEach(function (cell) {
          cell.header = currentRow === 0;
        });
      });
    }

    clampSpans(next);
    return next;
  }

  function removeColumn(model, columnIndex) {
    const next = cloneModel(model);

    if (getColumnCount(next) <= 1) {
      return next;
    }

    const index = Math.max(0, Math.min(getColumnCount(next) - 1, Number(columnIndex) || 0));
    const coverage = createCoverage(next);
    const origins = new Map();

    coverage.forEach(function (row) {
      const origin = row[index];
      origins.set(origin.row + ':' + origin.column, origin);
    });

    origins.forEach(function ({ row, column }) {
      const cell = next.rows[row].cells[column];

      if (column < index && column + cell.colspan > index) {
        cell.colspan -= 1;
      } else if (column === index && cell.colspan > 1) {
        next.rows[row].cells[index + 1] = createCell({
          ...cell,
          colspan: cell.colspan - 1,
        });
      }
    });

    next.rows.forEach(function (row) {
      row.cells.splice(index, 1);
    });
    next.columnWidths.splice(index, 1);
    clampSpans(next);
    return next;
  }

  function mergeSelection(model, selection) {
    const next = cloneModel(model);

    if (next.format !== FORMAT_HTML) {
      return next;
    }

    const bounds = getSelectionBounds(selection, next);

    if (bounds.top === bounds.bottom && bounds.left === bounds.right) {
      return next;
    }

    const coverage = createCoverage(next);
    const selectedOrigins = getSelectedOrigins(next, selection);
    const selectionContainsWholeMerge = selectedOrigins.every(function (origin) {
      const cell = next.rows[origin.row].cells[origin.column];
      return (
        origin.row >= bounds.top &&
        origin.column >= bounds.left &&
        origin.row + cell.rowspan - 1 <= bounds.bottom &&
        origin.column + cell.colspan - 1 <= bounds.right
      );
    });

    if (!selectionContainsWholeMerge) {
      return next;
    }

    const origin = coverage[bounds.top][bounds.left];
    const originCell = next.rows[origin.row].cells[origin.column];
    const texts = selectedOrigins
      .map(({ row, column }) => next.rows[row].cells[column].text)
      .filter(Boolean);

    originCell.text = texts.join('\n');
    originCell.rowspan = bounds.bottom - bounds.top + 1;
    originCell.colspan = bounds.right - bounds.left + 1;

    selectedOrigins.forEach(function ({ row, column }) {
      if (row === origin.row && column === origin.column) {
        return;
      }

      const cell = next.rows[row].cells[column];
      cell.text = '';
      cell.rowspan = 1;
      cell.colspan = 1;
      cell.style = {};
    });

    return next;
  }

  function splitSelection(model, selection) {
    const next = cloneModel(model);
    const coverage = createCoverage(next);
    const bounds = getSelectionBounds(selection, next);
    const origins = new Map();

    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let column = bounds.left; column <= bounds.right; column += 1) {
        const origin = coverage[row][column];
        origins.set(origin.row + ':' + origin.column, origin);
      }
    }

    origins.forEach(function ({ row, column }) {
      next.rows[row].cells[column].rowspan = 1;
      next.rows[row].cells[column].colspan = 1;
    });

    return next;
  }

  function changeFormat(model, format) {
    const next = cloneModel(model);

    if (format === FORMAT_HTML) {
      next.format = FORMAT_HTML;
      next.rows.forEach(function (row, rowIndex) {
        row.cells.forEach(function (cell) {
          cell.header = rowIndex === 0;
        });
      });
      return next;
    }

    next.format = FORMAT_MARKDOWN;
    next.tableStyle = {};
    next.columnWidths = Array(getColumnCount(next)).fill('');
    next.rows.forEach(function (row, rowIndex) {
      row.cells.forEach(function (cell) {
        cell.header = rowIndex === 0;
        cell.colspan = 1;
        cell.rowspan = 1;
        cell.style = normalizeMarkdownStyle(cell.style);
      });
      row.height = '';
    });
    return next;
  }

  function parseAttributes(rawAttributes) {
    const attributes = {};
    const regex = /([a-zA-Z0-9:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let match;

    while ((match = regex.exec(String(rawAttributes ?? ''))) !== null) {
      attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    }

    return attributes;
  }

  function parseCssClasses(html) {
    const classes = {};
    const styleMatch = String(html ?? '').match(/<style[^>]*>([\s\S]*?)<\/style>/i);

    if (!styleMatch) {
      return classes;
    }

    const ruleRegex = /\.([\w-]+)\s*\{([^}]*)\}/g;
    let match;

    while ((match = ruleRegex.exec(styleMatch[1])) !== null) {
      classes[match[1]] = parseStyle(match[2]);
    }

    return classes;
  }

  function getCellStyle(attributes, cssClasses) {
    const style = {};

    String(attributes.class ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .forEach(function (className) {
        Object.assign(style, cssClasses[className] ?? {});
      });

    Object.assign(style, parseStyle(attributes.style));

    if (attributes.align) {
      style['text-align'] = attributes.align.toLowerCase();
    }

    if (attributes.valign) {
      style['vertical-align'] = attributes.valign.toLowerCase();
    }

    if (attributes.width) {
      style.width = /^\d+(?:\.\d+)?$/.test(attributes.width)
        ? attributes.width + 'px'
        : attributes.width;
    }

    if (attributes.height) {
      style.height = /^\d+(?:\.\d+)?$/.test(attributes.height)
        ? attributes.height + 'px'
        : attributes.height;
    }

    return normalizeStyle(style);
  }

  function htmlInlineToMarkdown(value) {
    let output = String(value ?? '').replace(/\r/g, '');

    output = output.replace(/<br\s*\/?>/gi, '\n');
    output = output.replace(
      /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
      function (_match, rawAttributes, content) {
        const label = htmlInlineToMarkdown(content);
        const href = decodeHtmlEntities(parseAttributes(rawAttributes).href ?? '').trim();
        const safeHref = /^(?:https?:\/\/|mailto:|\/|#)/i.test(href);
        return safeHref && label ? '[' + label + '](' + href + ')' : label;
      },
    );
    output = output.replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
    output = output.replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '_$1_');
    output = output.replace(/<(?:s|del)\b[^>]*>([\s\S]*?)<\/(?:s|del)>/gi, '~~$1~~');
    output = output.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

    return decodeHtmlEntities(output.replace(/<[^>]*>/g, ''));
  }

  function parseHtmlTable(source) {
    const html = String(source ?? '');
    const tableMatch = html.match(/<table\b([^>]*)>([\s\S]*?)<\/table>/i);

    if (!tableMatch) {
      return createEmptyModel(FORMAT_HTML, 3, 3);
    }

    const cssClasses = parseCssClasses(html);
    const tableAttributes = parseAttributes(tableMatch[1]);
    const tableStyle = parseStyle(tableAttributes.style);
    const columnWidths = [];
    const columnRegex = /<col\b([^>]*)\/?\s*>/gi;
    let columnMatch;

    while ((columnMatch = columnRegex.exec(tableMatch[2])) !== null) {
      const attributes = parseAttributes(columnMatch[1]);
      const width = normalizeDimension(parseStyle(attributes.style).width ?? attributes.width);
      const span = toPositiveInteger(attributes.span, 1);

      for (let index = 0; index < span; index += 1) {
        columnWidths.push(width);
      }
    }

    if (tableAttributes.width) {
      tableStyle.width = /^\d+(?:\.\d+)?$/.test(tableAttributes.width)
        ? tableAttributes.width + 'px'
        : tableAttributes.width;
    }

    const parsedRows = [];
    const rowRegex = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(tableMatch[2])) !== null) {
      const rowAttributes = parseAttributes(rowMatch[1]);
      const rowHeight = rowAttributes.height || parseStyle(rowAttributes.style).height;
      const cells = [];
      const cellRegex = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowMatch[2])) !== null) {
        const attributes = parseAttributes(cellMatch[2]);
        const style = getCellStyle(attributes, cssClasses);

        if (rowHeight && !style.height) {
          style.height = /^\d+(?:\.\d+)?$/.test(rowHeight) ? rowHeight + 'px' : rowHeight;
        }

        const text = htmlInlineToMarkdown(cellMatch[3]);

        cells.push(
          createCell({
            text,
            header: cellMatch[1].toLowerCase() === 'th',
            colspan: attributes.colspan,
            rowspan: attributes.rowspan,
            style,
          }),
        );
      }

      if (cells.length) {
        parsedRows.push(cells);
      }
    }

    if (!parsedRows.length) {
      return createEmptyModel(FORMAT_HTML, 3, 3);
    }

    const occupied = [];
    const denseRows = [];

    parsedRows.forEach(function (parsedCells, rowIndex) {
      occupied[rowIndex] ??= [];
      denseRows[rowIndex] ??= [];
      let columnIndex = 0;

      parsedCells.forEach(function (cell) {
        while (occupied[rowIndex][columnIndex]) {
          denseRows[rowIndex][columnIndex] ??= createCell();
          columnIndex += 1;
        }

        denseRows[rowIndex][columnIndex] = cell;

        for (let rowOffset = 0; rowOffset < cell.rowspan; rowOffset += 1) {
          const targetRow = rowIndex + rowOffset;
          occupied[targetRow] ??= [];
          denseRows[targetRow] ??= [];

          for (let columnOffset = 0; columnOffset < cell.colspan; columnOffset += 1) {
            const targetColumn = columnIndex + columnOffset;
            occupied[targetRow][targetColumn] = true;
            denseRows[targetRow][targetColumn] ??= createCell();
          }
        }

        columnIndex += cell.colspan;
      });
    });

    const model = normalizeModel({
      version: TABLE_MODEL_VERSION,
      format: FORMAT_HTML,
      tableStyle,
      columnWidths,
      rows: denseRows.map((cells) => ({ cells })),
    });

    return model;
  }

  function splitMarkdownRow(line) {
    let value = String(line ?? '').trim();

    if (value.startsWith('|')) {
      value = value.slice(1);
    }

    if (value.endsWith('|') && !value.endsWith('\\|')) {
      value = value.slice(0, -1);
    }

    const cells = [];
    let cell = '';
    let escaped = false;
    let codeFence = false;

    for (const character of value) {
      if (escaped) {
        cell += character === '|' ? '|' : '\\' + character;
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '`') {
        codeFence = !codeFence;
        cell += character;
      } else if (character === '|' && !codeFence) {
        cells.push(cell.trim().replace(/<br\s*\/?>/gi, '\n'));
        cell = '';
      } else {
        cell += character;
      }
    }

    if (escaped) {
      cell += '\\';
    }

    cells.push(cell.trim().replace(/<br\s*\/?>/gi, '\n'));
    return cells;
  }

  function isMarkdownSeparator(cells) {
    return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.replace(/\s+/g, '')));
  }

  function parseMarkdownTable(source) {
    const lines = String(source ?? '')
      .trim()
      .split(/\r?\n/)
      .filter((line) => line.trim());

    if (lines.length < 2) {
      return createEmptyModel(FORMAT_MARKDOWN, 3, 3);
    }

    const header = splitMarkdownRow(lines[0]);
    const separator = splitMarkdownRow(lines[1]);

    if (!isMarkdownSeparator(separator)) {
      return createEmptyModel(FORMAT_MARKDOWN, 3, 3);
    }

    const columnCount = Math.max(header.length, separator.length);
    const alignments = Array.from({ length: columnCount }, function (_, index) {
      const marker = separator[index]?.replace(/\s+/g, '') ?? '---';
      return marker.startsWith(':') && marker.endsWith(':')
        ? 'center'
        : marker.endsWith(':')
          ? 'right'
          : marker.startsWith(':')
            ? 'left'
            : '';
    });
    const values = [header, ...lines.slice(2).map(splitMarkdownRow)];

    return normalizeModel({
      version: TABLE_MODEL_VERSION,
      format: FORMAT_MARKDOWN,
      rows: values.map(function (row, rowIndex) {
        return {
          cells: Array.from({ length: columnCount }, function (_, columnIndex) {
            return createCell({
              text: row[columnIndex] ?? '',
              header: rowIndex === 0,
              style: alignments[columnIndex]
                ? { 'text-align': alignments[columnIndex] }
                : {},
            });
          }),
        };
      }),
    });
  }

  function parseTable(source) {
    const text = String(source ?? '').trim();
    return /^<table\b/i.test(text)
      ? parseHtmlTable(text)
      : parseMarkdownTable(text);
  }

  function escapeMarkdownCell(value) {
    let output = '';
    let escaped = false;

    for (const character of String(value ?? '').replace(/\r/g, '')) {
      if (character === '\n') {
        output += '<br>';
        escaped = false;
      } else if (character === '|' && !escaped) {
        output += '\\|';
        escaped = false;
      } else {
        output += character;
        escaped = character === '\\' && !escaped;
      }
    }

    return output.trim();
  }

  function formatMarkdownCell(cell) {
    const text = escapeMarkdownCell(cell.text);

    if (!text) {
      return '';
    }

    const bold = cell.style['font-weight'] === '700' || cell.style['font-weight'] === 'bold';
    const italic = cell.style['font-style'] === 'italic';

    if (bold && italic) return '***' + text + '***';
    if (bold) return '**' + text + '**';
    if (italic) return '_' + text + '_';
    return text;
  }

  function serializeMarkdown(model) {
    const normalized = normalizeModel(changeFormat(model, FORMAT_MARKDOWN));
    const columnCount = getColumnCount(normalized);
    const rows = normalized.rows.map(function (row) {
      return '| ' + row.cells.map(formatMarkdownCell).join(' | ') + ' |';
    });
    const separator = Array.from({ length: columnCount }, function (_, columnIndex) {
      const alignment = normalized.rows
        .map((row) => row.cells[columnIndex].style['text-align'])
        .find(Boolean);

      if (alignment === 'center') return ':---:';
      if (alignment === 'right') return '---:';
      if (alignment === 'left') return ':---';
      return '---';
    });

    rows.splice(1, 0, '| ' + separator.join(' | ') + ' |');
    return rows.join('\n');
  }

  function markdownInlineToHtml(value) {
    let output = escapeHtml(value).replace(/\r?\n/g, '<br>');
    output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
    output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    output = output.replace(/_([^_]+)_/g, '<em>$1</em>');
    output = output.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    output = output.replace(
      /\[([^\]]+)]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|\/[^\s)]*|#[^\s)]*)\)/g,
      '<a href="$2">$1</a>',
    );
    return output;
  }

  function serializeHtml(model) {
    const normalized = normalizeModel(changeFormat(model, FORMAT_HTML));
    const coverage = createCoverage(normalized);
    const tableStyle = serializeStyle(normalized.tableStyle);
    const lines = ['<table class="excel"' + (tableStyle ? ' style="' + escapeHtml(tableStyle) + '"' : '') + '>'];

    if (normalized.columnWidths.some(Boolean)) {
      lines.push('  <colgroup>');
      normalized.columnWidths.forEach(function (width) {
        const style = serializeStyle(width ? { width } : {});
        lines.push('    <col' + (style ? ' style="' + escapeHtml(style) + '"' : '') + '>');
      });
      lines.push('  </colgroup>');
    }

    normalized.rows.forEach(function (row, rowIndex) {
      const rowStyle = serializeStyle(row.height ? { height: row.height } : {});
      lines.push('  <tr' + (rowStyle ? ' style="' + escapeHtml(rowStyle) + '"' : '') + '>');
      row.cells.forEach(function (cell, columnIndex) {
        const origin = coverage[rowIndex][columnIndex];

        if (origin.row !== rowIndex || origin.column !== columnIndex) {
          return;
        }

        const tag = cell.header ? 'th' : 'td';
        const attributes = [];
        const style = serializeStyle(cell.style);

        if (cell.colspan > 1) attributes.push(' colspan="' + cell.colspan + '"');
        if (cell.rowspan > 1) attributes.push(' rowspan="' + cell.rowspan + '"');
        if (style) attributes.push(' style="' + escapeHtml(style) + '"');

        lines.push(
          '    <' +
            tag +
            attributes.join('') +
            '>' +
            markdownInlineToHtml(cell.text) +
            '</' +
            tag +
            '>',
        );
      });
      lines.push('  </tr>');
    });

    lines.push('</table>');
    return lines.join('\n');
  }

  function serializeTable(model) {
    const normalized = normalizeModel(model);
    return normalized.format === FORMAT_HTML
      ? serializeHtml(normalized)
      : serializeMarkdown(normalized);
  }

  function parsePlainTextTable(text) {
    const rows = String(text ?? '')
      .replace(/\r/g, '')
      .split('\n')
      .filter((row, index, allRows) => row.length > 0 || index < allRows.length - 1)
      .map((row) => row.split('\t'));

    if (!rows.length || (rows.length === 1 && rows[0].length === 1)) {
      return null;
    }

    const columnCount = Math.max(...rows.map((row) => row.length));

    return normalizeModel({
      version: TABLE_MODEL_VERSION,
      format: FORMAT_HTML,
      rows: rows.map(function (row) {
        return {
          cells: Array.from({ length: columnCount }, function (_, columnIndex) {
            return createCell({ text: row[columnIndex] ?? '' });
          }),
        };
      }),
    });
  }

  function parseClipboardTable(html, plainText) {
    const htmlValue = String(html ?? '');

    if (/<table\b/i.test(htmlValue)) {
      return parseHtmlTable(htmlValue);
    }

    return parsePlainTextTable(plainText);
  }

  function hasHtmlOnlyFormatting(model) {
    const normalized = normalizeModel(model);

    return (
      Object.keys(normalized.tableStyle).length > 0 ||
      normalized.columnWidths.some(Boolean) ||
      normalized.rows.some(
        (row) =>
          Boolean(row.height) ||
          row.cells.some(
            (cell) =>
              cell.colspan > 1 ||
              cell.rowspan > 1 ||
              cell.header ||
              Object.keys(cell.style).length > 0,
          ),
      )
    );
  }

  function pasteTable(model, pastedModel, startRow, startColumn) {
    const next = cloneModel(model);
    const pasted = normalizeModel(pastedModel);
    const rowOffset = Math.max(0, Number(startRow) || 0);
    const columnOffset = Math.max(0, Number(startColumn) || 0);
    const requiredRows = rowOffset + pasted.rows.length;
    const requiredColumns = columnOffset + getColumnCount(pasted);

    while (next.rows.length < requiredRows) {
      next.rows.push({
        height: '',
        cells: Array.from({ length: getColumnCount(next) }, function () {
          return createCell();
        }),
      });
    }

    next.rows.forEach(function (row) {
      while (row.cells.length < requiredColumns) {
        row.cells.push(createCell());
      }
    });

    if (next.format === FORMAT_HTML) {
      pasted.columnWidths.forEach(function (width, columnIndex) {
        if (width) {
          next.columnWidths[columnOffset + columnIndex] = width;
        }
      });

      pasted.rows.forEach(function (row, rowIndex) {
        if (row.height) {
          next.rows[rowOffset + rowIndex].height = row.height;
        }
      });
    }

    pasted.rows.forEach(function (row, rowIndex) {
      row.cells.forEach(function (cell, columnIndex) {
        const target = createCell(cell);

        if (next.format === FORMAT_MARKDOWN) {
          const formatted = extractMarkdownCellFormatting(target.text, {});
          target.text = formatted.text;
          target.header = rowOffset + rowIndex === 0;
          target.colspan = 1;
          target.rowspan = 1;
          target.style = {};
        }

        next.rows[rowOffset + rowIndex].cells[columnOffset + columnIndex] = target;
      });
    });

    return normalizeModel(next);
  }

  function modelFromComponentValue(value) {
    const format = value?.format === FORMAT_HTML ? FORMAT_HTML : FORMAT_MARKDOWN;

    if (typeof value?.data === 'string' && value.data.trim()) {
      try {
        return normalizeModel(JSON.parse(value.data), format);
      } catch {
        // Fall through to source parsing.
      }
    }

    if (typeof value?.source === 'string' && value.source.trim()) {
      return parseTable(value.source);
    }

    return createEmptyModel(format, 3, 3);
  }

  function componentValueFromModel(model) {
    const normalized = normalizeModel(model);
    return {
      format: normalized.format,
      data: JSON.stringify(normalized),
    };
  }

  function componentValueFromSource(source) {
    return componentValueFromModel(parseTable(source));
  }

  return {
    FORMAT_HTML,
    FORMAT_MARKDOWN,
    HTML_TABLE_PATTERN,
    MARKDOWN_TABLE_PATTERN,
    TABLE_MODEL_VERSION,
    TABLE_PATTERN,
    SAFE_STYLE_PROPERTIES,
    addColumn,
    addRow,
    applyStyle,
    applyStyles,
    changeFormat,
    cloneModel,
    componentValueFromModel,
    componentValueFromSource,
    createCell,
    createCoverage,
    createEmptyModel,
    decodeHtmlEntities,
    escapeHtml,
    getColumnCount,
    getSelectedOrigins,
    getSelectionBounds,
    htmlInlineToMarkdown,
    hasHtmlOnlyFormatting,
    markdownInlineToHtml,
    mergeSelection,
    modelFromComponentValue,
    normalizeModel,
    normalizeDimension,
    normalizeStyle,
    parseClipboardTable,
    parseHtmlTable,
    parseMarkdownTable,
    parsePlainTextTable,
    parseStyle,
    parseTable,
    pasteTable,
    removeColumn,
    removeRow,
    sanitizeStyleValue,
    serializeHtml,
    serializeMarkdown,
    serializeStyle,
    serializeTable,
    setCellText,
    setColumnWidth,
    setRowHeight,
    splitMarkdownRow,
    splitSelection,
    toggleCellStyle,
    toggleMarkdownEmphasis,
  };
});
