import { useState, useMemo, useRef } from 'react';
import { api } from '../api';
import { formatMoney, formatDate, formatPercent, todayLocal } from '../lib/format';
import { saleTotal, parseDiscount } from '../lib/sales';
import ErrorBanner from './ErrorBanner';

const PAGE_SIZE = 50;
const formatCount = n => n.toLocaleString('pt-BR');

export default function Sales({ sales, buyers, items, refreshSales, refreshItems }) {
  const [form, setForm] = useState({
    buyerId: '',
    itemId: '',
    quantity: 1,
    discount: '',
    date: todayLocal(),
  });
  const [buyerFilter, setBuyerFilter] = useState('');
  const [page, setPage] = useState(0);
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
      await refreshSales();
    } catch (err) {
      setError(err.message);
    }
  }

  const unknown = <span className="muted">Desconhecido</span>;
  const buyerName = id => buyers.find(b => b.id === id)?.name || unknown;
  // Imported sales without a catalog item keep the spreadsheet text in `description`.
  const itemName = sale => items.find(i => i.id === sale.item_id)?.name || sale.description || unknown;

  const filteredSales = useMemo(() => {
    return buyerFilter ? sales.filter(s => s.buyer_id === buyerFilter) : sales;
  }, [sales, buyerFilter]);

  const filteredTotal = filteredSales.reduce((sum, s) => sum + Number(s.total), 0);

  // Rendering every sale (thousands after the spreadsheet import) is slow, so show one page.
  const pageCount = Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);  // a delete can shrink the last page away
  const firstIndex = currentPage * PAGE_SIZE;
  const pageSales = filteredSales.slice(firstIndex, firstIndex + PAGE_SIZE);

  function goToPage(p) {
    setPage(p);
    historyRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
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
          <select
            value={form.buyerId}
            onChange={e => setForm(f => ({ ...f, buyerId: e.target.value }))}
            required
          >
            <option value="">Selecione o cliente</option>
            {buyers.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Produto</span>
          <select
            value={form.itemId}
            onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))}
            required
          >
            <option value="">Selecione o produto</option>
            {items.map(i => (
              <option key={i.id} value={i.id} disabled={i.stock === 0}>
                {i.name} — {formatMoney(i.price)} ({i.stock} em estoque)
              </option>
            ))}
          </select>
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
          <span className="muted">{formatCount(filteredSales.length)} vendas · {formatMoney(filteredTotal)}</span>
          <select
            className="select-compact"
            value={buyerFilter}
            onChange={e => { setBuyerFilter(e.target.value); setPage(0); }}
            aria-label="Filtrar por cliente"
          >
            <option value="">Todos os clientes</option>
            {buyers.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={pageCount > 1 ? 'table-wrap table-wrap-paged' : 'table-wrap'}>
        <table>
          <thead>
            <tr>
              <th>Data</th><th>Cliente</th><th>Produto</th>
              <th className="num">Qtd.</th><th className="num">Preço</th><th className="num">Desc.</th>
              <th className="num">Total</th><th className="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {pageSales.map(s => (
              <tr key={s.id}>
                <td className="nowrap">{formatDate(s.sale_date)}</td>
                <td className="strong">{buyerName(s.buyer_id)}</td>
                <td>{itemName(s)}</td>
                <td className="num">{s.quantity}</td>
                <td className="num">{formatMoney(s.unit_price)}</td>
                <td className="num">{Number(s.discount) > 0 ? formatPercent(s.discount) : ''}</td>
                <td className="num strong">{formatMoney(s.total)}</td>
                <td className="row-actions">
                  <button className="btn btn-small btn-danger" onClick={() => handleDelete(s.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {filteredSales.length === 0 && (
              <tr><td colSpan={8} className="empty">Nenhuma venda registrada ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav className="pager" aria-label="Páginas do histórico">
          <span className="muted">
            {formatCount(firstIndex + 1)}–{formatCount(firstIndex + pageSales.length)} de {formatCount(filteredSales.length)}
          </span>
          <div className="pager-buttons">
            <button className="btn btn-small" onClick={() => goToPage(0)} disabled={currentPage === 0}
              aria-label="Primeira página">«</button>
            <button className="btn btn-small" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0}>
              ‹ Anterior
            </button>
            <span className="pager-status">Página {formatCount(currentPage + 1)} de {formatCount(pageCount)}</span>
            <button className="btn btn-small" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === pageCount - 1}>
              Próxima ›
            </button>
            <button className="btn btn-small" onClick={() => goToPage(pageCount - 1)} disabled={currentPage === pageCount - 1}
              aria-label="Última página">»</button>
          </div>
        </nav>
      )}
    </section>
  );
}
