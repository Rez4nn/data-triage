(() => {
  'use strict';

  const select = (selector) => document.querySelector(selector);
  const selectAll = (selector) => [...document.querySelectorAll(selector)];

  const rules = Object.fromEntries(
    (window.DATA_TRIAGE_RULES || []).map((rule) => [rule.id, rule])
  );

  const maxPairwiseRows = 25000;

  const state = {
    name: '',
    rows: [],
    columns: [],
    profiles: [],
    issues: [],
    relationships: [],
    focus: '',
    charts: {},
    sourceType: '',
    selectedRelationship: 0,
    comparison: null,
    pinnedMeasureButton: null,
    pinnedSchemaButton: null
  };

  function init() {
    bindUi();
    const savedTheme = localStorage.getItem('dt-theme');
    setTheme(savedTheme === 'light' ? 'light' : 'dark');
  }

  function bindUi() {
    select('#chooseFileBtn').addEventListener('click', (event) => {
      event.stopPropagation();
      select('#fileInput').click();
    });

    select('#dropzone').addEventListener('click', (event) => {
      if (!event.target.closest('button')) {
        select('#fileInput').click();
      }
    });

    select('#dropzone').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select('#fileInput').click();
      }
    });

    select('#fileInput').addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        loadFile(file);
      }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      select('#dropzone').addEventListener(eventName, (event) => {
        event.preventDefault();
        select('#dropzone').classList.add('dragging');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      select('#dropzone').addEventListener(eventName, (event) => {
        event.preventDefault();
        select('#dropzone').classList.remove('dragging');
      });
    });

    select('#dropzone').addEventListener('drop', (event) => {
      const file = event.dataTransfer.files[0];
      if (file) {
        loadFile(file);
      }
    });

    select('#sampleBtn').addEventListener('click', (event) => {
      event.stopPropagation();
      analyseDataset(makeSampleData(), 'sample_customer_data.csv', 'Sample CSV');
    });

    select('#newFileBtn').addEventListener('click', () => select('#fileInput').click());
    select('#compareBtn').addEventListener('click', () => select('#compareFileInput').click());
    select('#compareTabBtn').addEventListener('click', () => select('#compareFileInput').click());
    select('#sampleCompareBtn').addEventListener('click', loadSampleComparison);
    select('#compareFileInput').addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        loadComparisonFile(file);
      }
    });
    select('#exportBtn').addEventListener('click', exportReport);

    select('#focusSelect').addEventListener('change', (event) => {
      state.focus = event.target.value;
      state.selectedRelationship = 0;
      renderRelationships();
      renderSuggestions();
    });

    select('#themeToggle').addEventListener('click', () => {
      const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
    });

    selectAll('.tab').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    select('#relationshipList').addEventListener('click', (event) => {
      const measureButton = event.target.closest('[data-measure-kind]');
      if (measureButton) {
        event.stopPropagation();
        toggleMeasurePopover(measureButton);
        return;
      }

      const item = event.target.closest('[data-relationship-index]');
      if (!item) {
        return;
      }
      state.selectedRelationship = Number(item.dataset.relationshipIndex) || 0;
      hideMeasurePopover();
      renderRelationships();
    });

    select('#relationshipList').addEventListener('mouseover', (event) => {
      const measureButton = event.target.closest('[data-measure-kind]');
      if (measureButton && state.pinnedMeasureButton !== measureButton) {
        showMeasurePopover(measureButton, false);
      }
    });

    select('#relationshipList').addEventListener('mouseout', (event) => {
      const measureButton = event.target.closest('[data-measure-kind]');
      if (!measureButton || state.pinnedMeasureButton === measureButton) {
        return;
      }
      if (!measureButton.contains(event.relatedTarget)) {
        hideMeasurePopover(false);
      }
    });

    select('#relationshipList').addEventListener('focusin', (event) => {
      const measureButton = event.target.closest('[data-measure-kind]');
      if (measureButton) {
        showMeasurePopover(measureButton, false);
      }
    });

    select('#schemaTable tbody').addEventListener('click', (event) => {
      const statusButton = event.target.closest('[data-schema-status]');
      if (!statusButton) {
        return;
      }
      event.stopPropagation();
      toggleSchemaPopover(statusButton);
    });

    select('#schemaTable tbody').addEventListener('mouseover', (event) => {
      const statusButton = event.target.closest('[data-schema-status]');
      if (statusButton && state.pinnedSchemaButton !== statusButton) {
        showSchemaPopover(statusButton, false);
      }
    });

    select('#schemaTable tbody').addEventListener('mouseout', (event) => {
      const statusButton = event.target.closest('[data-schema-status]');
      if (!statusButton || state.pinnedSchemaButton === statusButton) {
        return;
      }
      if (!statusButton.contains(event.relatedTarget)) {
        hideSchemaPopover(false);
      }
    });

    select('#schemaTable tbody').addEventListener('focusin', (event) => {
      const statusButton = event.target.closest('[data-schema-status]');
      if (statusButton) {
        showSchemaPopover(statusButton, false);
      }
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.measure-help') && !event.target.closest('.schema-help') && !event.target.closest('#measurePopover')) {
        hideMeasurePopover();
        hideSchemaPopover();
      }
    });

    window.addEventListener('resize', () => {
      hideMeasurePopover();
      hideSchemaPopover();
    });
    window.addEventListener('scroll', () => {
      hideMeasurePopover();
      hideSchemaPopover();
    }, true);
  }

  function setTheme(theme) {
    const activeTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = activeTheme;
    localStorage.setItem('dt-theme', activeTheme);
    select('#themeToggle').innerHTML = activeTheme === 'dark'
      ? '☀ <span>Light mode</span>'
      : '☾ <span>Dark mode</span>';

    Object.values(state.charts).forEach((chart) => chart?.update());
  }

  async function parseFile(file) {
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    let rows = [];
    let sourceType = extension.toUpperCase();

    if (['json', 'jsonl', 'ndjson'].includes(extension)) {
      rows = await readJsonFile(file, extension);
    } else {
      const result = await readSpreadsheetFile(file, extension);
      rows = result.rows;
      sourceType = result.sourceType;
    }

    rows = rows.filter((row) =>
      row &&
      typeof row === 'object' &&
      Object.values(row).some((value) => !isMissing(value))
    );

    if (!rows.length) {
      throw new Error('No usable data rows were found.');
    }

    return { rows, sourceType };
  }

  function loadSampleComparison() {
    if (!state.rows.length) {
      return;
    }

    const rows = makeSampleComparisonData();
    const columns = collectColumns(rows);
    const profiles = columns.map((column) => profileColumn(column, rows));

    state.comparison = {
      name: 'sample_customer_data_previous.csv',
      rows,
      columns,
      profiles,
      sourceType: 'Sample comparison'
    };

    renderSchemaComparison();
    switchTab('compare');
  }

  async function loadComparisonFile(file) {
    if (!state.rows.length) {
      return;
    }

    showLoading('Comparing schema…', 'Reading the comparison file locally in your browser.');

    try {
      const result = await parseFile(file);
      const columns = collectColumns(result.rows);
      const profiles = columns.map((column) => profileColumn(column, result.rows));

      state.comparison = {
        name: file.name,
        rows: result.rows,
        columns,
        profiles,
        sourceType: result.sourceType
      };

      renderSchemaComparison();
      switchTab('compare');
    } catch (error) {
      console.error(error);
      alert(`Could not compare that dataset. ${error.message || 'Please try another file.'}`);
    } finally {
      hideLoading();
      select('#compareFileInput').value = '';
    }
  }

  async function loadFile(file) {
    showLoading('Reading dataset…', 'Parsing locally in your browser. Nothing is being uploaded.');

    try {
      const result = await parseFile(file);
      analyseDataset(result.rows, file.name, result.sourceType);
    } catch (error) {
      console.error(error);
      alert(`Could not read that dataset. ${error.message || 'Please try another file.'}`);
    } finally {
      hideLoading();
      select('#fileInput').value = '';
    }
  }

  async function readJsonFile(file, extension) {
    const text = await file.text();

    if (extension === 'json') {
      const parsed = JSON.parse(text);

      if (Array.isArray(parsed)) {
        return parsed;
      }

      if (parsed && typeof parsed === 'object') {
        const firstArray = Object.values(parsed).find(Array.isArray);
        if (firstArray) {
          return firstArray;
        }

        return Object.entries(parsed).map(([key, value]) => ({
          key,
          value: typeof value === 'object' ? JSON.stringify(value) : value
        }));
      }

      return [];
    }

    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch {
          return { line: index + 1, value: line };
        }
      });
  }

  async function readSpreadsheetFile(file, extension) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, {
      type: 'array',
      cellDates: true,
      raw: false
    });

    if (!workbook.SheetNames.length) {
      throw new Error('No readable sheet was found.');
    }

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, {
      defval: null,
      raw: false
    });

    let sourceType = extension.toUpperCase();
    if (workbook.SheetNames.length > 1) {
      sourceType += ` · ${workbook.SheetNames.length} sheets (analysing first)`;
    }

    return { rows, sourceType };
  }

  function analyseDataset(rows, name, sourceType) {
    showLoading('Auditing dataset…', 'Checking structure, quality and relationships.');

    setTimeout(() => {
      try {
        state.name = name;
        state.rows = rows;
        state.columns = collectColumns(rows);
        state.sourceType = sourceType;
        state.profiles = state.columns.map((column) => profileColumn(column, rows));
        state.issues = runAudit(rows, state.profiles);
        state.relationships = discoverRelationships(rows, state.profiles);
        state.focus = '';
        state.selectedRelationship = 0;
        state.comparison = null;
        resetSchemaComparison();

        select('#hero').classList.add('hidden');
        select('#workspace').classList.remove('hidden');
        renderAll();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } finally {
        hideLoading();
      }
    }, 40);
  }

  function collectColumns(rows) {
    const seen = new Set();
    const columns = [];

    rows.slice(0, 5000).forEach((row) => {
      Object.keys(row).forEach((column) => {
        if (!seen.has(column)) {
          seen.add(column);
          columns.push(column);
        }
      });
    });

    return columns;
  }

  function isMissing(value) {
    if (value === null || value === undefined || value === '') {
      return true;
    }

    if (typeof value !== 'string') {
      return false;
    }

    return ['na', 'n/a', 'null', 'none', 'nan', 'missing'].includes(value.trim().toLowerCase());
  }

  function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value
      .trim()
      .replace(/[$£€,%]/g, '')
      .replace(/,/g, '');

    if (!cleaned || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(cleaned)) {
      return null;
    }

    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  }

  function isValidIsoDate(value) {
    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
  }

  function isValidSlashDate(value) {
    const match = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!match) {
      return false;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
  }

  function isValidDashDate(value) {
    const match = String(value).trim().match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
    if (!match) {
      return false;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
  }

  function isValidDateValue(value) {
    if (value instanceof Date) {
      return !Number.isNaN(value.getTime());
    }

    const text = String(value ?? '').trim();
    if (!text) {
      return false;
    }

    if (isValidIsoDate(text) || isValidSlashDate(text) || isValidDashDate(text)) {
      return true;
    }

    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) {
      return !Number.isNaN(Date.parse(text));
    }

    if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}$/.test(text) ||
        /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(text)) {
      return !Number.isNaN(Date.parse(text));
    }

    return false;
  }

  function looksDate(value) {
    return isValidDateValue(value);
  }

  function detectValueFormat(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return 'date';
    }

    const text = String(value ?? '').trim();
    if (!text) {
      return 'blank';
    }

    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(text)) {
      return 'email';
    }

    if (/^(https?:\/\/|www\.)[^\s]+$/i.test(text)) {
      return 'url';
    }

    if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(text)) {
      return 'uk-postcode';
    }

    if (/^\+?[\d() .-]{7,20}$/.test(text) && /[0-9]/.test(text)) {
      return 'phone';
    }

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
      return 'uuid';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return isValidIsoDate(text) ? 'iso-date' : 'invalid-date';
    }

    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) {
      return !Number.isNaN(Date.parse(text)) ? 'iso-datetime' : 'invalid-date';
    }

    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text)) {
      return isValidSlashDate(text) ? 'slash-date' : 'invalid-date';
    }

    if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(text)) {
      return isValidDashDate(text) ? 'dash-date' : 'invalid-date';
    }

    if (/^\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]m)?$/i.test(text)) {
      return 'time';
    }

    if (/^(yes|no|true|false|y|n|0|1)$/i.test(text)) {
      return 'boolean';
    }

    if (/^[£$€]\s*-?[\d,]+(?:\.\d+)?$/.test(text)) {
      return 'currency';
    }

    if (/^-?[\d,]+(?:\.\d+)?\s*%$/.test(text)) {
      return 'percentage';
    }

    if (/^[-+]?\d+$/.test(text.replace(/,/g, ''))) {
      return 'integer';
    }

    if (/^[-+]?(?:\d+\.\d+|\d*\.\d+)(?:e[-+]?\d+)?$/i.test(text.replace(/,/g, ''))) {
      return 'decimal';
    }

    return 'text';
  }

  function formatLabel(kind) {
    const labels = {
      email: 'Email address',
      url: 'Web URL',
      'uk-postcode': 'UK postcode',
      phone: 'Phone number',
      uuid: 'UUID',
      'iso-date': 'ISO date (YYYY-MM-DD)',
      'iso-datetime': 'ISO date and time',
      'slash-date': 'Date (DD/MM/YYYY)',
      'dash-date': 'Date (DD-MM-YYYY)',
      date: 'Valid date',
      time: 'Time',
      boolean: 'Yes/no or true/false',
      currency: 'Currency value',
      percentage: 'Percentage',
      integer: 'Whole number',
      decimal: 'Decimal number',
      text: 'Free text',
      mixed: 'Mixed or no clear format',
      blank: 'Blank',
      'invalid-date': 'Invalid date'
    };

    return labels[kind] || kind;
  }

  function expectedKindFromName(name) {
    const normalised = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    if (/(^|_)email(_|$)/.test(normalised)) return 'email';
    if (/(^|_)(url|website|web_link|link)(_|$)/.test(normalised)) return 'url';
    if (/(^|_)(postcode|postal_code)(_|$)/.test(normalised)) return 'uk-postcode';
    if (/(^|_)(phone|telephone|mobile|tel)(_|$)/.test(normalised)) return 'phone';
    if (/(^|_)(uuid|guid)(_|$)/.test(normalised)) return 'uuid';
    if (/(^|_)(date|dob|birthday|created_at|updated_at|timestamp|datetime)(_|$)/.test(normalised)) return 'date';
    if (/(^|_)(percent|percentage|pct|rate_percent)(_|$)/.test(normalised)) return 'percentage';

    return null;
  }

  function valueMatchesExpectedFormat(value, expectedKind) {
    const kind = detectValueFormat(value);
    const dateKinds = ['date', 'iso-date', 'iso-datetime', 'slash-date', 'dash-date'];

    if (expectedKind === 'date') {
      return isValidDateValue(value);
    }

    if (expectedKind === 'text') {
      return kind === 'text';
    }

    if (expectedKind === 'mixed') {
      return true;
    }

    if (expectedKind === 'integer') {
      return kind === 'integer';
    }

    if (expectedKind === 'decimal') {
      return kind === 'integer' || kind === 'decimal';
    }

    return kind === expectedKind;
  }

  function inferExpectedFormat(name, presentValues) {
    if (!presentValues.length) {
      return {
        kind: 'blank',
        label: 'No observed values',
        matchPct: null,
        mismatches: 0,
        dateFormats: []
      };
    }

    const observedKinds = presentValues.map(detectValueFormat);
    const counts = {};

    observedKinds.forEach((kind) => {
      counts[kind] = (counts[kind] || 0) + 1;
    });

    const dateKinds = ['date', 'iso-date', 'iso-datetime', 'slash-date', 'dash-date'];
    const nameHint = expectedKindFromName(name);
    let expectedKind = nameHint;

    if (nameHint === 'date') {
      const rankedDateKinds = Object.entries(counts)
        .filter(([kind]) => dateKinds.includes(kind))
        .sort((left, right) => right[1] - left[1]);

      if (rankedDateKinds.length && rankedDateKinds[0][1] / presentValues.length >= 0.8) {
        expectedKind = rankedDateKinds[0][0];
      }
    }

    if (!expectedKind) {
      const rankedKinds = Object.entries(counts)
        .filter(([kind]) => !['text', 'invalid-date'].includes(kind))
        .sort((left, right) => right[1] - left[1]);

      if (rankedKinds.length && rankedKinds[0][1] / presentValues.length >= 0.75) {
        expectedKind = rankedKinds[0][0];
      } else if ((counts.text || 0) / presentValues.length >= 0.75) {
        expectedKind = 'text';
      } else {
        expectedKind = 'mixed';
      }
    }

    const matches = presentValues.filter((value) =>
      valueMatchesExpectedFormat(value, expectedKind)
    ).length;

    const dateFormats = [...new Set(
      observedKinds.filter((kind) => dateKinds.includes(kind))
    )];

    return {
      kind: expectedKind,
      label: formatLabel(expectedKind),
      matchPct: 100 * matches / presentValues.length,
      mismatches: presentValues.length - matches,
      dateFormats,
      counts
    };
  }

  function expectedRangeForColumn(name) {
    const normalised = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    if (/(^|_)(age|age_years)(_|$)/.test(normalised)) {
      return { min: 0, max: 120, label: '0 to 120' };
    }

    if (/(^|_)(satisfaction|rating|score_10)(_|$)/.test(normalised)) {
      return { min: 0, max: 10, label: '0 to 10' };
    }

    if (/(^|_)(month_number|month_no)(_|$)/.test(normalised)) {
      return { min: 1, max: 12, label: '1 to 12' };
    }

    if (/(^|_)(latitude|lat)(_|$)/.test(normalised)) {
      return { min: -90, max: 90, label: '-90 to 90' };
    }

    if (/(^|_)(longitude|lon|lng)(_|$)/.test(normalised)) {
      return { min: -180, max: 180, label: '-180 to 180' };
    }

    return null;
  }

  function quantile(sortedValues, q) {
    if (!sortedValues.length) {
      return null;
    }

    const position = (sortedValues.length - 1) * q;
    const base = Math.floor(position);
    const fraction = position - base;

    if (sortedValues[base + 1] !== undefined) {
      return sortedValues[base] + fraction * (sortedValues[base + 1] - sortedValues[base]);
    }

    return sortedValues[base];
  }

  function mean(values) {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }

  function standardDeviation(values) {
    if (values.length < 2) {
      return 0;
    }

    const average = mean(values);
    const squaredDifferences = values.reduce(
      (sum, value) => sum + (value - average) ** 2,
      0
    );

    return Math.sqrt(squaredDifferences / (values.length - 1));
  }

  function skewness(values) {
    if (values.length < 3) {
      return 0;
    }

    const average = mean(values);
    const deviation = standardDeviation(values);

    if (!deviation) {
      return 0;
    }

    return values.reduce(
      (sum, value) => sum + ((value - average) / deviation) ** 3,
      0
    ) / values.length;
  }

  function formatNumber(number, digits = 1) {
    if (number === null || number === undefined || !Number.isFinite(number)) {
      return '-';
    }

    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: digits
    }).format(number);
  }

  function formatPercent(number, digits = 1) {
    return `${formatNumber(number, digits)}%`;
  }

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function profileColumn(name, rows) {
    const values = rows.map((row) => row[name]);
    const presentValues = values.filter((value) => !isMissing(value));
    const stringValues = presentValues.map((value) => String(value).trim());
    const numericValues = presentValues
      .map(toNumber)
      .filter((value) => value !== null);
    const dateValues = presentValues.filter(looksDate);
    const uniqueValues = [...new Set(stringValues)];
    const counts = {};

    stringValues.forEach((value) => {
      counts[value] = (counts[value] || 0) + 1;
    });

    const sortedCounts = Object.entries(counts).sort((left, right) => right[1] - left[1]);
    const numericRatio = presentValues.length ? numericValues.length / presentValues.length : 0;
    const dateRatio = presentValues.length ? dateValues.length / presentValues.length : 0;

    let role = 'text';

    if (!presentValues.length) {
      role = 'empty';
    } else if (numericRatio >= 0.9) {
      role = 'numeric';
    } else if (dateRatio >= 0.8) {
      role = 'date';
    } else if (uniqueValues.length <= Math.min(30, Math.max(2, rows.length * 0.2))) {
      role = uniqueValues.length === 2 ? 'binary' : 'categorical';
    }

    const uniqueRatio = presentValues.length ? uniqueValues.length / presentValues.length : 0;
    const nameLooksLikeId = /(^|_)(id|uuid|key|code|number|no)(_|$)/i.test(name);
    const likelyId = presentValues.length > 5 &&
      uniqueRatio > 0.96 &&
      (nameLooksLikeId || role === 'text' || role === 'numeric');

    if (likelyId) {
      role = 'identifier';
    }

    const sortedNumbers = numericValues.slice().sort((left, right) => left - right);
    const q1 = quantile(sortedNumbers, 0.25);
    const q3 = quantile(sortedNumbers, 0.75);
    const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;
    const outliers = iqr && iqr > 0
      ? numericValues.filter((value) => value < q1 - 3 * iqr || value > q3 + 3 * iqr).length
      : 0;

    const mode = sortedCounts[0] || [null, 0];
    const expectedFormat = inferExpectedFormat(name, presentValues);
    const expectedRange = expectedRangeForColumn(name);

    return {
      name,
      role,
      total: rows.length,
      present: presentValues.length,
      missing: rows.length - presentValues.length,
      missingPct: rows.length ? 100 * (rows.length - presentValues.length) / rows.length : 0,
      unique: uniqueValues.length,
      uniqueRatio,
      numericRatio,
      dateRatio,
      nums: numericValues,
      counts,
      top: mode[0],
      topCount: mode[1],
      topPct: presentValues.length ? 100 * mode[1] / presentValues.length : 0,
      min: sortedNumbers[0],
      max: sortedNumbers[sortedNumbers.length - 1],
      median: quantile(sortedNumbers, 0.5),
      mean: numericValues.length ? mean(numericValues) : null,
      sd: numericValues.length ? standardDeviation(numericValues) : null,
      skew: numericValues.length ? skewness(numericValues) : 0,
      outliers,
      example: presentValues.slice(0, 3).map(String).join(' · '),
      likelyId,
      expectedFormat,
      expectedRange
    };
  }

  function addIssue(issueList, id, extra = {}) {
    const rule = rules[id];
    if (rule) {
      issueList.push({ ...rule, ...extra });
    }
  }

  function runAudit(rows, profiles) {
    const issues = [];
    const fingerprints = new Map();
    let duplicateRows = 0;

    rows.forEach((row) => {
      const fingerprint = JSON.stringify(
        state.columns.map((column) => row[column] ?? null)
      );
      const previousCount = fingerprints.get(fingerprint) || 0;
      if (previousCount) {
        duplicateRows += 1;
      }
      fingerprints.set(fingerprint, previousCount + 1);
    });

    if (duplicateRows) {
      addIssue(issues, 'duplicate-rows', {
        detail: `${formatNumber(duplicateRows, 0)} exact duplicate row${duplicateRows === 1 ? '' : 's'} detected.`,
        count: duplicateRows
      });
    }

    profiles.forEach((profile) => {
      auditMissingness(profile, issues);
      auditVariation(profile, issues);
      auditIdentifiers(profile, issues);
      auditTypes(profile, issues);
      auditExpectedFormat(profile, issues);
      auditNumericDistribution(profile, issues);
      auditCategories(profile, issues);
      auditSensitiveNames(profile, issues);
    });

    const severityOrder = { high: 0, medium: 1, low: 2 };
    return issues.sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);
  }

  function auditMissingness(profile, issues) {
    if (profile.missingPct >= 70) {
      addIssue(issues, 'high-missing', {
        column: profile.name,
        detail: `${formatPercent(profile.missingPct)} of values are missing.`
      });
    } else if (profile.missingPct >= 15) {
      addIssue(issues, 'moderate-missing', {
        column: profile.name,
        detail: `${formatPercent(profile.missingPct)} of values are missing.`
      });
    }
  }

  function auditVariation(profile, issues) {
    if (profile.present > 0 && profile.unique === 1) {
      addIssue(issues, 'constant', {
        column: profile.name,
        detail: `All ${formatNumber(profile.present, 0)} observed values are “${profile.top}”.`
      });
    } else if (profile.present >= 20 && profile.topPct >= 95) {
      addIssue(issues, 'near-constant', {
        column: profile.name,
        detail: `“${profile.top}” accounts for ${formatPercent(profile.topPct)} of observed values.`
      });
    }
  }

  function auditIdentifiers(profile, issues) {
    if (!profile.likelyId) {
      return;
    }

    addIssue(issues, 'id-like', {
      column: profile.name,
      detail: `${formatPercent(profile.uniqueRatio * 100)} of observed values are unique.`
    });

    if (profile.unique < profile.present) {
      addIssue(issues, 'duplicate-id', {
        column: profile.name,
        detail: `${formatNumber(profile.present - profile.unique, 0)} repeated value${profile.present - profile.unique === 1 ? '' : 's'} in an identifier-like field.`
      });
    }
  }

  function auditTypes(profile, issues) {
    if (profile.role === 'categorical' && profile.unique > 20) {
      addIssue(issues, 'high-cardinality', {
        column: profile.name,
        detail: `${profile.unique} distinct categories were found.`
      });
    }

    if (profile.role === 'text' && profile.numericRatio > 0.2 && profile.numericRatio < 0.9) {
      addIssue(issues, 'mixed-type', {
        column: profile.name,
        detail: `${formatPercent(profile.numericRatio * 100)} of observed values can be interpreted as numbers.`
      });
    }

    if (profile.role === 'text' && profile.numericRatio >= 0.6) {
      addIssue(issues, 'numeric-text', {
        column: profile.name,
        detail: `${formatPercent(profile.numericRatio * 100)} of observed values look numeric.`
      });
    }

    if (profile.role === 'text' && profile.dateRatio >= 0.6) {
      addIssue(issues, 'date-text', {
        column: profile.name,
        detail: `${formatPercent(profile.dateRatio * 100)} of observed values resemble valid dates.`
      });
    }
  }

  function auditExpectedFormat(profile, issues) {
    const expected = profile.expectedFormat;

    if (expected && expected.matchPct !== null && !['mixed', 'text', 'blank'].includes(expected.kind)) {
      if (expected.matchPct < 70) {
        addIssue(issues, 'format-mismatch-high', {
          column: profile.name,
          detail: `Expected ${expected.label}. Only ${formatPercent(expected.matchPct)} of observed values match (${formatNumber(expected.mismatches, 0)} do not).`
        });
      } else if (expected.matchPct < 95) {
        addIssue(issues, 'format-mismatch', {
          column: profile.name,
          detail: `Expected ${expected.label}. ${formatPercent(expected.matchPct)} of observed values match (${formatNumber(expected.mismatches, 0)} do not).`
        });
      }
    }

    if (expected?.dateFormats?.length > 1) {
      addIssue(issues, 'mixed-date-format', {
        column: profile.name,
        detail: `Observed date formats include ${expected.dateFormats.map(formatLabel).join(', ')}.`
      });
    }

    const invalidDates = state.rows
      .map((row) => row[profile.name])
      .filter((value) => !isMissing(value) && detectValueFormat(value) === 'invalid-date').length;

    if (invalidDates) {
      addIssue(issues, 'invalid-date-value', {
        column: profile.name,
        detail: `${invalidDates} value${invalidDates === 1 ? '' : 's'} look like dates but are not valid calendar dates.`
      });
    }

    if (expected?.kind === 'percentage') {
      const percentages = profile.nums;
      const outsideRange = percentages.filter((value) => value < 0 || value > 100).length;

      if (outsideRange) {
        addIssue(issues, 'invalid-range-percent', {
          column: profile.name,
          detail: `${outsideRange} value${outsideRange === 1 ? ' is' : 's are'} outside 0 to 100.`
        });
      }
    }

    if (profile.expectedRange && profile.nums.length) {
      const outsideExpectedRange = profile.nums.filter(
        (value) => value < profile.expectedRange.min || value > profile.expectedRange.max
      ).length;

      if (outsideExpectedRange) {
        addIssue(issues, 'expected-range', {
          column: profile.name,
          detail: `${outsideExpectedRange} value${outsideExpectedRange === 1 ? '' : 's'} fall outside the inferred expected range of ${profile.expectedRange.label}.`
        });
      }
    }
  }

  function auditNumericDistribution(profile, issues) {
    if (profile.role !== 'numeric' || profile.nums.length < 20) {
      return;
    }

    if (profile.outliers / profile.nums.length >= 0.01) {
      addIssue(issues, 'extreme-outliers', {
        column: profile.name,
        detail: `${profile.outliers} values fall beyond the 3 x IQR boundary.`
      });
    }

    if (Math.abs(profile.skew) >= 1.5) {
      addIssue(issues, 'skewed', {
        column: profile.name,
        detail: `Skewness is ${formatNumber(profile.skew, 2)}.`
      });
    }
  }

  function auditCategories(profile, issues) {
    if (['categorical', 'binary'].includes(profile.role) && profile.present >= 20) {
      const rareCategories = Object.values(profile.counts).filter((count) => count < 5).length;
      if (rareCategories) {
        addIssue(issues, 'rare-levels', {
          column: profile.name,
          detail: `${rareCategories} categor${rareCategories === 1 ? 'y' : 'ies'} contain fewer than 5 observations.`
        });
      }
    }

    if (profile.role === 'binary') {
      addIssue(issues, 'possible-boolean', {
        column: profile.name,
        detail: `Observed values: ${Object.keys(profile.counts).slice(0, 4).join(', ')}.`
      });
    }
  }

  function auditSensitiveNames(profile, issues) {
    if (/password|secret|token|ssn|national.?insurance|email|phone|address|outcome|target|label|churn|fraud|default|diagnos/i.test(profile.name)) {
      addIssue(issues, 'suspicious-name', {
        column: profile.name,
        detail: 'The field name suggests it may need privacy, leakage or outcome-specific handling.'
      });
    }
  }

  function pearsonRelationship(firstColumnName, secondColumnName, rows) {
    const pairs = [];

    rows.forEach((row) => {
      const xValue = toNumber(row[firstColumnName]);
      const yValue = toNumber(row[secondColumnName]);
      if (xValue !== null && yValue !== null) {
        pairs.push([xValue, yValue]);
      }
    });

    if (pairs.length < 8) {
      return null;
    }

    const xValues = pairs.map((pair) => pair[0]);
    const yValues = pairs.map((pair) => pair[1]);
    const xMean = mean(xValues);
    const yMean = mean(yValues);
    let numerator = 0;
    let xSumSquares = 0;
    let ySumSquares = 0;

    // Pearson r = sum((x - x̄)(y - ȳ)) / sqrt(sum((x - x̄)^2) sum((y - ȳ)^2))
    for (let index = 0; index < pairs.length; index += 1) {
      const xDifference = xValues[index] - xMean;
      const yDifference = yValues[index] - yMean;
      numerator += xDifference * yDifference;
      xSumSquares += xDifference * xDifference;
      ySumSquares += yDifference * yDifference;
    }

    if (!xSumSquares || !ySumSquares) {
      return null;
    }

    return {
      value: numerator / Math.sqrt(xSumSquares * ySumSquares),
      n: pairs.length,
      kind: 'Pearson r'
    };
  }

  function cramersVRelationship(firstColumnName, secondColumnName, rows) {
    const validRows = rows.filter((row) =>
      !isMissing(row[firstColumnName]) && !isMissing(row[secondColumnName])
    );

    if (validRows.length < 12) {
      return null;
    }

    const firstLevels = [...new Set(validRows.map((row) => String(row[firstColumnName])))];
    const secondLevels = [...new Set(validRows.map((row) => String(row[secondColumnName])))];

    if (firstLevels.length < 2 || secondLevels.length < 2 || firstLevels.length > 20 || secondLevels.length > 20) {
      return null;
    }

    const firstLevelIndex = Object.fromEntries(firstLevels.map((value, index) => [value, index]));
    const secondLevelIndex = Object.fromEntries(secondLevels.map((value, index) => [value, index]));
    const table = Array.from(
      { length: firstLevels.length },
      () => Array(secondLevels.length).fill(0)
    );

    validRows.forEach((row) => {
      table[firstLevelIndex[String(row[firstColumnName])]][secondLevelIndex[String(row[secondColumnName])]] += 1;
    });

    const rowTotals = table.map((row) => row.reduce((sum, count) => sum + count, 0));
    const columnTotals = secondLevels.map((_, columnIndex) =>
      table.reduce((sum, row) => sum + row[columnIndex], 0)
    );

    let chiSquare = 0;

    // χ² = sum((observed - expected)^2 / expected), V = sqrt(χ² / (n * min(r - 1, c - 1)))
    for (let rowIndex = 0; rowIndex < firstLevels.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < secondLevels.length; columnIndex += 1) {
        const expected = rowTotals[rowIndex] * columnTotals[columnIndex] / validRows.length;
        if (expected > 0) {
          chiSquare += (table[rowIndex][columnIndex] - expected) ** 2 / expected;
        }
      }
    }

    const denominator = validRows.length * Math.min(firstLevels.length - 1, secondLevels.length - 1);
    if (!denominator) {
      return null;
    }

    return {
      value: Math.sqrt(chiSquare / denominator),
      n: validRows.length,
      kind: "Cramér's V"
    };
  }

  function etaSquaredRelationship(numericName, categoryName, rows) {
    const groups = {};

    rows.forEach((row) => {
      const numericValue = toNumber(row[numericName]);
      if (numericValue === null || isMissing(row[categoryName])) {
        return;
      }

      const category = String(row[categoryName]);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(numericValue);
    });

    const usableGroups = Object.values(groups).filter((group) => group.length >= 2);
    if (usableGroups.length < 2 || usableGroups.length > 20) {
      return null;
    }

    const allValues = usableGroups.flat();
    if (allValues.length < 12) {
      return null;
    }

    const grandMean = mean(allValues);
    let betweenGroupSumSquares = 0;
    let totalSumSquares = 0;

    // Eta squared = SS_between / SS_total
    usableGroups.forEach((group) => {
      betweenGroupSumSquares += group.length * (mean(group) - grandMean) ** 2;
    });

    allValues.forEach((value) => {
      totalSumSquares += (value - grandMean) ** 2;
    });

    if (!totalSumSquares) {
      return null;
    }

    return {
      value: betweenGroupSumSquares / totalSumSquares,
      n: allValues.length,
      kind: 'Eta²'
    };
  }

  function discoverRelationships(rows, profiles) {
    const usableProfiles = profiles.filter((profile) =>
      !['identifier', 'empty', 'text'].includes(profile.role) &&
      profile.unique > 1 &&
      profile.missingPct < 70
    );

    const scanRows = rows.length > maxPairwiseRows
      ? rows.slice(0, maxPairwiseRows)
      : rows;

    const relationships = [];

    for (let i = 0; i < usableProfiles.length; i += 1) {
      for (let j = i + 1; j < usableProfiles.length; j += 1) {
        const firstProfile = usableProfiles[i];
        const secondProfile = usableProfiles[j];
        let relationship = null;

        if (firstProfile.role === 'numeric' && secondProfile.role === 'numeric') {
          relationship = pearsonRelationship(firstProfile.name, secondProfile.name, scanRows);
        } else if (isCategory(firstProfile) && isCategory(secondProfile)) {
          relationship = cramersVRelationship(firstProfile.name, secondProfile.name, scanRows);
        } else if (firstProfile.role === 'numeric' && isCategory(secondProfile)) {
          relationship = etaSquaredRelationship(firstProfile.name, secondProfile.name, scanRows);
        } else if (secondProfile.role === 'numeric' && isCategory(firstProfile)) {
          relationship = etaSquaredRelationship(secondProfile.name, firstProfile.name, scanRows);
        }

        if (relationship && Number.isFinite(relationship.value)) {
          relationships.push({
            firstColumn: firstProfile.name,
            secondColumn: secondProfile.name,
            ...relationship,
            strength: Math.abs(relationship.value)
          });
        }
      }
    }

    return relationships
      .sort((left, right) => right.strength - left.strength)
      .slice(0, 80);
  }

  function isCategory(profile) {
    return ['categorical', 'binary'].includes(profile.role);
  }

  function linearRegression(points) {
    if (points.length < 2) {
      return null;
    }

    const xValues = points.map((point) => point.x);
    const yValues = points.map((point) => point.y);
    const xMean = mean(xValues);
    const yMean = mean(yValues);
    let numerator = 0;
    let denominator = 0;

    // Least-squares slope m = sum((x - x̄)(y - ȳ)) / sum((x - x̄)^2)
    points.forEach((point) => {
      numerator += (point.x - xMean) * (point.y - yMean);
      denominator += (point.x - xMean) ** 2;
    });

    if (!denominator) {
      return null;
    }

    const slope = numerator / denominator;
    const intercept = yMean - slope * xMean;
    let residualSumSquares = 0;
    let totalSumSquares = 0;

    points.forEach((point) => {
      const predicted = slope * point.x + intercept;
      residualSumSquares += (point.y - predicted) ** 2;
      totalSumSquares += (point.y - yMean) ** 2;
    });

    const rSquared = totalSumSquares
      ? 1 - residualSumSquares / totalSumSquares
      : 0;

    const sortedX = xValues.slice().sort((left, right) => left - right);
    const minX = sortedX[0];
    const maxX = sortedX[sortedX.length - 1];

    return {
      slope,
      intercept,
      rSquared,
      line: [
        { x: minX, y: slope * minX + intercept },
        { x: maxX, y: slope * maxX + intercept }
      ]
    };
  }

  function qualityScore() {
    if (!state.rows.length) {
      return 0;
    }

    let score = 100;

    state.issues.forEach((issue) => {
      score -= issue.severity === 'high' ? 11 : issue.severity === 'medium' ? 5 : 1.5;
    });

    const averageMissing = mean(state.profiles.map((profile) => profile.missingPct));
    score -= Math.min(18, averageMissing * 0.3);

    return Math.max(0, Math.round(score));
  }

  function renderAll() {
    select('#datasetName').textContent = state.name;
    select('#datasetMeta').textContent = `${formatNumber(state.rows.length, 0)} rows · ${state.columns.length} columns · ${state.sourceType}`;

    renderFocus();
    renderSummary();
    renderQuality();
    renderRelationships();
    renderSuggestions();
    renderPreview();
    if (state.comparison) {
      renderSchemaComparison();
    }
    switchTab('overview');
  }

  function renderFocus() {
    const options = state.profiles
      .filter((profile) => !['identifier', 'empty'].includes(profile.role) && profile.unique > 1)
      .map((profile) =>
        `<option value="${safe(profile.name)}">${safe(profile.name)} · ${safe(typeLabel(profile.role))}</option>`
      )
      .join('');

    select('#focusSelect').innerHTML = `<option value="">All variables</option>${options}`;
  }

  function renderSummary() {
    const missingCells = state.profiles.reduce((sum, profile) => sum + profile.missing, 0);
    const totalCells = state.rows.length * state.columns.length;
    const duplicateCount = state.issues.find((issue) => issue.id === 'duplicate-rows')?.count || 0;

    const summary = [
      ['Rows', formatNumber(state.rows.length, 0), state.rows.length > maxPairwiseRows ? 'pairwise scan capped at 25k' : 'all rows profiled'],
      ['Columns', state.columns.length, `${state.profiles.filter((profile) => profile.role === 'numeric').length} numeric`],
      ['Missing cells', totalCells ? formatPercent(100 * missingCells / totalCells) : '0%', `${formatNumber(missingCells, 0)} cells`],
      ['Duplicates', formatNumber(duplicateCount, 0), duplicateCount ? 'review before totals' : 'none detected']
    ];

    select('#summaryCards').innerHTML = summary
      .map(([label, value, note]) =>
        `<div class="summary-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`
      )
      .join('');

    const score = qualityScore();
    select('#qualityScore').textContent = score;
    select('#scoreRing').style.background = 'var(--surface-alt)';

    const qualityLabel = score >= 90
      ? 'Few issues found'
      : score >= 75
        ? 'Some checks to review'
        : score >= 55
          ? 'Needs attention'
          : 'Several issues found';

    select('#qualityLabel').textContent = qualityLabel;

    const highIssues = state.issues.filter((issue) => issue.severity === 'high').length;
    const mediumIssues = state.issues.filter((issue) => issue.severity === 'medium').length;

    select('#qualitySummary').textContent = state.issues.length
      ? `${highIssues} high-priority and ${mediumIssues} medium-priority checks were flagged.`
      : 'No warnings crossed the current thresholds. Source-specific rules still need to be checked.';

    const roleCounts = {};
    state.profiles.forEach((profile) => {
      roleCounts[profile.role] = (roleCounts[profile.role] || 0) + 1;
    });

    createChart('typeChart', {
      type: 'doughnut',
      data: {
        labels: Object.keys(roleCounts).map(typeLabel),
        datasets: [{ data: Object.values(roleCounts) }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 100,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });

    const findings = [];

    state.issues
      .filter((issue) => issue.severity === 'high')
      .slice(0, 2)
      .forEach((issue) => {
        findings.push({
          icon: '!',
          title: issue.column ? `${issue.column}: ${issue.title}` : issue.title,
          text: issue.detail || issue.description
        });
      });

    state.relationships.slice(0, 2).forEach((relationship) => {
      findings.push({
        icon: '↗',
        title: `${relationship.firstColumn} ↔ ${relationship.secondColumn}`,
        text: `${relationship.kind} = ${formatNumber(relationship.value, 2)} across ${formatNumber(relationship.n, 0)} usable rows.`
      });
    });

    if (!findings.length) {
      findings.push({
        icon: '✓',
        title: 'No major structural warnings',
        text: 'No major structural problems were found by the automated checks. Business rules and source-system constraints still need to be confirmed.'
      });
    }

    select('#topFindings').innerHTML = findings
      .slice(0, 4)
      .map((finding) =>
        `<div class="finding"><span class="finding-icon" >${finding.icon}</span><div><strong>${safe(finding.title)}</strong><p>${safe(finding.text)}</p></div></div>`
      )
      .join('');
  }

  function renderQuality() {
    const highCount = state.issues.filter((issue) => issue.severity === 'high').length;
    const mediumCount = state.issues.filter((issue) => issue.severity === 'medium').length;
    const lowCount = state.issues.filter((issue) => issue.severity === 'low').length;

    select('#issueBadge').textContent = state.issues.length;
    select('#severityLegend').innerHTML = `<span>High ${highCount}</span><span>Medium ${mediumCount}</span><span>Low ${lowCount}</span>`;

    select('#issueList').innerHTML = state.issues.length
      ? state.issues.map(renderIssue).join('')
      : '<div class="finding"><span class="finding-icon">✓</span><div><strong>No rule-based warnings</strong><p>Nothing in the current audit rule set crossed a warning threshold.</p></div></div>';

    const columnsWithMissing = state.profiles
      .filter((profile) => profile.missingPct > 0)
      .sort((left, right) => right.missingPct - left.missingPct)
      .slice(0, 25);

    createChart('missingChart', {
      type: 'bar',
      data: {
        labels: columnsWithMissing.length
          ? columnsWithMissing.map((profile) => profile.name)
          : ['No missing values'],
        datasets: [{
          label: 'Missing %',
          data: columnsWithMissing.length
            ? columnsWithMissing.map((profile) => profile.missingPct)
            : [0]
        }]
      },
      options: {
        indexAxis: columnsWithMissing.length > 7 ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 100,
        scales: {
          x: { beginAtZero: true },
          y: { beginAtZero: true }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });

    select('#profileTable tbody').innerHTML = state.profiles
      .map((profile) => renderProfileRow(profile))
      .join('');
  }

  function renderIssue(issue) {
    const icon = issue.severity === 'high' ? '!' : issue.severity === 'medium' ? '△' : 'i';
    const title = issue.column ? `${safe(issue.column)} · ${safe(issue.title)}` : safe(issue.title);

    return `<div class="issue ${issue.severity}"><span class="issue-icon">${icon}</span><div><strong>${title}</strong><p>${safe(issue.detail || issue.description)}</p></div></div>`;
  }

  function renderProfileRow(profile) {
    const flags = state.issues
      .filter((issue) => issue.column === profile.name)
      .slice(0, 4);

    const expected = profile.expectedFormat || {};
    const formatMatch = expected.matchPct === null || expected.matchPct === undefined
      ? '-'
      : formatPercent(expected.matchPct);

    const matchClass = expected.matchPct === null
      ? ''
      : expected.matchPct >= 95
        ? 'format-good'
        : expected.matchPct >= 70
          ? 'format-warn'
          : 'format-bad';

    const expectedLabel = profile.expectedRange
      ? `${expected.label || 'Not inferred'}; range ${profile.expectedRange.label}`
      : expected.label || 'Not inferred';

    return `<tr>
      <td><strong>${safe(profile.name)}</strong></td>
      <td><span class="role-pill">${safe(typeLabel(profile.role))}</span></td>
      <td>${safe(expectedLabel)}</td>
      <td><span class="${matchClass}">${formatMatch}</span></td>
      <td>${formatPercent(100 - profile.missingPct)}</td>
      <td>${formatNumber(profile.unique, 0)}</td>
      <td title="${safe(profile.example)}">${safe((profile.example || '-').slice(0, 44))}</td>
      <td>${flags.length ? flags.map((flag) => `<span class="flag-pill">${safe(flag.title)}</span>`).join('') : '-'}</td>
    </tr>`;
  }

  function currentRelationships() {
    if (!state.focus) {
      return state.relationships;
    }

    return state.relationships.filter((relationship) =>
      relationship.firstColumn === state.focus || relationship.secondColumn === state.focus
    );
  }

  function renderRelationships() {
    const relationships = currentRelationships();

    if (state.selectedRelationship >= relationships.length) {
      state.selectedRelationship = 0;
    }

    select('#relationshipTitle').textContent = state.focus
      ? `Relationships involving ${state.focus}`
      : 'Ranked relationships';

    select('#relationshipIntro').textContent = state.focus
      ? `Showing ranked relationships involving “${state.focus}”. Select All variables to return to all variables.`
      : 'Relationships are ranked after excluding likely IDs, constant fields and very sparse columns. Select a row to view its chart.';

    select('#relationshipList').innerHTML = relationships.length
      ? relationships.slice(0, 12).map((relationship, index) => renderRelationshipRow(relationship, index)).join('')
      : '<div class="finding"><span class="finding-icon">?</span><div><strong>No suitable pairwise relationship found</strong><p>There may be too few usable variables, too much missingness, or category counts may be too sparse.</p></div></div>';

    renderTopRelationshipChart(relationships[state.selectedRelationship]);
  }

  function renderRelationshipRow(relationship, index) {
    const selectedClass = index === state.selectedRelationship ? ' selected' : '';
    return `<div class="relationship${selectedClass}" data-relationship-index="${index}" tabindex="0">
      <div class="relationship-main">
        <strong>${safe(relationship.firstColumn)} ↔ ${safe(relationship.secondColumn)}</strong>
        <p>${safe(relationshipSentence(relationship))}</p>
      </div>
      <div class="relationship-score">
        <strong>${formatNumber(relationship.strength, 2)}</strong>
        <small><button class="measure-help" type="button" data-measure-kind="${safe(relationship.kind)}" aria-label="Explain ${safe(relationship.kind)}">${safe(relationship.kind)} · explain</button></small>
      </div>
    </div>`;
  }

  function relationshipSentence(relationship) {
    if (relationship.kind === 'Pearson r') {
      const direction = relationship.value > 0 ? 'positive' : 'negative';
      return `${strengthWord(Math.abs(relationship.value))} ${direction} straight-line relationship across ${relationship.n} complete pairs.`;
    }

    if (relationship.kind === "Cramér's V") {
      return `${strengthWord(relationship.value)} connection between two category fields across ${relationship.n} usable rows.`;
    }

    return `${strengthWord(relationship.value)} group difference. About ${formatPercent(relationship.value * 100)} of the numeric variation is associated with the category groups.`;
  }

  function strengthWord(value) {
    if (value >= 0.7) return 'Strong';
    if (value >= 0.4) return 'Moderate';
    if (value >= 0.2) return 'Small';
    return 'Weak';
  }


  function measureDetails(kind) {
    if (kind === 'Pearson r') {
      return {
        title: 'Pearson r',
        use: 'Used when both variables are numeric.',
        simple: 'It checks whether two numbers tend to move together in a straight-line pattern. Positive values rise together; negative values move in opposite directions.',
        range: '-1 to +1. Values closer to -1 or +1 mean a stronger linear relationship. Values near 0 mean little straight-line relationship.',
        formula: 'r = Σ[(x−x̄)(y−ȳ)] / √(Σ(x−x̄)² Σ(y−ȳ)²)'
      };
    }

    if (kind === "Cramér's V") {
      return {
        title: "Cramér's V",
        use: 'Used when both variables are categories, such as plan type and churn status.',
        simple: 'It checks whether the mix of one set of categories changes depending on the other category.',
        range: '0 to 1. Values near 0 mean little association. Larger values mean the category pattern changes more strongly.',
        formula: 'V = √(χ² / (n × min(r−1, c−1)))'
      };
    }

    return {
      title: 'Eta²',
      use: 'Used when one variable is numeric and the other is a category.',
      simple: 'It estimates how much of the spread in the numeric values lines up with differences between the groups.',
      range: '0 to 1. For example, 0.20 means about 20% of the observed numeric variation is associated with group membership.',
      formula: 'η² = SS_between / SS_total'
    };
  }

  function measurePopoverHtml(kind) {
    const details = measureDetails(kind);
    return `
      <div class="measure-popover-head"><strong>${safe(details.title)}</strong><button type="button" class="measure-popover-close" aria-label="Close explanation">×</button></div>
      <p>${safe(details.use)}</p>
      <p>${safe(details.simple)}</p>
      <p><strong>How to read it:</strong> ${safe(details.range)}</p>
      <div class="equation">${safe(details.formula)}</div>
      <p class="measure-popover-note">This describes an association. It does not show that one variable causes the other.</p>
    `;
  }

  function positionMeasurePopover(button) {
    const popover = select('#measurePopover');
    const buttonBox = button.getBoundingClientRect();
    const margin = 10;
    const width = Math.min(360, window.innerWidth - margin * 2);

    popover.style.width = `${width}px`;
    popover.style.left = `${Math.min(Math.max(margin, buttonBox.right - width), window.innerWidth - width - margin)}px`;

    const popoverHeight = popover.offsetHeight;
    const spaceBelow = window.innerHeight - buttonBox.bottom;
    const top = spaceBelow >= popoverHeight + margin
      ? buttonBox.bottom + 8
      : Math.max(margin, buttonBox.top - popoverHeight - 8);

    popover.style.top = `${top}px`;
  }

  function showMeasurePopover(button, pinned) {
    const popover = select('#measurePopover');
    state.pinnedSchemaButton = null;
    popover.innerHTML = measurePopoverHtml(button.dataset.measureKind);
    popover.classList.remove('hidden');
    state.pinnedMeasureButton = pinned ? button : null;
    positionMeasurePopover(button);

    const closeButton = popover.querySelector('.measure-popover-close');
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      hideMeasurePopover();
    });
  }

  function toggleMeasurePopover(button) {
    if (state.pinnedMeasureButton === button && !select('#measurePopover').classList.contains('hidden')) {
      hideMeasurePopover();
      return;
    }
    showMeasurePopover(button, true);
  }

  function hideMeasurePopover(clearPinned = true) {
    const popover = select('#measurePopover');
    popover.classList.add('hidden');
    if (clearPinned) {
      state.pinnedMeasureButton = null;
    }
  }

  function measureTooltip(kind) {
    if (kind === 'Pearson r') {
      return 'Pearson r: strength and direction of a linear relationship. Formula: r = Σ[(x−x̄)(y−ȳ)] / √(Σ(x−x̄)² Σ(y−ȳ)²).';
    }

    if (kind === "Cramér's V") {
      return "Cramér's V: strength of association between two categorical variables. Formula: V = √(χ² / (n × min(r−1, c−1))).";
    }

    return 'Eta squared: share of numeric variation associated with category groups. Formula: η² = SS_between / SS_total.';
  }

  function schemaPopoverHtml(status) {
    return `
      <div class="measure-popover-head"><strong>${safe(status)}</strong><button type="button" class="measure-popover-close" aria-label="Close explanation">×</button></div>
      <p>${safe(schemaStatusHelp(status))}</p>
    `;
  }

  function showSchemaPopover(button, pinned) {
    const popover = select('#measurePopover');
    state.pinnedMeasureButton = null;
    popover.innerHTML = schemaPopoverHtml(button.dataset.schemaStatus);
    popover.classList.remove('hidden');
    state.pinnedSchemaButton = pinned ? button : null;
    positionMeasurePopover(button);

    const closeButton = popover.querySelector('.measure-popover-close');
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      hideSchemaPopover();
    });
  }

  function toggleSchemaPopover(button) {
    if (state.pinnedSchemaButton === button && !select('#measurePopover').classList.contains('hidden')) {
      hideSchemaPopover();
      return;
    }
    showSchemaPopover(button, true);
  }

  function hideSchemaPopover(clearPinned = true) {
    if (state.pinnedSchemaButton || !clearPinned) {
      select('#measurePopover').classList.add('hidden');
    }
    if (clearPinned) {
      state.pinnedSchemaButton = null;
    }
  }

  function renderTopRelationshipChart(relationship) {
    if (!relationship) {
      destroyChart('relationshipChart');
      select('#relationshipChartTitle').textContent = 'No relationship to chart';
      select('#relationshipExplanation').innerHTML = '<p>Select another focus variable or provide more usable fields.</p>';
      return;
    }

    select('#relationshipChartTitle').textContent = `${relationship.firstColumn} vs ${relationship.secondColumn}`;

    if (relationship.kind === 'Pearson r') {
      renderScatterRelationship(relationship, 'relationshipChart', true);
      return;
    }

    if (relationship.kind === 'Eta²') {
      renderEtaRelationship(relationship, 'relationshipChart');
      return;
    }

    renderCramersRelationship(relationship, 'relationshipChart');
  }

  function renderScatterRelationship(relationship, chartId, includeExplanation) {
    const points = state.rows
      .map((row) => ({
        x: toNumber(row[relationship.firstColumn]),
        y: toNumber(row[relationship.secondColumn])
      }))
      .filter((point) => point.x !== null && point.y !== null)
      .slice(0, 1500);

    const regression = linearRegression(points);
    const equation = regression
      ? `y = ${formatNumber(regression.slope, 3)}x ${regression.intercept >= 0 ? '+' : '−'} ${formatNumber(Math.abs(regression.intercept), 3)}`
      : 'No fitted line available';

    const datasets = [{
      label: `${relationship.firstColumn} vs ${relationship.secondColumn}`,
      data: points,
      pointRadius: 3,
      pointHoverRadius: 5
    }];

    if (regression) {
      datasets.push({
        type: 'line',
        label: 'Line of best fit',
        data: regression.line,
        pointRadius: 0,
        borderWidth: 2,
        tension: 0,
        fill: false
      });
    }

    createChart(chartId, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 100,
        scales: {
          x: { title: { display: true, text: relationship.firstColumn } },
          y: { title: { display: true, text: relationship.secondColumn } }
        },
        plugins: {
          legend: { display: Boolean(regression), position: 'bottom' },
          tooltip: {
            callbacks: {
              footer: () => regression
                ? [`Best fit: ${equation}`, `R² = ${formatNumber(regression.rSquared, 3)}`]
                : []
            }
          }
        }
      }
    });

    if (includeExplanation) {
      const direction = relationship.value >= 0 ? 'rise together' : 'move in opposite directions';
      const rSquaredText = regression
        ? ` The fitted straight line has R² = ${formatNumber(regression.rSquared, 2)}, meaning it describes about ${formatPercent(regression.rSquared * 100)} of the variation in the plotted y-values.`
        : '';

      select('#relationshipExplanation').innerHTML = `
        <p><strong>Pearson r = ${formatNumber(relationship.value, 2)}</strong>. Pearson r runs from -1 to +1 and describes a straight-line relationship. Values near 0 mean little linear relationship; values nearer -1 or +1 mean a stronger one.${rSquaredText}</p>
        <div class="plain-language"><strong>In simpler terms</strong>${safe(relationship.firstColumn)} and ${safe(relationship.secondColumn)} tend to ${direction}. The dots still matter: a line can hide clusters, curves or unusual points.</div>
        <span class="equation" title="Hover over the chart to see this equation too">Best-fit line: ${safe(equation)}</span>
        <p>This is association, not proof that one variable causes the other.</p>
      `;
    }
  }

  function renderEtaRelationship(relationship, chartId) {
    const firstProfile = state.profiles.find((profile) => profile.name === relationship.firstColumn);
    const numericName = firstProfile.role === 'numeric' ? relationship.firstColumn : relationship.secondColumn;
    const categoryName = firstProfile.role === 'numeric' ? relationship.secondColumn : relationship.firstColumn;
    const groups = {};

    state.rows.forEach((row) => {
      const numericValue = toNumber(row[numericName]);
      if (numericValue === null || isMissing(row[categoryName])) {
        return;
      }

      const category = String(row[categoryName]);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(numericValue);
    });

    const rankedGroups = Object.entries(groups)
      .map(([category, values]) => ({
        category,
        average: mean(values),
        n: values.length
      }))
      .sort((left, right) => right.n - left.n)
      .slice(0, 12);

    createChart(chartId, {
      type: 'bar',
      data: {
        labels: rankedGroups.map((group) => group.category),
        datasets: [{
          label: `Average ${numericName}`,
          data: rankedGroups.map((group) => group.average)
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 100,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: (context) => `n = ${rankedGroups[context.dataIndex].n}`
            }
          }
        }
      }
    });

    if (chartId === 'relationshipChart') {
      select('#relationshipExplanation').innerHTML = `
        <p><strong>Eta² = ${formatNumber(relationship.value, 2)}</strong>. Eta² is the share of variation in a numeric field that lines up with membership of the category groups.</p>
        <div class="plain-language"><strong>In simpler terms</strong>The groups differ by a noticeable amount if the bars are separated. Here, group membership is associated with about ${formatPercent(relationship.value * 100)} of the numeric variation.</div>
        <span class="equation">η² = SS_between / SS_total</span>
        <p>This does not show that the category causes the difference. Group sizes, spread and other variables still need checking.</p>
      `;
    }
  }

  function renderCramersRelationship(relationship, chartId) {
    const firstProfile = state.profiles.find((profile) => profile.name === relationship.firstColumn);
    const secondProfile = state.profiles.find((profile) => profile.name === relationship.secondColumn);
    const rowField = firstProfile.unique <= secondProfile.unique
      ? relationship.firstColumn
      : relationship.secondColumn;
    const columnField = firstProfile.unique <= secondProfile.unique
      ? relationship.secondColumn
      : relationship.firstColumn;
    const rowProfile = firstProfile.name === rowField ? firstProfile : secondProfile;
    const columnProfile = firstProfile.name === columnField ? firstProfile : secondProfile;

    const rowLevels = Object.entries(rowProfile.counts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([level]) => level);

    const columnLevels = Object.entries(columnProfile.counts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([level]) => level);

    const datasets = columnLevels.map((columnLevel) => ({
      label: columnLevel,
      data: rowLevels.map((rowLevel) =>
        state.rows.filter((row) =>
          String(row[rowField]) === rowLevel && String(row[columnField]) === columnLevel
        ).length
      )
    }));

    createChart(chartId, {
      type: 'bar',
      data: {
        labels: rowLevels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 100,
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true }
        },
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });

    if (chartId === 'relationshipChart') {
      select('#relationshipExplanation').innerHTML = `
        <p><strong>Cramér's V = ${formatNumber(relationship.value, 2)}</strong>. Cramér's V runs from 0 to 1 and shows how strongly two category fields are associated.</p>
        <div class="plain-language"><strong>In simpler terms</strong>If the category mix changes a lot from one bar to another, the two fields are related. A value near 0 means little association; a value nearer 1 means a stronger pattern.</div>
        <span class="equation">V = √(χ² / (n × min(r−1, c−1)))</span>
        <p>Rare categories or very small cells can make this unstable, and association is not causation.</p>
      `;
    }
  }


  function renderSuggestions() {
    const profiles = state.profiles;
    const numericProfiles = profiles.filter((profile) => profile.role === 'numeric' && !profile.likelyId);
    const categoryProfiles = profiles.filter(isCategory);
    const dateProfiles = profiles.filter((profile) => profile.role === 'date');
    const suggestions = [];

    suggestions.push(buildQualitySuggestion());

    if (state.focus) {
      const focusProfile = profiles.find((profile) => profile.name === state.focus);
      if (focusProfile) {
        suggestions.push(buildFocusSuggestion(focusProfile));
      }
    }

    const topPearson = state.relationships.find((relationship) => relationship.kind === 'Pearson r');
    if (topPearson) {
      suggestions.push({
        priority: 'Chart',
        title: `Scatterplot: ${topPearson.firstColumn} vs ${topPearson.secondColumn}`,
        text: `This is the clearest numeric-to-numeric pattern found so far (Pearson r = ${formatNumber(topPearson.value, 2)}).`,
        bullets: [
          'Use the dots to check whether the relationship is really straight rather than curved',
          'Look for clusters and isolated points before trusting the fitted line',
          'Use the line of best fit as a summary, not as proof of cause and effect'
        ]
      });
    } else if (numericProfiles.length >= 2) {
      suggestions.push({
        priority: 'Check',
        title: 'Try numeric scatterplots',
        text: `${numericProfiles.length} numeric fields are available, but no especially strong linear pair was detected.`,
        bullets: [
          'Plot plausible pairs even when Pearson r is small, because curves can have low correlation',
          'Check axes and units before comparing variables',
          'Do not remove unusual points without a data-quality reason'
        ]
      });
    }

    const topEta = state.relationships.find((relationship) => relationship.kind === 'Eta²');
    if (topEta) {
      suggestions.push({
        priority: 'Chart',
        title: `Compare groups: ${topEta.firstColumn} and ${topEta.secondColumn}`,
        text: `The strongest numeric-by-category pattern has Eta² = ${formatNumber(topEta.value, 2)}.`,
        bullets: [
          'Compare group sizes as well as their averages',
          'Check medians and spread if the numeric field is skewed',
          'A boxplot would be a useful next chart outside this browser report'
        ]
      });
    }

    const topCramers = state.relationships.find((relationship) => relationship.kind === "Cramér's V");
    if (topCramers) {
      suggestions.push({
        priority: 'Chart',
        title: `Category comparison: ${topCramers.firstColumn} and ${topCramers.secondColumn}`,
        text: `These category fields have Cramér's V = ${formatNumber(topCramers.value, 2)}.`,
        bullets: [
          'Use counts and percentages together so small groups are not misleading',
          'Check whether rare categories should stay separate',
          'A 100% stacked bar chart is useful when the goal is comparing proportions'
        ]
      });
    }

    if (dateProfiles.length) {
      suggestions.push({
        priority: 'Time check',
        title: 'Add a time dimension',
        text: `${dateProfiles.length} date-like field${dateProfiles.length === 1 ? ' was' : 's were'} detected. Ordering records by time can reveal patterns that a cross-sectional summary misses.`,
        bullets: [
          'Aggregate counts or numeric outcomes by week or month',
          'Look for trend, seasonality and abrupt changes',
          'When predicting the future, split training and test data by time rather than randomly'
        ]
      });
    }

    if (categoryProfiles.length >= 2 && !topCramers) {
      suggestions.push({
        priority: 'Check',
        title: 'Compare category rates',
        text: `${categoryProfiles.length} categorical or binary fields can be explored with contingency tables.`,
        bullets: [
          'Show the raw count beside each percentage',
          'Treat tiny groups cautiously',
          'Use chi-square or Cramér’s V only when the table has enough observations'
        ]
      });
    }

    suggestions.push({
      priority: 'Before modelling',
      title: 'Define the decision first',
      text: 'A model is only useful when the outcome, prediction point and cost of mistakes are clear.',
      bullets: [
        'Choose a target only if it represents a real decision or outcome',
        'Separate prediction from explanation',
        'Keep identifiers and information created after the outcome out of predictors',
        'Use a holdout strategy that resembles real use'
      ]
    });

    select('#suggestionGrid').innerHTML = suggestions
      .map(renderSuggestion)
      .join('');

    renderSuggestedVisuals();
  }

  function buildQualitySuggestion() {
    const importantIssues = state.issues.filter((issue) => ['high', 'medium'].includes(issue.severity));

    return {
      priority: 'Review first',
      title: 'Resolve high-impact quality warnings',
      text: importantIssues.length
        ? 'Some issues could change the answer you get from later analysis.'
        : 'The basic audit is clean, so the next checks are about meaning, collection quality and analytical assumptions.',
      bullets: importantIssues.length
        ? importantIssues.slice(0, 4).map((issue) => `${issue.column ? `${issue.column}: ` : ''}${issue.title}`)
        : [
          'Confirm units and category meanings against the source system',
          'Check whether missing values have a meaningful reason',
          'Make sure dates and outcomes refer to the intended time period'
        ]
    };
  }

  function buildFocusSuggestion(profile) {
    if (profile.role === 'numeric') {
      return {
        priority: 'Focus variable',
        title: `Understand variation in ${profile.name}`,
        text: 'Treat this as a numeric outcome and compare it with plausible numeric and category fields.',
        bullets: [
          'Start with scatterplots for numeric predictors',
          'Compare distributions across meaningful groups',
          'Check skew and unusual points before using methods based on means',
          'Only move to regression when the question and assumptions make sense'
        ]
      };
    }

    if (isCategory(profile)) {
      return {
        priority: 'Focus variable',
        title: `Understand differences in ${profile.name}`,
        text: 'Treat this as a category outcome and compare rates or distributions across plausible predictors.',
        bullets: [
          'Cross-tabulate against other category fields',
          'Compare numeric distributions between groups',
          'Check small group counts before interpreting percentages',
          'For a genuinely binary outcome, logistic regression may be useful later'
        ]
      };
    }

    return {
      priority: 'Focus variable',
      title: `Review ${profile.name}`,
      text: 'This field is not currently suited to the automatic pairwise methods used here.',
      bullets: [
        'Check whether the field should be recoded',
        'Confirm its intended meaning and unit',
        'Consider a domain-specific analysis rather than forcing a generic test'
      ]
    };
  }

  function renderSuggestion(suggestion) {
    const bullets = suggestion.bullets?.length
      ? `<ul>${suggestion.bullets.map((item) => `<li>${safe(item)}</li>`).join('')}</ul>`
      : '';

    return `<article class="suggestion">
      <div class="suggestion-head">
        <h3>${safe(suggestion.title)}</h3>
        <span class="priority">${safe(suggestion.priority)}</span>
      </div>
      <p>${safe(suggestion.text)}</p>
      ${bullets}
    </article>`;
  }

  function renderSuggestedVisuals() {
    ['nextVisual0', 'nextVisual1', 'nextVisual2'].forEach(destroyChart);

    const visuals = [];
    const topPearson = state.relationships.find((relationship) => relationship.kind === 'Pearson r');
    const topEta = state.relationships.find((relationship) => relationship.kind === 'Eta²');
    const topCramers = state.relationships.find((relationship) => relationship.kind === "Cramér's V");

    if (topPearson) {
      visuals.push({
        kind: 'scatter',
        relationship: topPearson,
        title: `Scatterplot: ${topPearson.firstColumn} vs ${topPearson.secondColumn}`,
        text: 'Best for checking the shape, direction, clusters and unusual points behind a numeric relationship.'
      });
    }

    if (topEta) {
      visuals.push({
        kind: 'eta',
        relationship: topEta,
        title: `Group means: ${topEta.firstColumn} and ${topEta.secondColumn}`,
        text: 'Useful as a quick comparison, but follow it with group spread and sample-size checks.'
      });
    }

    if (topCramers) {
      visuals.push({
        kind: 'cramers',
        relationship: topCramers,
        title: `Category mix: ${topCramers.firstColumn} and ${topCramers.secondColumn}`,
        text: 'Useful for seeing whether the mix of one category changes across levels of another.'
      });
    }

    if (!visuals.length) {
      select('#suggestedVisuals').innerHTML = '';
      return;
    }

    select('#suggestedVisuals').innerHTML = `
      <h3>Recommended visual checks</h3>
      <p>These are generated from the strongest usable patterns in this dataset. They are starting points, not automatic conclusions.</p>
      <div class="visual-grid">
        ${visuals.slice(0, 3).map((visual, index) => `
          <article class="visual-card">
            <h4>${safe(visual.title)}</h4>
            <p>${safe(visual.text)}</p>
            <div class="chart-shell"><canvas id="nextVisual${index}"></canvas></div>
          </article>
        `).join('')}
      </div>
    `;

    visuals.slice(0, 3).forEach((visual, index) => {
      const chartId = `nextVisual${index}`;
      if (visual.kind === 'scatter') {
        renderScatterRelationship(visual.relationship, chartId, false);
      } else if (visual.kind === 'eta') {
        renderEtaRelationship(visual.relationship, chartId);
      } else {
        renderCramersRelationship(visual.relationship, chartId);
      }
    });
  }

  function normaliseColumnName(name) {
    return String(name).trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  function resetSchemaComparison() {
    if (!select('#compareEmpty') || !select('#compareResults')) {
      return;
    }

    select('#compareEmpty').classList.remove('hidden');
    select('#compareResults').classList.add('hidden');
    select('#compareSummary').innerHTML = '';
    select('#schemaFindings').innerHTML = '';
    select('#schemaTable tbody').innerHTML = '';
  }

  function buildSchemaComparison() {
    if (!state.comparison) {
      return null;
    }

    const currentByName = new Map(state.profiles.map((profile) => [profile.name, profile]));
    const comparisonByName = new Map(state.comparison.profiles.map((profile) => [profile.name, profile]));
    const currentNormalised = new Map(state.profiles.map((profile) => [normaliseColumnName(profile.name), profile]));
    const comparisonNormalised = new Map(state.comparison.profiles.map((profile) => [normaliseColumnName(profile.name), profile]));
    const rows = [];
    const usedComparison = new Set();

    state.profiles.forEach((current) => {
      let comparison = comparisonByName.get(current.name);
      let status = 'Unchanged';
      let displayName = current.name;

      if (!comparison) {
        const normalisedMatch = comparisonNormalised.get(normaliseColumnName(current.name));
        if (normalisedMatch && !usedComparison.has(normalisedMatch.name)) {
          comparison = normalisedMatch;
          status = 'Name changed';
          displayName = `${current.name} → ${comparison.name}`;
        }
      }

      if (!comparison) {
        status = 'Removed';
        rows.push({ current, comparison: null, status, displayName });
        return;
      }

      usedComparison.add(comparison.name);
      const typeChanged = current.role !== comparison.role;
      const currentFormat = current.expectedFormat?.kind || 'not-inferred';
      const comparisonFormat = comparison.expectedFormat?.kind || 'not-inferred';
      const formatChanged = currentFormat !== comparisonFormat;
      const missingChange = comparison.missingPct - current.missingPct;

      if (status !== 'Name changed') {
        if (typeChanged) {
          status = 'Type changed';
        } else if (formatChanged) {
          status = 'Format changed';
        } else if (Math.abs(missingChange) >= 5) {
          status = 'Missingness changed';
        }
      }

      rows.push({ current, comparison, status, displayName, missingChange, typeChanged, formatChanged });
    });

    state.comparison.profiles.forEach((comparison) => {
      if (usedComparison.has(comparison.name) || currentByName.has(comparison.name)) {
        return;
      }

      const normalisedCurrent = currentNormalised.get(normaliseColumnName(comparison.name));
      if (normalisedCurrent) {
        return;
      }

      rows.push({ current: null, comparison, status: 'Added', displayName: comparison.name });
    });

    return rows;
  }

  function renderSchemaComparison() {
    const comparisonRows = buildSchemaComparison();
    if (!comparisonRows) {
      resetSchemaComparison();
      return;
    }

    select('#compareEmpty').classList.add('hidden');
    select('#compareResults').classList.remove('hidden');

    const changedRows = comparisonRows.filter((row) => row.status !== 'Unchanged');
    const added = comparisonRows.filter((row) => row.status === 'Added').length;
    const removed = comparisonRows.filter((row) => row.status === 'Removed').length;
    const structuralChanges = comparisonRows.filter((row) => ['Type changed', 'Format changed', 'Name changed'].includes(row.status)).length;
    const rowDelta = state.comparison.rows.length - state.rows.length;

    const summary = [
      ['Comparison file', state.comparison.name, `${formatNumber(state.comparison.rows.length, 0)} rows`],
      ['Schema changes', changedRows.length, changedRows.length ? 'review before reusing analysis' : 'no material changes detected'],
      ['Columns added', added, added ? 'new fields detected' : 'none'],
      ['Columns removed', removed, removed ? 'fields no longer present' : 'none']
    ];

    select('#compareSummary').innerHTML = summary
      .map(([label, value, note]) => `<div class="summary-card"><span>${safe(label)}</span><strong>${safe(value)}</strong><small>${safe(note)}</small></div>`)
      .join('');

    const findings = [];
    findings.push({
      title: `${state.name} compared with ${state.comparison.name}`,
      text: `Row count changed by ${rowDelta >= 0 ? '+' : ''}${formatNumber(rowDelta, 0)} and column count changed by ${state.comparison.columns.length - state.columns.length >= 0 ? '+' : ''}${state.comparison.columns.length - state.columns.length}.`,
      icon: '↔'
    });

    if (!changedRows.length) {
      findings.push({
        title: 'No material schema drift detected',
        text: 'Column names, detected types, inferred formats and missingness are broadly consistent with the current dataset.',
        icon: '✓'
      });
    } else {
      if (structuralChanges) {
        findings.push({
          title: `${structuralChanges} structural change${structuralChanges === 1 ? '' : 's'}`,
          text: 'Type, format or naming changes can break joins, transformations or downstream analysis and should be checked first.',
          icon: '!'
        });
      }
      const missingChanges = comparisonRows.filter((row) => row.status === 'Missingness changed');
      if (missingChanges.length) {
        findings.push({
          title: `${missingChanges.length} missingness change${missingChanges.length === 1 ? '' : 's'}`,
          text: 'A change of at least 5 percentage points in missing values was detected. This can signal a collection or extraction change.',
          icon: '△'
        });
      }
    }

    select('#schemaFindings').innerHTML = findings
      .map((finding) => `<div class="finding"><span class="finding-icon">${safe(finding.icon)}</span><div><strong>${safe(finding.title)}</strong><p>${safe(finding.text)}</p></div></div>`)
      .join('');

    select('#schemaTable tbody').innerHTML = comparisonRows
      .map((row) => {
        const currentFormat = row.current?.expectedFormat?.label || '-';
        const comparisonFormat = row.comparison?.expectedFormat?.label || '-';
        const missingChange = row.current && row.comparison
          ? `${row.missingChange >= 0 ? '+' : ''}${formatNumber(row.missingChange, 1)} pp`
          : '-';

        return `<tr>
          <td><strong>${safe(row.displayName)}</strong></td>
          <td><button class="schema-status schema-help ${safe(row.status.toLowerCase().replace(/\s+/g, '-'))}" type="button" data-schema-status="${safe(row.status)}" aria-label="Explain ${safe(row.status)}">${safe(row.status)} · explain</button></td>
          <td>${safe(row.current ? typeLabel(row.current.role) : '-')}</td>
          <td>${safe(row.comparison ? typeLabel(row.comparison.role) : '-')}</td>
          <td>${safe(currentFormat)}</td>
          <td>${safe(comparisonFormat)}</td>
          <td>${safe(missingChange)}</td>
        </tr>`;
      })
      .join('');
  }

  function schemaStatusHelp(status) {
    if (status === 'Added') return 'This column exists in the comparison file but not in the current dataset.';
    if (status === 'Removed') return 'This column exists in the current dataset but not in the comparison file.';
    if (status === 'Type changed') return 'The column exists in both files, but its detected data type changed.';
    if (status === 'Format changed') return 'The column exists in both files, but its inferred value format changed.';
    if (status === 'Missingness changed') return 'The column exists in both files, but the share of missing values changed by at least 5 percentage points.';
    return 'No material schema change was detected for this column.';
  }

  function renderPreview() {
    const columns = state.columns.slice(0, 40);
    const rows = state.rows.slice(0, 50);

    select('#dataTable thead').innerHTML = `<tr>${columns.map((column) => `<th>${safe(column)}</th>`).join('')}</tr>`;

    select('#dataTable tbody').innerHTML = rows
      .map((row) => `<tr>${columns.map((column) => {
        const value = isMissing(row[column]) ? '' : String(row[column]).slice(0, 120);
        return `<td>${safe(value)}</td>`;
      }).join('')}</tr>`)
      .join('');

    select('#previewNote').textContent = `Showing the first ${Math.min(50, state.rows.length)} of ${formatNumber(state.rows.length, 0)} rows and first ${Math.min(40, state.columns.length)} of ${state.columns.length} columns.`;
  }

  function switchTab(name) {
    selectAll('.tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === name);
    });

    selectAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab-${name}`);
    });

    requestAnimationFrame(() => {
      Object.values(state.charts).forEach((chart) => chart?.resize());
    });

    window.scrollTo({
      top: Math.max(0, select('#workspace').offsetTop - 70),
      behavior: 'smooth'
    });
  }

  function createChart(id, config) {
    destroyChart(id);

    const canvas = select(`#${id}`);
    if (!canvas) {
      return;
    }

    config.options = config.options || {};
    config.options.color = getComputedStyle(document.documentElement)
      .getPropertyValue('--muted')
      .trim();

    state.charts[id] = new Chart(canvas, config);
  }

  function destroyChart(id) {
    if (state.charts[id]) {
      state.charts[id].destroy();
      delete state.charts[id];
    }
  }

  function titleCase(value) {
    return String(value)
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function typeLabel(role) {
    const labels = {
      numeric: 'Numeric',
      date: 'Date',
      binary: 'Two-value category',
      categorical: 'Category',
      identifier: 'Identifier',
      text: 'Text',
      empty: 'Empty'
    };

    return labels[role] || titleCase(role);
  }

  function showLoading(title, text) {
    select('#loadingTitle').textContent = title;
    select('#loadingText').textContent = text;
    select('#loadingOverlay').classList.remove('hidden');
  }

  function hideLoading() {
    select('#loadingOverlay').classList.add('hidden');
  }

  function exportReport() {
    if (!state.rows.length) {
      return;
    }

    const score = qualityScore();
    const topRelationships = state.relationships.slice(0, 12);
    const generatedAt = new Date().toLocaleString();

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Data Triage audit report - ${safe(state.name)}</title>
<style>
body{font:14px/1.55 Arial,sans-serif;color:#222;max-width:980px;margin:40px auto;padding:0 24px}
h1{font-size:32px;margin-bottom:4px}h2{margin-top:34px;border-bottom:1px solid #ddd;padding-bottom:6px}.muted{color:#666}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{border:1px solid #ddd;border-radius:10px;padding:14px}.card strong{display:block;font-size:24px}
.issue{padding:9px 11px;border-left:4px solid #888;background:#f6f6f6;margin:8px 0}.high{border-color:#b74255}.medium{border-color:#b57919}.low{border-color:#486fbd}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:8px;border:1px solid #ddd;text-align:left}th{background:#f5f5f5}
@media print{body{margin:0}.no-print{display:none}}
</style>
</head>
<body>
<h1>Data Triage audit report</h1>
<p class="muted">${safe(state.name)} · generated ${safe(generatedAt)} · browser-only analysis</p>
<div class="cards">
<div class="card">Rows<strong>${formatNumber(state.rows.length, 0)}</strong></div>
<div class="card">Columns<strong>${state.columns.length}</strong></div>
<div class="card">Check score<strong>${score}/100</strong></div>
<div class="card">Warnings<strong>${state.issues.length}</strong></div>
</div>
<h2>Data-quality warnings</h2>
${state.issues.length
  ? state.issues.map((issue) => `<div class="issue ${issue.severity}"><strong>${issue.column ? `${safe(issue.column)} · ` : ''}${safe(issue.title)}</strong><br>${safe(issue.detail || issue.description)}</div>`).join('')
  : '<p>No rule-based warnings detected.</p>'}
<h2>Ranked relationships</h2>
${topRelationships.length
  ? `<table><thead><tr><th>Variables</th><th>Measure</th><th>Value</th><th>Rows</th></tr></thead><tbody>${topRelationships.map((relationship) => `<tr><td>${safe(relationship.firstColumn)} ↔ ${safe(relationship.secondColumn)}</td><td>${safe(relationship.kind)}</td><td>${formatNumber(relationship.value, 3)}</td><td>${relationship.n}</td></tr>`).join('')}</tbody></table>`
  : '<p>No suitable pairwise relationships detected.</p>'}
<h2>Column profile</h2>
<table><thead><tr><th>Column</th><th>Detected type</th><th>Expected format</th><th>Format match</th><th>Missing</th><th>Distinct values</th><th>Mean / top value</th></tr></thead>
<tbody>${state.profiles.map((profile) => `<tr><td>${safe(profile.name)}</td><td>${safe(typeLabel(profile.role))}</td><td>${safe(profile.expectedFormat?.label || 'Not inferred')}</td><td>${profile.expectedFormat?.matchPct == null ? '-' : formatPercent(profile.expectedFormat.matchPct)}</td><td>${formatPercent(profile.missingPct)}</td><td>${profile.unique}</td><td>${profile.role === 'numeric' ? formatNumber(profile.mean, 3) : safe(profile.top ?? '-')}</td></tr>`).join('')}</tbody></table>
${state.comparison ? `
<h2>Schema comparison</h2>
<p><strong>Compared with:</strong> ${safe(state.comparison.name)} · ${formatNumber(state.comparison.rows.length, 0)} rows · ${state.comparison.columns.length} columns</p>
<table><thead><tr><th>Column</th><th>Status</th><th>Current type</th><th>Comparison type</th><th>Current format</th><th>Comparison format</th><th>Missing change</th></tr></thead><tbody>${(buildSchemaComparison() || []).map((row) => `<tr><td>${safe(row.displayName)}</td><td>${safe(row.status)}</td><td>${safe(row.current ? typeLabel(row.current.role) : '-')}</td><td>${safe(row.comparison ? typeLabel(row.comparison.role) : '-')}</td><td>${safe(row.current?.expectedFormat?.label || '-')}</td><td>${safe(row.comparison?.expectedFormat?.label || '-')}</td><td>${row.current && row.comparison ? `${row.missingChange >= 0 ? '+' : ''}${formatNumber(row.missingChange, 1)} pp` : '-'}</td></tr>`).join('')}</tbody></table>
` : ''}
<h2>Suggested next checks</h2>
<ul>
<li>${state.issues.some((issue) => ['high', 'medium'].includes(issue.severity)) ? 'Resolve high- and medium-priority data-quality warnings before modelling or reporting.' : 'Confirm units, category meanings and business rules against the source system.'}</li>
${state.relationships.find((relationship) => relationship.kind === 'Pearson r') ? `<li>Inspect the strongest numeric relationship with a scatterplot and line of best fit, checking for curvature, clusters and unusual points.</li>` : ''}
${state.profiles.some((profile) => profile.role === 'date') ? '<li>Use detected date fields to check trends, seasonality and changes over time.</li>' : ''}
<li>Validate any inferred expected formats against a data dictionary or source-system specification before treating them as hard rules.</li>
</ul>
<h2>Interpretation note</h2>
<p>This report summarises automated data-quality and exploratory checks. Relationships are descriptive, not causal. Confirm source-system rules, collection methods, missing-data behaviour and the intended use before making decisions.</p>
<p class="no-print"><button onclick="window.print()">Print / save as PDF</button></p>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const reportName = state.name
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase() || 'report';

    link.href = url;
    link.download = `data-triage-audit-${reportName}.html`;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function makeSampleComparisonData() {
    const rows = makeSampleData().slice(0, 145).map((row, index) => {
      const comparisonRow = { ...row };

      comparisonRow.plan_type = comparisonRow.plan;
      delete comparisonRow.plan;
      comparisonRow.country = 'UK';

      if (index % 9 === 0) {
        comparisonRow.monthly_spend = null;
      }

      if (index % 17 === 0) {
        comparisonRow.support_tickets = index % 34 === 0 ? 'none' : 'several';
      }

      delete comparisonRow.marketing_opt_in;
      return comparisonRow;
    });

    return rows;
  }

  function makeSampleData() {
    let seed = 74123;
    const plans = ['Monthly', 'Quarterly', 'Annual'];
    const regions = ['South', 'North', 'East', 'West'];
    const rows = [];

    function random() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }

    function pick(values) {
      return values[Math.floor(random() * values.length)];
    }

    for (let index = 1; index <= 160; index += 1) {
      const age = Math.round(20 + random() * 48);
      const plan = random() < 0.46 ? 'Monthly' : pick(plans);
      const region = pick(regions);
      const supportTickets = Math.max(0, Math.round(random() * 5 + (plan === 'Monthly' ? 0.8 : 0)));
      const satisfaction = Math.max(1, Math.min(10, Math.round(9 - supportTickets * 0.9 + random() * 2 - 1)));
      const monthlySpend = Math.round((42 + random() * 48 + (plan === 'Monthly' ? 10 : 0)) * 10) / 10;
      const churnChance = 0.06 +
        (plan === 'Monthly' ? 0.22 : 0) +
        (supportTickets >= 4 ? 0.18 : 0) +
        (satisfaction <= 4 ? 0.2 : 0) +
        (monthlySpend > 85 ? 0.08 : 0);
      const churned = random() < churnChance ? 'Yes' : 'No';
      const signupYear = 2021 + Math.floor(random() * 5);
      const signupMonth = 1 + Math.floor(random() * 12);
      const signupDay = 1 + Math.floor(random() * 27);
      const signupDate = `${signupYear}-${String(signupMonth).padStart(2, '0')}-${String(signupDay).padStart(2, '0')}`;

      rows.push({
        customer_id: `C${String(index).padStart(4, '0')}`,
        age,
        plan,
        region,
        monthly_spend: index % 47 === 0 ? null : monthlySpend,
        support_tickets: supportTickets,
        satisfaction,
        churned,
        signup_date: signupDate,
        email: `customer${index}@example.com`,
        marketing_opt_in: random() < 0.58 ? 'Yes' : 'No',
        days_since_login: Math.round(random() * 55 + (churned === 'Yes' ? 15 : 0))
      });
    }

    rows[11].email = 'customer12.example.com';
    rows[89].age = 143;
    rows[112].satisfaction = 12;
    rows[126].monthly_spend = 410.5;
    rows[145].customer_id = rows[144].customer_id;

    return rows;
  }

  init();
})();
