import { StatePanel } from './StatePanel.jsx';

/**
 * Returns true only when every flag named by `column.requires` is explicitly
 * true on the permissions object.
 *
 * The `=== true` comparison is deliberate and is the fail-closed rule from
 * 04_PRESENTATION_CONTRACT.md: an unknown or misspelled flag resolves to
 * `undefined`, which is not `true`, so the column is omitted. Unknown means
 * unmet — never "unrestricted".
 */
function isColumnPermitted(column, permissions) {
  if (!column.requires) return true;

  const required = Array.isArray(column.requires) ? column.requires : [column.requires];
  return required.every((flag) => permissions?.[flag] === true);
}

/**
 * The authorized subset of `columns` for this viewer.
 *
 * Exported so exports, print sheets, and CSV builders filter through the exact
 * same predicate the table renders with. ARCHITECTURE Section 21 requires
 * exports contain only authorized columns; sharing this function is what keeps
 * an export from drifting away from the table it was generated from.
 */
export function visibleColumns(columns, permissions) {
  return columns.filter((column) => isColumnPermitted(column, permissions));
}

function cellClassName(column) {
  const classes = ['data-table__cell'];
  if (column.align === 'right') classes.push('data-table__cell--right');
  if (column.align === 'center') classes.push('data-table__cell--center');
  if (column.numeric) classes.push('data-table__cell--numeric');
  if (column.className) classes.push(column.className);
  return classes.join(' ');
}

function resolveValue(column, row) {
  if (typeof column.render === 'function') return column.render(row);
  const value = row?.[column.key];
  if (value === null || value === undefined || value === '') {
    return column.fallback ?? '—';
  }
  return value;
}

function mobileLabelFor(column) {
  if (typeof column.mobileLabel === 'string') return column.mobileLabel;
  if (typeof column.header === 'string') return column.header;
  return '';
}

/**
 * Permission-aware data table.
 *
 * Protected columns are removed from the column set BEFORE render, so the
 * header cell, every body cell, and the footer disappear together. There is no
 * code path where a caller can omit one and forget another, and no path where
 * a protected value reaches the DOM to be recovered from devtools.
 *
 * This component is layer 3 of the three-layer rule. It cannot and does not
 * substitute for layer 1 (server authorization) or layer 2 (payload
 * exclusion) — callers must still avoid SELECTing values the viewer may not
 * see. See 04_PRESENTATION_CONTRACT.md.
 *
 * Sorting is controlled by the caller. This component owns no data semantics.
 */
export function DataTable({
  columns,
  rows,
  permissions = {},
  getRowKey,
  caption,
  ariaLabel,
  isLoading = false,
  error = null,
  emptyTitle = 'Nothing to show',
  emptyDescription = '',
  emptyActions = null,
  onRowClick = null,
  selectedRowKey = null,
  sortKey = null,
  sortDirection = 'asc',
  onSort = null,
  dense = false,
  minWidth = null,
  footNote = '',
  rowClassName = null,
}) {
  const permitted = visibleColumns(columns, permissions);

  if (error) {
    return (
      <StatePanel
        tone="danger"
        eyebrow="Error"
        title="This data could not be loaded"
        description={typeof error === 'string' ? error : error.message || 'Unexpected error.'}
      />
    );
  }

  if (isLoading) {
    return <StatePanel tone="neutral" eyebrow="Loading" title="Loading…" compact />;
  }

  if (!rows || rows.length === 0) {
    return (
      <StatePanel
        tone="neutral"
        title={emptyTitle}
        description={emptyDescription}
        actions={emptyActions}
      />
    );
  }

  const keyFor = (row, index) => {
    if (typeof getRowKey === 'function') return getRowKey(row, index);
    return row?.id ?? index;
  };

  const ariaSortFor = (column) => {
    if (!column.sortable || !onSort) return undefined;
    if (sortKey !== column.key) return 'none';
    return sortDirection === 'desc' ? 'descending' : 'ascending';
  };

  const hasFooter = permitted.some((column) => column.footer !== undefined);

  return (
    <div className="table-wrap">
      <table
        className={`data-table${dense ? ' data-table--dense' : ''}`}
        aria-label={ariaLabel}
        style={minWidth ? { minWidth: `min(${minWidth}, 100%)` } : undefined}
      >
        {caption ? <caption className="data-table__caption">{caption}</caption> : null}

        <thead>
          <tr>
            {permitted.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cellClassName(column)}
                style={column.width ? { width: column.width } : undefined}
                aria-sort={ariaSortFor(column)}
              >
                {column.sortable && onSort ? (
                  <button
                    type="button"
                    className="data-table__sort"
                    onClick={() => onSort(column.key)}
                  >
                    <span>{column.header}</span>
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => {
            const rowKey = keyFor(row, index);
            const isSelected = selectedRowKey !== null && rowKey === selectedRowKey;

            return (
              <tr
                key={rowKey}
                className={`${typeof rowClassName === 'function' ? rowClassName(row) : ''} ${isSelected ? 'data-table__row--selected' : ''}${
                  onRowClick ? ' data-table__row--clickable' : ''
                }`.trim()}
                aria-selected={selectedRowKey !== null ? isSelected : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {permitted.map((column) => (
                  <td key={column.key} className={cellClassName(column)} data-label={mobileLabelFor(column)}>
                    {resolveValue(column, row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>

        {hasFooter ? (
          <tfoot>
            <tr>
              {permitted.map((column) => (
                <td key={column.key} className={cellClassName(column)}>
                  {column.footer ?? null}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>

      {footNote ? <p className="data-table__note">{footNote}</p> : null}
    </div>
  );
}
