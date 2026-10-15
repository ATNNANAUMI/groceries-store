import { useState, useMemo, useRef, useEffect } from 'react';
import { api } from '../api';
import { formatMoney, formatDate, formatPercent, todayLocal } from '../lib/format';
import { saleTotal, parseDiscount } from '../lib/sales';
import { sortByName } from '../lib/search';
import ErrorBanner from './ErrorBanner';
import SearchSelect from './SearchSelect';

const PAGE_SIZE = 50;
const formatCount = n => n.toLocaleString('pt-BR');

export default function Sales({ summary, buyers, items, refreshSales, refreshItems }) {
  const [form, setForm] = useState({
    buyerId: '',
    itemId: '',
    quantity: 1,
    discount: '',
    date: todayLocal(),
  });
  const [buyerFilter, setBuyerFilter] = useState('');
  const [page, setPage] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [jumpDate, setJumpDate] = useState('');
  const [history, setHistory] = useState({ rows: [], count: 0, offset: 0 });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [filterSummary, setFilterSummary] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const historyRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedItem = items.find(i => i.id === form.itemId);
  const qty = parseInt(form.quantity, 10) || 0;
  const overStock = selectedItem && qty > selectedItem.stock;
  const discount = parseDiscount(form.discount);
  const badDiscount = Number.isNaN(discount);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.buyerId || !selectedItem || qty < 1 || overStock || badDiscount) return;
    setSaving(true);
    setError('');

    try {
      await api.sales.create({
        buyerId: form.buyerId,
        itemId: form.itemId,
        quantity: qty,
        discount,
        saleDate: form.date,
      });
      setForm(f => ({ ...f, itemId: '', quantity: 1, discount: '' }));
      setPage(0);
      setJumpDate('');
      setReloadKey(k => k + 1);
    } catch (err) {
      setError(err.message);
    }
    // Refresh either way: on a stock conflict the catalog is stale.
    try {
      await Promise.all([refreshSales(), refreshItems()]);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Excluir esta venda? O estoque não é devolvido.')) return;
    setError('');
    try {
      await api.sales.remove(id);
      setReloadKey(k => k + 1);
      await refreshSales();
    } catch (err) {
      setError(err.message);
    }
  }

  const unknown = <span className="muted">Desconhecido</span>;
  const buyerName = id => buyers.find(b => b.id === id)?.name || unknown;
  // Imported sales without a catalog item keep the spreadsheet text in `description`.
  const itemName = sale => items.find(i => i.id === sale.item_id)?.name || sale.description || unknown;

  const buyerOptions = useMemo(
    () => sortByName(buyers).map(b => ({ value: b.id, label: b.name })),
    [buyers],
  );
  const itemOptions = useMemo(
    () => sortByName(items).map(i => ({
      value: i.id,
      label: i.name,
      detail: `${formatMoney(i.price)} · ${i.stock} em estoque`,
      disabled: i.stock === 0,
    })),
    [items],
  );
  const filterOptions = useMemo(
    () => [{ value: '', label: 'Todos os clientes' }, ...buyerOptions],
    [buyerOptions],
  );

  // The history is loaded one page at a time from the database (there are tens of thousands of
  // sales); totals come from api.sales.summary().
  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    const offset = page * PAGE_SIZE;
    api.sales.page({ buyerId: buyerFilter || undefined, offset, limit: PAGE_SIZE })
      .then(result => {
        if (cancelled) return;
        const lastPage = Math.max(0, Math.ceil(result.count / PAGE_SIZE) - 1);
        if (page > lastPage) return setPage(lastPage);  // e.g. deleted the last sale of the last page
        setHistory({ ...result, offset });
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [buyerFilter, page, reloadKey]);

  useEffect(() => {
    if (!buyerFilter) return setFilterSummary(null);
    let cancelled = false;
    api.sales.summary({ buyerId: buyerFilter })
      .then(result => { if (!cancelled) setFilterSummary(result); })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [buyerFilter, reloadKey]);

  useEffect(() => setPageInput(String(page + 1)), [page]);

  const headerSummary = buyerFilter ? filterSummary : summary;
  const pageCount = Math.max(1, Math.ceil(history.count / PAGE_SIZE));
  const rows = history.rows;
  const firstIndex = history.offset;  // of the rows on screen, which lag `page` while it loads
  const jumpMissing = jumpDate && !historyLoading && !rows.some(r => r.sale_date === jumpDate);

  function goToPage(p, { keepJump = false } = {}) {
    if (!keepJump) setJumpDate('');
    setPage(Math.min(Math.max(p, 0), pageCount - 1));
    historyRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }

  function commitPageInput() {
    const n = parseInt(pageInput, 10);
    if (n >= 1 && n <= pageCount) goToPage(n - 1);
    else setPageInput(String(page + 1));
  }

  async function jumpToDate(date) {
    setJumpDate(date);
    if (!date) return;
    try {
      const newer = await api.sales.countAfter({ date, buyerId: buyerFilter || undefined });
      goToPage(Math.floor(newer / PAGE_SIZE), { keepJump: true });
    } catch (err) {
      setError(err.message);
    }
  }

  function changeFilter(id) {
    setBuyerFilter(id);
    setJumpDate('');
    setPage(0);
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2>Registrar venda</h2>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {(buyers.length === 0 || items.length === 0) && (
        <p className="hint">
          Cadastre pelo menos um {buyers.length === 0 ? 'cliente' : 'produto'} antes de registrar uma venda.
        </p>
      )}

      <form className="form-grid form-grid-sale" onSubmit={handleSubmit}>
        <label className="field">
          <span>Cliente</span>
          <SearchSelect
            options={buyerOptions}
            value={form.buyerId}
            onChange={buyerId => setForm(f => ({ ...f, buyerId }))}
            placeholder="Buscar cliente…"
            emptyText="Nenhum cliente encontrado"
            required
          />
        </label>

        <label className="field">
          <span>Produto</span>
          <SearchSelect
            options={itemOptions}
            value={form.itemId}
            onChange={itemId => setForm(f => ({ ...f, itemId }))}
            placeholder="Buscar produto…"
            emptyText="Nenhum produto encontrado"
            required
          />
        </label>

        <label className="field field-narrow">
          <span>Qtd.</span>
          <input
            type="number"
            min="1"
            max={selectedItem ? selectedItem.stock : undefined}
            step="1"
            inputMode="numeric"
            value={form.quantity}
            onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
            aria-invalid={overStock || undefined}
            required
          />
        </label>

        <label className="field field-narrow">
          <span>Desconto %</span>
          <input
            type="number"
            min="0"
            max="100"
            step="any"
            inputMode="decimal"
            placeholder="0"
            value={form.discount}
            onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
            aria-invalid={badDiscount || undefined}
          />
        </label>

        <label className="field">
          <span>Data</span>
          <input
            type="date"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            required
          />
        </label>

        <div className="form-actions">
          <div className="sale-total">
            <span className="muted">Total</span>
            <strong>{formatMoney(selectedItem && !badDiscount ? saleTotal(selectedItem.price, qty, discount) : 0)}</strong>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving || overStock || badDiscount}>
            {saving ? 'Salvando…' : 'Registrar venda'}
          </button>
        </div>
        {overStock && (
          <p className="field-error form-full">Só há {selectedItem.stock} em estoque.</p>
        )}
        {badDiscount && (
          <p className="field-error form-full">O desconto deve ficar entre 0 e 100%.</p>
        )}
      </form>

      <div className="card-header" ref={historyRef}>
        <h2>Histórico de vendas</h2>
        <div className="card-header-tools">
          {headerSummary && (
            <span className="muted">
              {formatCount(headerSummary.count)} vendas · {formatMoney(headerSummary.total)}
            </span>
          )}
          <SearchSelect
            options={filterOptions}
            value={buyerFilter}
            onChange={changeFilter}
            placeholder="Buscar cliente…"
            emptyText="Nenhum cliente encontrado"
            aria-label="Filtrar por cliente"
            compact
          />
          <input
            type="date"
            className="select-compact date-jump"
            value={jumpDate}
            onChange={e => jumpToDate(e.target.value)}
            aria-label="Ir para a data"
            title="Ir para a data"
          />
        </div>
      </div>

      {jumpMissing && (
        <p className="hint">Nenhuma venda em {formatDate(jumpDate)} — mostrando as anteriores.</p>
      )}

      <div className={[
        'table-wrap',
        pageCount > 1 && 'table-wrap-paged',
        historyLoading && rows.length > 0 && 'is-loading',
      ].filter(Boolean).join(' ')} aria-busy={historyLoading}>
        <table>
          <thead>
            <tr>
              <th>Data</th><th>Cliente</th><th>Produto</th>
              <th className="num">Qtd.</th><th className="num">Preço</th><th className="num">Desc.</th>
              <th className="num">Total</th><th className="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id} className={s.sale_date === jumpDate ? 'highlight' : undefined}>
                <td className="nowrap">{formatDate(s.sale_date)}</td>
                <td className="strong">{buyerName(s.buyer_id)}</td>
                <td>{itemName(s)}</td>
                <td className="num">{s.quantity}</td>
                <td className="num">{formatMoney(s.unit_price)}</td>
                <td className="num">{Number(s.discount) > 0 ? formatPercent(s.discount) : ''}</td>
                <td className="num strong">{formatMoney(s.total)}</td>
                <td className="row-actions">
                  <button className="btn btn-small btn-danger" onClick={() => handleDelete(s.id)}>Excluir</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="empty">
                {historyLoading ? 'Carregando…' : buyerFilter ? 'Nenhuma venda para este cliente.' : 'Nenhuma venda registrada ainda.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav className="pager" aria-label="Páginas do histórico">
          <span className="muted">
            {formatCount(firstIndex + 1)}–{formatCount(firstIndex + rows.length)} de {formatCount(history.count)}
          </span>
          <div className="pager-buttons">
            <button className="btn btn-small" onClick={() => goToPage(0)} disabled={page === 0}
              aria-label="Primeira página">«</button>
            <button className="btn btn-small" onClick={() => goToPage(page - 1)} disabled={page === 0}>
              ‹ Anterior
            </button>
            <span className="pager-status">
              Página
              <input
                className="pager-input"
                type="number"
                min="1"
                max={pageCount}
                inputMode="numeric"
                value={pageInput}
                onChange={e => setPageInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitPageInput(); }}
                onBlur={commitPageInput}
                aria-label="Ir para a página"
              />
              de {formatCount(pageCount)}
            </span>
            <button className="btn btn-small" onClick={() => goToPage(page + 1)} disabled={page >= pageCount - 1}>
              Próxima ›
            </button>
            <button className="btn btn-small" onClick={() => goToPage(pageCount - 1)} disabled={page >= pageCount - 1}
              aria-label="Última página">»</button>
          </div>
        </nav>
      )}
    </section>
  );
}
