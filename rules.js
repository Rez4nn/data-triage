window.DATA_TRIAGE_RULES = [
  {
    id: 'empty-dataset',
    severity: 'high',
    scope: 'dataset',
    title: 'No usable rows',
    description: 'The file contains no non-empty records that can be analysed.'
  },
  {
    id: 'duplicate-rows',
    severity: 'medium',
    scope: 'dataset',
    title: 'Duplicate rows',
    description: 'Exact duplicate records may inflate counts or summary statistics.'
  },
  {
    id: 'duplicate-id',
    severity: 'high',
    scope: 'column',
    title: 'Repeated identifier values',
    description: 'A field that appears to identify records contains repeated non-missing values.'
  },
  {
    id: 'high-missing',
    severity: 'high',
    scope: 'column',
    title: 'Very high missingness',
    description: 'Most values are missing, so this field may be unreliable for analysis.'
  },
  {
    id: 'moderate-missing',
    severity: 'medium',
    scope: 'column',
    title: 'Missing values need review',
    description: 'The amount of missing data is large enough to require an explicit handling decision.'
  },
  {
    id: 'constant',
    severity: 'medium',
    scope: 'column',
    title: 'No variation',
    description: 'Every observed value is the same.'
  },
  {
    id: 'near-constant',
    severity: 'low',
    scope: 'column',
    title: 'Very little variation',
    description: 'One value accounts for almost all observations.'
  },
  {
    id: 'id-like',
    severity: 'low',
    scope: 'column',
    title: 'Likely identifier',
    description: 'The field is almost entirely unique and is unlikely to be useful as an explanatory variable.'
  },
  {
    id: 'high-cardinality',
    severity: 'low',
    scope: 'column',
    title: 'Many category values',
    description: 'This categorical field has many distinct levels and may need grouping before comparison.'
  },
  {
    id: 'mixed-type',
    severity: 'medium',
    scope: 'column',
    title: 'Mixed value types',
    description: 'The field contains a mixture of numeric and text-like values.'
  },
  {
    id: 'numeric-text',
    severity: 'medium',
    scope: 'column',
    title: 'Numeric values stored as text',
    description: 'Many values look numeric but are represented as text.'
  },
  {
    id: 'date-text',
    severity: 'low',
    scope: 'column',
    title: 'Date values stored as text',
    description: 'Many values resemble dates but were not consistently parsed as dates.'
  },
  {
    id: 'format-mismatch-high',
    severity: 'high',
    scope: 'column',
    title: 'Many values do not match the inferred format',
    description: 'A large share of values use a different format from the one inferred for this field.'
  },
  {
    id: 'format-mismatch',
    severity: 'medium',
    scope: 'column',
    title: 'Some values use a different format',
    description: 'Some values differ from the format inferred for this field.'
  },
  {
    id: 'mixed-date-format',
    severity: 'medium',
    scope: 'column',
    title: 'Mixed date formats',
    description: 'Multiple date-writing conventions appear in the same field, which can create ambiguous parsing.'
  },
  {
    id: 'invalid-date-value',
    severity: 'medium',
    scope: 'column',
    title: 'Invalid calendar date',
    description: 'A value has a date-like shape but does not represent a real calendar date.'
  },
  {
    id: 'invalid-range-percent',
    severity: 'medium',
    scope: 'column',
    title: 'Percentage outside expected range',
    description: 'A percentage-like field contains values outside the usual 0 to 100 range.'
  },
  {
    id: 'expected-range',
    severity: 'medium',
    scope: 'column',
    title: 'Value outside the inferred range',
    description: 'At least one numeric value falls outside a range suggested by the column name.'
  },
  {
    id: 'extreme-outliers',
    severity: 'medium',
    scope: 'column',
    title: 'Potential extreme outliers',
    description: 'Values beyond 3 x IQR were detected. They may be valid but should be checked.'
  },
  {
    id: 'skewed',
    severity: 'low',
    scope: 'column',
    title: 'Strongly skewed numeric field',
    description: 'The distribution is highly asymmetric, which can affect averages and some statistical methods.'
  },
  {
    id: 'rare-levels',
    severity: 'low',
    scope: 'column',
    title: 'Rare categories',
    description: 'Some categories have very few observations, so percentages or averages may be unstable.'
  },
  {
    id: 'possible-boolean',
    severity: 'low',
    scope: 'column',
    title: 'Two-value field',
    description: 'This field has two observed values and may represent a yes/no flag, event or target.'
  },
  {
    id: 'suspicious-name',
    severity: 'low',
    scope: 'column',
    title: 'Check how this field should be handled',
    description: 'The column name suggests this may be sensitive data, an outcome, an identifier or a possible leakage field.'
  }
];
