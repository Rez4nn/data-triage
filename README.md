# Data Triage
Site: [https://data-triage.netlify.app/](https://data-triage.netlify.app/)
Built by Reuben.

I made Data Triage to speed up the part of analysis that usually comes first: opening an unfamiliar file, working out what is in it, checking whether anything looks wrong, and deciding what is worth looking at next.

It is a static browser app, so the source dataset does not need a backend. Files are parsed and analysed in the current browser session and are not uploaded to Netlify or written to local storage.

## What it does

Data Triage can:

- open CSV, TSV, PSV, TXT, JSON, JSONL, NDJSON, XLSX, XLS, XLSB and ODS files
- profile rows, columns, missing values and distinct values
- detect likely numeric, categorical, binary, date, text and identifier fields
- flag duplicate rows and repeated values in likely identifier columns
- flag constant and near-constant fields
- check mixed numeric/text values
- inspect category cardinality and very small category groups
- flag possible extreme values using a 3 x IQR boundary
- report strong skew in numeric columns
- infer likely formats from column names and observed values
- validate dates, email addresses, URLs, UK postcodes, phone numbers, UUIDs, times, percentages, currency values, integers and decimals
- check a few strongly implied ranges such as age, ratings, latitude and longitude
- rank numeric and categorical relationships
- draw scatterplots with a least-squares line of best fit
- explain Pearson r, Cramer's V and Eta squared in plain language
- suggest follow-up checks and charts based on the current dataset
- compare the schema of two files
- export an HTML audit report that can also be printed to PDF

## Format checks

Expected formats are inferred. They are not treated as a substitute for a real data dictionary.

For example, a column called `email` can reasonably be checked for email-shaped values, while a field with an unclear name may be left without a strict expected format. Date checks validate the calendar date as well as the shape of the string, so something that looks like a date can still be flagged if the date itself is impossible.

## Relationship measures

Three measures are used at the moment:

- **Pearson r** for two numeric variables
- **Cramer's V** for two categorical variables
- **Eta squared** for a numeric variable compared across categories

The relationship screen is exploratory. It does not claim that a high-ranked relationship is causal or automatically important to the business problem.

For numeric pairs, the chart includes a least-squares line of best fit, its equation and R-squared. The equation is also available in the chart tooltip.

## Schema comparison

A second file can be loaded as a comparison dataset. Data Triage checks for:

- added and removed columns
- changed detected types
- changed inferred formats
- likely renamed fields
- changes in missingness
- row and column count changes

This is intended for repeated extracts, monthly files or revised datasets where a structural change could break an existing analysis.

## Privacy

The active dataset and comparison dataset stay in memory in the browser. Refreshing or closing the page clears them.

The only value stored in local storage is the light/dark theme preference.

## Sample data

The built-in sample contains 160 fictional customer records. Most values are valid, with a small number of deliberate issues so the checks have something to find. These include a malformed email address, missing spend values, an implausible age, an out-of-range satisfaction score, an extreme spend value and a repeated customer ID.

`signup_date` uses valid `YYYY-MM-DD` dates throughout so the date validator can be checked against a clean field.

## Limits

This is an automated screening tool, not a replacement for domain knowledge. The checks cannot know company-specific business rules unless they are encoded explicitly. Relationship measures are descriptive, expected formats are inferred, and large pairwise scans are capped to keep browser performance reasonable.
