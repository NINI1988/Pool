/**
 * admin/clipboard_to_html_table.js
 * 
 * Decap CMS Editor Component & Custom Widget
 * Converts Excel clipboard content (HTML format) to inline-styled HTML tables.
 */

(function () {
  console.log("Excel Clipboard-to-HTML script loaded. Initializing...");

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────

  // Only these standard CSS properties are kept when inlining.
  // Everything starting with "mso-" is always stripped.
  const KEEP_PROPERTIES = new Set([
    "color", "background-color", "background",
    "font-weight", "font-size", "font-family", "font-style", "font-variant",
    "text-decoration", "text-align",
    "vertical-align",
    "border", "border-top", "border-right", "border-bottom", "border-left",
    "border-color", "border-style", "border-width",
    "border-top-color", "border-right-color",
    "border-bottom-color", "border-left-color",
    "border-top-style", "border-right-style",
    "border-bottom-style", "border-left-style",
    "border-top-width", "border-right-width",
    "border-bottom-width", "border-left-width",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "width", "height",
    "white-space", "word-wrap"
  ]);

  // Excel uses "text-align: general" which is not valid CSS — replace with "left"
  const INVALID_VALUES = {
    "general": "left"
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // HTML UTILS & ENTITY DECODER
  // ─────────────────────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Decodes html entity characters
  function decodeHtmlEntities(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&(#(?:\d+|x[0-9a-fA-F]+)|[a-zA-Z0-9]+);/g, function (match, entity) {
      if (entity.startsWith('#')) {
        let code;
        if (entity[1] === 'x' || entity[1] === 'X') {
          code = parseInt(entity.substring(2), 16);
        } else {
          code = parseInt(entity.substring(1), 10);
        }
        return isNaN(code) ? match : String.fromCharCode(code);
      }
      const specialEntities = {
        'amp': '&',
        'lt': '<',
        'gt': '>',
        'quot': '"',
        'apos': "'",
        'nbsp': '\u00A0'
      };
      return specialEntities[entity] || match;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HTML PARSER IMPLEMENTATION
  // ─────────────────────────────────────────────────────────────────────────────

  class HTMLParser {
    feed(html) {
      const tagRegex = /(<\/?[a-zA-Z0-9:-]+(?:\s+[^>]*?)?\/?>)|(<!--[\s\S]*?-->)/g;
      let lastIndex = 0;
      let match;
      while ((match = tagRegex.exec(html)) !== null) {
        const text = html.substring(lastIndex, match.index);
        if (text) {
          this.handle_data(text);
        }

        const tag = match[1];
        const comment = match[2];

        if (comment) {
          // Ignore comments
        } else if (tag) {
          if (tag.startsWith('</')) {
            const tagName = tag.substring(2, tag.length - 1).trim().toLowerCase();
            this.handle_endtag(tagName);
          } else {
            const isSelfClosing = tag.endsWith('/>');
            const cleanTag = isSelfClosing ? tag.substring(1, tag.length - 2) : tag.substring(1, tag.length - 1);
            const parts = cleanTag.trim().split(/\s+/);
            const tagName = parts[0].toLowerCase();

            const attrs = [];
            const attrRegex = /([a-zA-Z0-9:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
            const attrStr = cleanTag.substring(parts[0].length);
            let attrMatch;
            let prevIndex = -1;
            while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
              if (attrRegex.lastIndex === prevIndex) {
                attrRegex.lastIndex++;
                continue;
              }
              prevIndex = attrRegex.lastIndex;
              const name = attrMatch[1];
              const value = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : (attrMatch[4] !== undefined ? attrMatch[4] : ''));
              attrs.push([name, value]);
            }

            if (isSelfClosing) {
              this.handle_startendtag(tagName, attrs);
            } else {
              this.handle_starttag(tagName, attrs);
            }
          }
        }
        lastIndex = tagRegex.lastIndex;
      }
      const remainingText = html.substring(lastIndex);
      if (remainingText) {
        this.handle_data(remainingText);
      }
    }

    handle_starttag(tag, attrs) { }
    handle_endtag(tag) { }
    handle_startendtag(tag, attrs) {
      this.handle_starttag(tag, attrs);
      this.handle_endtag(tag);
    }
    handle_data(data) { }
    close() { }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CSS PARSING
  // ─────────────────────────────────────────────────────────────────────────────

  function parseCssClasses(styleContent) {
    const classes = {};
    const regex = /(\.[\w-]+)\s*\{([^}]*)\}/g;
    let match;
    while ((match = regex.exec(styleContent)) !== null) {
      const className = match[1];
      const propsStr = match[2];
      const props = {};
      const declarations = propsStr.split(';');
      for (let decl of declarations) {
        decl = decl.trim();
        if (!decl.includes(':')) continue;
        const colonIdx = decl.indexOf(':');
        const key = decl.substring(0, colonIdx).trim().toLowerCase();
        const val = decl.substring(colonIdx + 1).trim();
        if (key && val) {
          props[key] = val;
        }
      }
      classes[className] = props;
    }
    return classes;
  }

  function filterProps(props) {
    const filtered = {};
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith("mso-")) {
        continue;
      }
      if (!KEEP_PROPERTIES.has(k)) {
        continue;
      }
      const val = INVALID_VALUES[v] || v;
      filtered[k] = val;
    }
    return filtered;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRUCTURED PARSING
  // ─────────────────────────────────────────────────────────────────────────────

  class ParsedCell {
    constructor() {
      this.text = "";
      this.style = {};
      this.colspan = 1;
      this.rowspan = 1;
      this.width = null;
    }
  }

  class ParsedRow {
    constructor() {
      this.cells = [];
      this.height = null;
    }
  }

  class ParsedTable {
    constructor(rows = [], width = null) {
      this.rows = rows;
      this.width = width;
    }
  }

  class ExcelTableParser extends HTMLParser {
    constructor(cssClasses = null) {
      super();
      this.cssClasses = cssClasses || {};
      this.table = new ParsedTable();
      this.currentRow = null;
      this.currentCell = null;
    }

    handle_starttag(tag, attrs) {
      tag = tag.toLowerCase();
      const attrMap = {};
      for (const [name, value] of attrs) {
        if (name) {
          attrMap[name.toLowerCase()] = value || "";
        }
      }

      if (tag === 'table') {
        this.table = new ParsedTable([], attrMap['width']);
        this.currentRow = null;
        this.currentCell = null;
      } else if (tag === 'tr') {
        const row = new ParsedRow();
        row.height = this._getRowHeight(attrMap);
        this.table.rows.push(row);
        this.currentRow = row;
        this.currentCell = null;
      } else if (tag === 'td' || tag === 'th') {
        if (this.currentRow === null) {
          const row = new ParsedRow();
          this.table.rows.push(row);
          this.currentRow = row;
          this.currentCell = null;
        }
        const cell = new ParsedCell();
        this._applyAttrs(cell, attrMap);
        if (this.currentRow !== null) {
          this.currentRow.cells.push(cell);
        }
        this.currentCell = cell;
      } else if (tag === 'br') {
        // Preserve Excel line breaks (Alt+Enter) as <br> in the output
        if (this.currentCell !== null) {
          this.currentCell.text += "\x00BR\x00";
        }
      }
    }

    handle_endtag(tag) {
      tag = tag.toLowerCase();
      if (tag === 'td' || tag === 'th') {
        if (this.currentCell !== null) {
          // Normalize whitespace but preserve br placeholders, then restore them
          this.currentCell.text = this.currentCell.text
            .replace(/\x00BR\x00/g, '\x00BR\x00') // keep placeholders safe
            .split('\x00BR\x00')
            .map(part => part.replace(/\s+/g, ' ').trim())
            .join('<br>')
            .replace(/^<br>|<br>$/g, '');
          this.currentCell = null;
        }
      } else if (tag === 'tr') {
        this.currentRow = null;
      } else if (tag === 'table') {
        this.currentRow = null;
        this.currentCell = null;
      }
    }

    handle_data(data) {
      if (this.currentCell !== null) {
        this.currentCell.text += decodeHtmlEntities(data);
      }
    }

    _applyAttrs(cell, attrs) {
      const mergedProps = {};
      const classValue = attrs['class'] || '';
      for (const clsName of classValue.split(/\s+/)) {
        if (!clsName) continue;
        const key = '.' + clsName;
        if (this.cssClasses[key]) {
          Object.assign(mergedProps, this.cssClasses[key]);
        }
      }

      if (attrs['style']) {
        for (let decl of attrs['style'].split(';')) {
          decl = decl.trim();
          if (!decl.includes(':')) continue;
          const colonIdx = decl.indexOf(':');
          const key = decl.substring(0, colonIdx).trim().toLowerCase();
          const val = decl.substring(colonIdx + 1).trim();
          mergedProps[key] = val;
        }
      }

      if (attrs['align']) {
        mergedProps['text-align'] = attrs['align'].trim().toLowerCase();
      }
      if (attrs['valign']) {
        mergedProps['vertical-align'] = attrs['valign'].trim().toLowerCase();
      }

      const filtered = filterProps(mergedProps);

      if (attrs['width']) {
        cell.width = attrs['width'];
      } else if (filtered['width']) {
        cell.width = filtered['width'];
      } else if (filtered['height'] && this._looksLikeWidthFromStyle(attrs['style'] || '')) {
        cell.width = filtered['height'];
      }

      cell.colspan = (attrs['colspan'] && /^\d+$/.test(attrs['colspan'])) ? parseInt(attrs['colspan'], 10) : 1;
      cell.rowspan = (attrs['rowspan'] && /^\d+$/.test(attrs['rowspan'])) ? parseInt(attrs['rowspan'], 10) : 1;

      for (const [key, value] of Object.entries(filtered)) {
        if (key === 'width' || key === 'height') {
          continue;
        }
        if (key === 'text-align') {
          if (['right', 'center', 'left'].includes(value.toLowerCase())) {
            cell.style['text-align'] = value.toLowerCase();
          }
          continue;
        }
        if (key === 'vertical-align') {
          if (value.toLowerCase() !== 'bottom') {
            cell.style['vertical-align'] = value.toLowerCase();
          }
          continue;
        }
        cell.style[key] = value;
      }
    }

    _getRowHeight(attrs) {
      if (attrs['height']) {
        return attrs['height'];
      }
      const styleValue = attrs['style'] || '';
      if (!styleValue) return null;
      for (let decl of styleValue.split(';')) {
        decl = decl.trim();
        if (!decl.includes(':')) continue;
        const colonIdx = decl.indexOf(':');
        const key = decl.substring(0, colonIdx).trim().toLowerCase();
        const val = decl.substring(colonIdx + 1).trim();
        if (key === 'height') {
          return val;
        }
      }
      return null;
    }

    _looksLikeWidthFromStyle(styleValue) {
      if (!styleValue) return false;
      for (let decl of styleValue.split(';')) {
        decl = decl.trim();
        if (!decl.includes(':')) continue;
        const colonIdx = decl.indexOf(':');
        const key = decl.substring(0, colonIdx).trim().toLowerCase();
        if (key === 'width') {
          return true;
        }
      }
      return false;
    }
  }

  function parseTableFragment(fragment, cssClasses = null) {
    const parser = new ExcelTableParser(cssClasses);
    parser.feed(fragment);
    parser.close();
    return parser.table;
  }

  function renderStyle(styleProps) {
    if (!styleProps || Object.keys(styleProps).length === 0) {
      return '';
    }
    return Object.entries(styleProps).map(([k, v]) => `${k}: ${v}`).join('; ');
  }

  function renderAttribute(name, value) {
    return ` ${name}="${escapeHtml(value)}"`;
  }

  function numericSize(value) {
    if (!value) return null;
    const match = value.trim().match(/^[-+]?\d+(?:\.\d+)?/);
    return match ? match[0] : null;
  }

  function isDefaultSize(value, kind = "width") {
    if (!value) return true;
    const numeric = numericSize(value);
    if (numeric === null) return false;
    const number = parseFloat(numeric);
    if (isNaN(number)) return false;
    if (kind === "height") {
      return number === 20.0;
    }
    if (kind === "width") {
      return number === 80.0;
    }
    return false;
  }

  function renderTable(table) {
    const attrs = [];
    if (table.width && !isDefaultSize(table.width, "width")) {
      attrs.push(renderAttribute('width', numericSize(table.width) || table.width));
    }

    const lines = [`<table class="excel"${attrs.join('')}>`];
    for (const row of table.rows) {
      const rowAttrs = [];
      if (row.height && !isDefaultSize(row.height, "height")) {
        rowAttrs.push(renderAttribute('height', numericSize(row.height) || row.height));
      }
      lines.push(`  <tr${rowAttrs.join('')}>`);
      for (const cell of row.cells) {
        const cellAttrs = [];
        if (cell.width && !isDefaultSize(cell.width, "width")) {
          let widthValue = numericSize(cell.width);
          if (widthValue === null) {
            widthValue = cell.width;
          }
          cellAttrs.push(renderAttribute('width', widthValue));
        }
        if (cell.colspan > 1) {
          cellAttrs.push(renderAttribute('colspan', String(cell.colspan)));
        }
        if (cell.rowspan > 1) {
          cellAttrs.push(renderAttribute('rowspan', String(cell.rowspan)));
        }
        const styleValue = renderStyle(cell.style);
        if (styleValue) {
          cellAttrs.push(renderAttribute('style', styleValue));
        }
        const text = cell.text;
        lines.push(`    <td${cellAttrs.join('')}>${text}</td>`);
      }
      lines.push('  </tr>');
    }
    lines.push('</table>');
    return lines.join('\n');
  }

  function normalizeFragment(fragment, cssClasses = null) {
    const table = parseTableFragment(fragment, cssClasses);
    return renderTable(table);
  }

  function extractStyleContent(cfHtml) {
    const match = cfHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (!match) {
      return '';
    }
    let content = match[1].trim();
    content = content.replace(/^<!--\s*/, '');
    content = content.replace(/\s*-->$/, '');
    return content;
  }

  function extractFragment(cfHtml) {
    if (!cfHtml) {
      return "";
    }
    const match = cfHtml.match(/<table\b[^>]*>[\s\S]*?<\/table>/i);
    if (match) {
      return match[0].trim();
    }
    const tablePos = cfHtml.search(/<table\b/i);
    return tablePos !== -1 ? cfHtml.substring(tablePos).trim() : cfHtml.trim();
  }

  function prettify(fragment, cssClasses = null) {
    return normalizeFragment(fragment, cssClasses);
  }

  function processHtml(cfHtml) {
    const styleContent = extractStyleContent(cfHtml);
    const cssClasses = parseCssClasses(styleContent);
    const fragment = extractFragment(cfHtml);
    const pretty = prettify(fragment, cssClasses);
    return pretty;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CMS REGISTER CUSTOM WIDGET & EDITOR COMPONENT (POLLING LOADER)
  // ─────────────────────────────────────────────────────────────────────────────
  function registerComponents() {
    const createClass = window.createClass;
    const h = window.h;

    if (!createClass || !h) {
      console.error("Decap CMS globals (createClass or h) are not available.");
      return;
    }

    const ExcelPasteControl = createClass({
      handleChange: function (e) {
        this.props.onChange(e.target.value);
      },

      handlePaste: function (e) {
        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData) return;

        const htmlData = clipboardData.getData('text/html');
        if (htmlData && htmlData.includes('<table')) {
          e.preventDefault();
          try {
            const cleanHtml = processHtml(htmlData);
            this.props.onChange(cleanHtml);
          } catch (err) {
            console.error("Failed to parse clipboard Excel data:", err);
          }
        }
      },

      render: function () {
        const value = this.props.value || '';

        return h(
          'div',
          {
            style: {
              border: '1.5px solid #dcdfe6',
              borderRadius: '6px',
              padding: '12px',
              backgroundColor: '#f8f9fa',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
              boxSizing: 'border-box'
            }
          },
          h(
            'div',
            {
              style: {
                fontWeight: '600',
                fontSize: '13px',
                color: '#303133',
                marginBottom: '8px'
              }
            },
            'Excel-Tabelle einfügen (Strg+V in das Feld drücken):'
          ),
          h('textarea', {
            value: value,
            onChange: this.handleChange,
            onPaste: this.handlePaste,
            placeholder: 'Excel-Zellen kopieren (Strg+C) und hier einfügen (Strg+V)...\nDie Tabelle wird automatisch in sauberes HTML konvertiert.',
            rows: 10,
            style: {
              width: '100%',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: '13px',
              padding: '10px',
              border: '1px solid #dcdfe6',
              borderRadius: '4px',
              backgroundColor: '#ffffff',
              color: '#303133',
              boxSizing: 'border-box',
              resize: 'vertical',
              outline: 'none'
            }
          })
        );
      }
    });

    // 1. Register custom paste widget
    window.CMS.registerWidget('excel-paste', ExcelPasteControl);

    // 2. Register Editor Component
    window.CMS.registerEditorComponent({
      id: "excel-table",
      label: "Excel Tabelle einfügen",
      fields: [
        {
          name: "html",
          label: "Excel-Daten",
          widget: "excel-paste"
        }
      ],
      // Match pattern with optional trailing whitespace/newlines (\s*) so it's correctly recognized when reloading.
      // Use a negative lookahead to prevent matching across multiple table boundaries.
      pattern: /<table class="excel"[^>]*>(?:(?!<table[\s>])[\s\S])*?<\/table>/,
      fromBlock: function (match) {
        return {
          html: match[0]
        };
      },
      toBlock: function (data) {
        return (data.html || "");
      },
      toPreview: function (data) {
        return data.html || "";
      }
    });

    console.log("Excel clipboard-to-html custom CMS component registered successfully.");
  }

  // Poll until window.CMS is defined
  function initCMS() {
    if (typeof window !== 'undefined' && window.CMS) {
      console.log("CMS found! Proceeding with registration...");
      registerComponents();
    } else {
      console.log("CMS not ready yet. Retrying in 100ms...");
      setTimeout(initCMS, 100);
    }
  }

  initCMS();
})();
