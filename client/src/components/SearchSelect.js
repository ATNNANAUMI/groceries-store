import { useState, useRef, useEffect, useId, useMemo } from 'react';
import { matchesSearch } from '../lib/search';

const MAX_RESULTS = 100;

// A searchable replacement for <select> on long lists: type to filter (accents and case
// ignored), ↑/↓ to move, Enter to pick, Esc to close.
// options: [{ value, label, detail?, disabled? }]
export default function SearchSelect({
  options, value, onChange, placeholder = 'Buscar…', required = false, compact = false,
  emptyText = 'Nenhum resultado', 'aria-label': ariaLabel,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const selected = options.find(o => o.value === value);
  const matches = useMemo(() => options.filter(o => matchesSearch(query, o.label)), [options, query]);
  const shown = matches.slice(0, MAX_RESULTS);

  // Native form validation: a required field must hold a picked option, not just typed text.
  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !selected ? 'Selecione uma opção da lista.' : '');
  }, [required, selected]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  function openList() {
    setQuery('');
    setActive(0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery('');
  }

  function pick(option) {
    if (!option || option.disabled) return;
    onChange(option.value);
    close();
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(i => Math.min(Math.max(i + step, 0), shown.length - 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      close();
    }
  }

  const optionId = i => `${listId}-${i}`;

  return (
    <div className={compact ? 'search-select search-select-compact' : 'search-select'}>
      <input
        ref={inputRef}
        className={compact ? 'select-compact' : undefined}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={open && selected ? selected.label : placeholder}
        value={open ? query : selected?.label ?? ''}
        onFocus={openList}
        onClick={() => { if (!open) openList(); }}
        onBlur={close}
        onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul className="search-select-list" role="listbox" id={listId} ref={listRef}>
          {shown.map((o, i) => (
            <li
              key={o.value}
              id={optionId(i)}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              className={i === active ? 'search-select-option active' : 'search-select-option'}
              // mousedown would blur the input (closing the list) before the click lands.
              onMouseDown={e => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              <span className="search-select-label">{o.label}</span>
              {o.detail && <>{' '}<span className="search-select-detail">{o.detail}</span></>}
            </li>
          ))}
          {shown.length === 0 && <li className="search-select-empty">{emptyText}</li>}
          {matches.length > shown.length && (
            <li className="search-select-empty">
              Mostrando {shown.length} de {matches.length} — continue digitando para filtrar
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
