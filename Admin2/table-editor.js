/* global CMS, PoolTableEditorCore, createClass, h */
/*
 * Interactive Markdown/HTML table component for the custom Sveltia bundle.
 * The small Sveltia patch adds support for the non-standard `control` property
 * used below. All table-specific behavior remains in this project file.
 */
(function () {
  'use strict';

  const core = window.PoolTableEditorCore;

  if (!core) {
    throw new Error('PoolTableEditorCore is not loaded. Load table-editor-core.js first.');
  }

  if (!window.CMS || !window.createClass || !window.h) {
    throw new Error('Sveltia CMS custom component APIs are not available.');
  }

  const NAMED_COLORS = {
    black: '#000000',
    blue: '#0000ff',
    gray: '#808080',
    green: '#008000',
    red: '#ff0000',
    white: '#ffffff',
    windowtext: '#000000',
    yellow: '#ffff00',
  };

  const STYLE_TO_REACT = {
    background: 'background',
    'background-color': 'backgroundColor',
    border: 'border',
    'border-bottom-color': 'borderBottomColor',
    'border-bottom-style': 'borderBottomStyle',
    'border-bottom-width': 'borderBottomWidth',
    'border-color': 'borderColor',
    'border-left-color': 'borderLeftColor',
    'border-left-style': 'borderLeftStyle',
    'border-left-width': 'borderLeftWidth',
    'border-right-color': 'borderRightColor',
    'border-right-style': 'borderRightStyle',
    'border-right-width': 'borderRightWidth',
    'border-style': 'borderStyle',
    'border-top-color': 'borderTopColor',
    'border-top-style': 'borderTopStyle',
    'border-top-width': 'borderTopWidth',
    'border-width': 'borderWidth',
    color: 'color',
    'font-family': 'fontFamily',
    'font-size': 'fontSize',
    'font-style': 'fontStyle',
    'font-variant': 'fontVariant',
    'font-weight': 'fontWeight',
    height: 'height',
    padding: 'padding',
    'padding-bottom': 'paddingBottom',
    'padding-left': 'paddingLeft',
    'padding-right': 'paddingRight',
    'padding-top': 'paddingTop',
    'text-align': 'textAlign',
    'text-decoration': 'textDecoration',
    'vertical-align': 'verticalAlign',
    'white-space': 'whiteSpace',
    'word-wrap': 'wordWrap',
    width: 'width',
  };

  function classNames(values) {
    return Object.entries(values)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .join(' ');
  }

  function toReactStyle(style) {
    return Object.fromEntries(
      Object.entries(style ?? {}).map(([property, value]) => [
        STYLE_TO_REACT[property] ?? property,
        value,
      ]),
    );
  }

  function normalizeColor(value, fallback) {
    const color = String(value ?? '').trim().toLowerCase();

    if (/^#[0-9a-f]{6}$/i.test(color)) {
      return color;
    }

    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return '#' + color.slice(1).split('').map((character) => character + character).join('');
    }

    const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);

    if (rgb) {
      return (
        '#' +
        [rgb[1], rgb[2], rgb[3]]
          .map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0'))
          .join('')
      );
    }

    return NAMED_COLORS[color] ?? fallback;
  }

  function numericPixels(value) {
    const match = String(value ?? '').match(/^\s*(\d+(?:\.\d+)?)/);
    return match ? match[1] : '';
  }

  function columnLabel(columnIndex) {
    let label = '';
    let value = Math.max(0, Number(columnIndex) || 0) + 1;

    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }

    return label;
  }

  function selectionLabel(selection, model) {
    const bounds = core.getSelectionBounds(selection, model);
    const start = columnLabel(bounds.left) + (bounds.top + 1);
    const end = columnLabel(bounds.right) + (bounds.bottom + 1);
    return start === end ? start : start + ':' + end;
  }

  function isCoordinateSelected(row, column, selection, model) {
    const bounds = core.getSelectionBounds(selection, model);
    return (
      row >= bounds.top && row <= bounds.bottom && column >= bounds.left && column <= bounds.right
    );
  }

  function getPrimaryCell(model, selection) {
    const bounds = core.getSelectionBounds(selection, model);
    const coverage = core.createCoverage(model);
    const origin = coverage[bounds.top][bounds.left];
    return model.rows[origin.row].cells[origin.column];
  }

  function toolbarButton(label, title, onClick, options) {
    const config = options ?? {};

    return h(
      'button',
      {
        type: 'button',
        className: classNames({
          'pte-button': true,
          'is-active': Boolean(config.active),
          'is-danger': Boolean(config.danger),
        }),
        title,
        'aria-label': title,
        'aria-pressed': config.active === undefined ? undefined : String(Boolean(config.active)),
        disabled: Boolean(config.disabled),
        onClick,
      },
      label,
    );
  }

  function toolbarGroup(label, children) {
    return h(
      'div',
      { className: 'pte-toolbar-group', role: 'group', 'aria-label': label },
      h('span', { className: 'pte-toolbar-label' }, label),
      h('div', { className: 'pte-toolbar-actions' }, children),
    );
  }

  const TableControl = createClass({
    displayName: 'PoolTableControl',

    getInitialState: function () {
      return {
        model: core.modelFromComponentValue(this.props.value),
        selection: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        pasteMessage: '',
      };
    },

    componentWillReceiveProps: function (nextProps) {
      const nextData = nextProps.value?.data ?? '';

      if (nextData && nextData !== this.lastEmittedData && nextData !== this.props.value?.data) {
        this.setState({ model: core.modelFromComponentValue(nextProps.value) });
      }
    },

    componentWillUnmount: function () {
      window.clearTimeout(this.pasteMessageTimer);
      window.clearTimeout(this.pointerSelectionTimer);
    },

    emitModel: function (model, nextSelection) {
      const normalized = core.normalizeModel(model);
      const value = core.componentValueFromModel(normalized);
      this.lastEmittedData = value.data;
      this.setState({
        model: normalized,
        selection: nextSelection ?? this.state.selection,
      });
      this.props.onChange(value);
    },

    selectCell: function (row, column, event) {
      const coordinate = { row, column };
      const selection = event?.shiftKey
        ? { start: this.state.selection.start, end: coordinate }
        : { start: coordinate, end: coordinate };
      this.setState({ selection });
    },

    handleCellMouseDown: function (row, column, event) {
      this.pointerSelectionPending = true;
      window.clearTimeout(this.pointerSelectionTimer);
      this.pointerSelectionTimer = window.setTimeout(() => {
        this.pointerSelectionPending = false;
      }, 0);
      this.selectCell(row, column, event);
    },

    handleCellFocus: function (row, column, event) {
      if (!this.pointerSelectionPending) {
        this.selectCell(row, column, event);
      }
    },

    updateCell: function (row, column, value) {
      this.emitModel(core.setCellText(this.state.model, row, column, value));
    },

    applyStyle: function (property, value) {
      this.emitModel(core.applyStyle(this.state.model, this.state.selection, property, value));
    },

    applyBackgroundColor: function (value) {
      this.emitModel(
        core.applyStyles(this.state.model, this.state.selection, {
          background: '',
          'background-color': value,
        }),
      );
    },

    applyBorder: function (value) {
      const styles = {};

      core.SAFE_STYLE_PROPERTIES.forEach((property) => {
        if (property === 'border' || property.startsWith('border-')) {
          styles[property] = '';
        }
      });

      if (value) {
        styles.border = value;
      }

      this.emitModel(core.applyStyles(this.state.model, this.state.selection, styles));
    },

    toggleBold: function () {
      const { model, selection } = this.state;
      this.emitModel(core.toggleCellStyle(model, selection, 'font-weight', '700'));
    },

    toggleItalic: function () {
      const { model, selection } = this.state;
      this.emitModel(core.toggleCellStyle(model, selection, 'font-style', 'italic'));
    },

    addRow: function () {
      const bounds = core.getSelectionBounds(this.state.selection, this.state.model);
      const model = core.addRow(this.state.model, bounds.bottom);
      const row = Math.min(bounds.bottom + 1, model.rows.length - 1);
      this.emitModel(model, {
        start: { row, column: bounds.left },
        end: { row, column: bounds.left },
      });
    },

    removeRow: function () {
      const bounds = core.getSelectionBounds(this.state.selection, this.state.model);
      const model = core.removeRow(this.state.model, bounds.top);
      const row = Math.min(bounds.top, model.rows.length - 1);
      this.emitModel(model, {
        start: { row, column: Math.min(bounds.left, core.getColumnCount(model) - 1) },
        end: { row, column: Math.min(bounds.left, core.getColumnCount(model) - 1) },
      });
    },

    addColumn: function () {
      const bounds = core.getSelectionBounds(this.state.selection, this.state.model);
      const model = core.addColumn(this.state.model, bounds.right);
      const column = Math.min(bounds.right + 1, core.getColumnCount(model) - 1);
      this.emitModel(model, {
        start: { row: bounds.top, column },
        end: { row: bounds.top, column },
      });
    },

    removeColumn: function () {
      const bounds = core.getSelectionBounds(this.state.selection, this.state.model);
      const model = core.removeColumn(this.state.model, bounds.left);
      const column = Math.min(bounds.left, core.getColumnCount(model) - 1);
      this.emitModel(model, {
        start: { row: Math.min(bounds.top, model.rows.length - 1), column },
        end: { row: Math.min(bounds.top, model.rows.length - 1), column },
      });
    },

    convertFormat: function () {
      const nextFormat =
        this.state.model.format === core.FORMAT_MARKDOWN
          ? core.FORMAT_HTML
          : core.FORMAT_MARKDOWN;

      if (
        nextFormat === core.FORMAT_MARKDOWN &&
        !window.confirm(
          'Beim Umwandeln in Markdown gehen Farben, Rahmen, Zellverbindungen und Größen verloren. Fortfahren?',
        )
      ) {
        return;
      }

      this.emitModel(core.changeFormat(this.state.model, nextFormat));
    },

    mergeCells: function () {
      this.emitModel(core.mergeSelection(this.state.model, this.state.selection));
    },

    splitCells: function () {
      this.emitModel(core.splitSelection(this.state.model, this.state.selection));
    },

    handlePaste: function (event) {
      const clipboard = event.clipboardData ?? event.nativeEvent?.clipboardData;

      if (!clipboard) {
        return;
      }

      const html = clipboard.getData('text/html');
      const plainText = clipboard.getData('text/plain') || clipboard.getData('Text');
      const pasted = core.parseClipboardTable(html, plainText);

      if (!pasted) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const bounds = core.getSelectionBounds(this.state.selection, this.state.model);
      const model = core.pasteTable(this.state.model, pasted, bounds.top, bounds.left);
      const pastedBottom = bounds.top + pasted.rows.length - 1;
      const pastedRight = bounds.left + core.getColumnCount(pasted) - 1;
      const ignoredStyles =
        model.format === core.FORMAT_MARKDOWN && core.hasHtmlOnlyFormatting(pasted);
      const pastedRows = pasted.rows.length;
      const pastedColumns = core.getColumnCount(pasted);

      this.setState({
        pasteMessage: ignoredStyles
          ? `${pastedRows} × ${pastedColumns} Excel-Zellen eingefügt. Markdown übernimmt entsprechend deiner Auswahl nur die Werte.`
          : `${pastedRows} × ${pastedColumns} Tabellenzellen eingefügt. Die Tabelle wurde bei Bedarf automatisch vergrößert.`,
      });
      window.clearTimeout(this.pasteMessageTimer);
      this.pasteMessageTimer = window.setTimeout(() => this.setState({ pasteMessage: '' }), 5000);
      this.emitModel(model, {
        start: { row: bounds.top, column: bounds.left },
        end: { row: pastedBottom, column: pastedRight },
      });
    },

    renderToolbar: function () {
      const { model, selection } = this.state;
      const html = model.format === core.FORMAT_HTML;
      const bounds = core.getSelectionBounds(selection, model);
      const primaryCell = getPrimaryCell(model, selection);
      const selectedOrigins = core.getSelectedOrigins(model, selection);
      const merged = selectedOrigins.some(({ row, column }) => {
        const cell = model.rows[row].cells[column];
        return cell.colspan > 1 || cell.rowspan > 1;
      });
      const backgroundColor = normalizeColor(
        primaryCell.style['background-color'] ?? primaryCell.style.background,
        '#ffffff',
      );
      const textColor = normalizeColor(primaryCell.style.color, '#000000');

      return h(
        'div',
        { className: 'pte-toolbar', role: 'toolbar', 'aria-label': 'Tabellenwerkzeuge' },
        toolbarGroup('Tabelle', [
          toolbarButton('+ Reihe', 'Reihe unterhalb hinzufügen', this.addRow),
          toolbarButton('− Reihe', 'Ausgewählte Reihe löschen', this.removeRow, {
            disabled: model.rows.length <= 1,
            danger: true,
          }),
          toolbarButton('+ Spalte', 'Spalte rechts hinzufügen', this.addColumn),
          toolbarButton('− Spalte', 'Ausgewählte Spalte löschen', this.removeColumn, {
            disabled: core.getColumnCount(model) <= 1,
            danger: true,
          }),
        ]),
        toolbarGroup('Text', [
          toolbarButton('B', 'Fett', this.toggleBold, {
            active: selectedOrigins.every(({ row, column }) => {
              const weight = model.rows[row].cells[column].style['font-weight'];
              return weight === '700' || weight === 'bold';
            }),
          }),
          toolbarButton('I', 'Kursiv', this.toggleItalic, {
            active: selectedOrigins.every(({ row, column }) => {
              return model.rows[row].cells[column].style['font-style'] === 'italic';
            }),
          }),
          toolbarButton('⇤', 'Text links ausrichten', () => this.applyStyle('text-align', 'left'), {
            active: primaryCell.style['text-align'] === 'left',
          }),
          toolbarButton('↔', 'Text zentrieren', () => this.applyStyle('text-align', 'center'), {
            active: primaryCell.style['text-align'] === 'center',
          }),
          toolbarButton('⇥', 'Text rechts ausrichten', () => this.applyStyle('text-align', 'right'), {
            active: primaryCell.style['text-align'] === 'right',
          }),
        ]),
        html
          ? toolbarGroup('Zellen', [
              toolbarButton('↥', 'Oben ausrichten', () => this.applyStyle('vertical-align', 'top'), {
                active: primaryCell.style['vertical-align'] === 'top',
              }),
              toolbarButton(
                '↕',
                'Vertikal zentrieren',
                () => this.applyStyle('vertical-align', 'middle'),
                { active: primaryCell.style['vertical-align'] === 'middle' },
              ),
              toolbarButton(
                '↧',
                'Unten ausrichten',
                () => this.applyStyle('vertical-align', 'bottom'),
                { active: primaryCell.style['vertical-align'] === 'bottom' },
              ),
              toolbarButton('Verbinden', 'Ausgewählten rechteckigen Bereich verbinden', this.mergeCells, {
                disabled: bounds.top === bounds.bottom && bounds.left === bounds.right,
              }),
              toolbarButton('Trennen', 'Ausgewählte verbundene Zellen trennen', this.splitCells, {
                disabled: !merged,
              }),
            ])
          : null,
        html
          ? toolbarGroup('Farben', [
              h(
                'label',
                { className: 'pte-color-control', title: 'Hintergrundfarbe' },
                h('span', null, 'Hintergrund'),
                h('input', {
                  type: 'color',
                  value: backgroundColor,
                  'aria-label': 'Hintergrundfarbe',
                  onChange: (event) => this.applyBackgroundColor(event.target.value),
                }),
              ),
              toolbarButton('×', 'Hintergrundfarbe entfernen', () => this.applyBackgroundColor('')),
              h(
                'label',
                { className: 'pte-color-control', title: 'Textfarbe' },
                h('span', null, 'Text'),
                h('input', {
                  type: 'color',
                  value: textColor,
                  'aria-label': 'Textfarbe',
                  onChange: (event) => this.applyStyle('color', event.target.value),
                }),
              ),
              toolbarButton('×', 'Textfarbe entfernen', () => this.applyStyle('color', '')),
            ])
          : null,
        html
          ? toolbarGroup('Rahmen und Größe', [
              toolbarButton('Rahmen', 'Rahmen hinzufügen', () =>
                this.applyBorder('1px solid #808080'),
              ),
              toolbarButton('Ohne', 'Rahmen entfernen', () => this.applyBorder('')),
              h(
                'label',
                { className: 'pte-size-control' },
                h('span', null, 'Spaltenbreite'),
                h('input', {
                  type: 'number',
                  min: '40',
                  value: numericPixels(model.columnWidths[bounds.left]),
                  placeholder: 'auto',
                  'aria-label': 'Breite der ausgewählten Spalten in Pixel',
                  onChange: (event) =>
                    this.emitModel(
                      core.setColumnWidth(
                        model,
                        selection,
                        event.target.value ? event.target.value + 'px' : '',
                      ),
                    ),
                }),
                h('span', null, 'px'),
              ),
              h(
                'label',
                { className: 'pte-size-control' },
                h('span', null, 'Reihenhöhe'),
                h('input', {
                  type: 'number',
                  min: '38',
                  value: numericPixels(model.rows[bounds.top].height),
                  placeholder: 'auto',
                  'aria-label': 'Höhe der ausgewählten Reihen in Pixel',
                  onChange: (event) =>
                    this.emitModel(
                      core.setRowHeight(
                        model,
                        selection,
                        event.target.value ? event.target.value + 'px' : '',
                      ),
                    ),
                }),
                h('span', null, 'px'),
              ),
            ])
          : null,
      );
    },

    renderTable: function () {
      const { model, selection } = this.state;
      const coverage = core.createCoverage(model);
      const tableStyle = toReactStyle(model.tableStyle);

      return h(
        'div',
        { className: 'pte-table-scroll', onPasteCapture: this.handlePaste },
        h(
          'table',
          { className: 'pte-table', style: tableStyle },
          h(
            'colgroup',
            null,
            model.columnWidths.map((width, columnIndex) =>
              h('col', {
                key: 'column-' + columnIndex,
                style: { width: width || '110px' },
              }),
            ),
          ),
          h(
            'tbody',
            null,
            model.rows.map((row, rowIndex) =>
              h(
                'tr',
                { key: 'row-' + rowIndex, style: row.height ? { height: row.height } : undefined },
                row.cells.map((cell, columnIndex) => {
                  const origin = coverage[rowIndex][columnIndex];

                  if (origin.row !== rowIndex || origin.column !== columnIndex) {
                    return null;
                  }

                  const Tag = cell.header ? 'th' : 'td';
                  const selected = isCoordinateSelected(
                    rowIndex,
                    columnIndex,
                    selection,
                    model,
                  );
                  const style = toReactStyle(cell.style);

                  return h(
                    Tag,
                    {
                      key: 'cell-' + rowIndex + '-' + columnIndex,
                      className: classNames({
                        'pte-cell': true,
                        'is-header': cell.header,
                        'is-selected': selected,
                      }),
                      colSpan: cell.colspan,
                      rowSpan: cell.rowspan,
                      style,
                      onMouseDown: (event) =>
                        this.handleCellMouseDown(rowIndex, columnIndex, event),
                    },
                    h('textarea', {
                      value: cell.text,
                      rows: Math.max(1, cell.text.split('\n').length),
                      'aria-label':
                        'Zelle ' +
                        columnLabel(columnIndex) +
                        String(rowIndex + 1),
                      onFocus: (event) => this.handleCellFocus(rowIndex, columnIndex, event),
                      onChange: (event) =>
                        this.updateCell(rowIndex, columnIndex, event.target.value),
                    }),
                  );
                }),
              ),
            ),
          ),
        ),
      );
    },

    render: function () {
      const { model, selection, pasteMessage } = this.state;
      const html = model.format === core.FORMAT_HTML;

      return h(
        'section',
        {
          className: 'pool-table-editor',
          'data-table-format': model.format,
        },
        h(
          'header',
          { className: 'pte-header' },
          h(
            'div',
            null,
            h('strong', null, html ? 'HTML-Tabelle' : 'Markdown-Tabelle'),
            h(
              'span',
              { className: 'pte-selection-label' },
              'Auswahl: ' + selectionLabel(selection, model),
            ),
          ),
          toolbarButton(
            html ? 'In Markdown umwandeln' : 'In HTML umwandeln',
            html
              ? 'In Markdown umwandeln; HTML-spezifische Formatierung geht verloren'
              : 'In HTML umwandeln und zusätzliche Formatierungen aktivieren',
            this.convertFormat,
          ),
        ),
        !html
          ? h(
              'p',
              { className: 'pte-hint' },
              'Markdown unterstützt Spaltenausrichtung und Text-Markup. Für Farben, Rahmen, Größen und verbundene Zellen bitte bewusst in HTML umwandeln.',
            )
          : null,
        this.renderToolbar(),
        pasteMessage
          ? h('div', { className: 'pte-message', role: 'status' }, pasteMessage)
          : null,
        this.renderTable(),
        h(
          'p',
          { className: 'pte-paste-hint' },
          'Excel-Zellen kopieren und mit Strg+V direkt in die ausgewählte Zelle einfügen. Mit Umschalt+Klick wird ein Zellbereich ausgewählt.',
        ),
      );
    },
  });

  const emptyModel = core.createEmptyModel(core.FORMAT_MARKDOWN, 3, 3);

  CMS.registerEditorComponent({
    id: 'editable-table',
    label: 'Tabelle',
    icon: 'table',
    collapsed: false,
    fields: [
      { name: 'format', label: 'Format', widget: 'hidden', default: core.FORMAT_MARKDOWN },
      {
        name: 'data',
        label: 'Tabellendaten',
        widget: 'hidden',
        default: JSON.stringify(emptyModel),
      },
    ],
    pattern: core.TABLE_PATTERN,
    fromBlock: function (match) {
      return core.componentValueFromSource(match[0]);
    },
    toBlock: function (value) {
      return core.serializeTable(core.modelFromComponentValue(value));
    },
    toPreview: function (value) {
      const model = core.modelFromComponentValue(value);
      return core.serializeHtml(core.changeFormat(model, core.FORMAT_HTML));
    },
    control: TableControl,
  });
})();
