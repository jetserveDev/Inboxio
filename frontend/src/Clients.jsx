import { useEffect, useState } from "react";

const API = "http://localhost:3000";

export default function Clients() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const fetchCustomers = async (q = "") => {
    setLoading(true);
    setError("");
    try {
      const url = q.trim()
        ? `${API}/customers?q=${encodeURIComponent(q.trim())}`
        : `${API}/customers`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить клиентов");
      const data = await res.json();
      setCustomers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Изначальная загрузка
  useEffect(() => { fetchCustomers(); }, []);

  // Debounced поиск — ждём 300мс после последнего нажатия
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleCreated = (newCustomer) => {
    setCustomers(prev => [newCustomer, ...prev]);
    setIsCreating(false);
  };

  const handleUpdated = (updated) => {
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
    setSelectedCustomer(null);
  };

  const handleDeleted = (deletedId) => {
    setCustomers(prev => prev.filter(c => c.id !== deletedId));
    setSelectedCustomer(null);
  };

  const [isImporting, setIsImporting] = useState(false);
  return (
    <>
            <div>


        {isImporting && (
        <ImportCustomersModal
            onClose={() => setIsImporting(false)}
            onImported={() => {
            setIsImporting(false);
            fetchCustomers(query);
            }}
        />
        )}
        <div className="customers-toolbar">
            <button 
            className="btn-secondary" 
            onClick={() => setIsImporting(true)}
            >
            Импорт CSV / Excel
            </button>
            <button className="btn-primary" onClick={() => setIsCreating(true)}>
            + Добавить клиента
            </button>

            <div className="search-wrap">
            <SearchIcon />
            <input
                className="input search-input"
                type="text"
                placeholder="Поиск по имени или телефону..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
                <button 
                className="search-clear" 
                onClick={() => setQuery("")}
                aria-label="Очистить поиск"
                >
                ×
                </button>
            )}
            </div>
          <div className="customers-count">
            {!loading && (
              customers.length === 0
                ? (query ? "Никого не найдено" : "Пока нет клиентов")
                : `${customers.length} ${pluralize(customers.length, ["клиент", "клиента", "клиентов"])}`
            )}
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="spinner" />
        ) : customers.length === 0 ? (
          query ? (
            <div className="empty-state">
              <h3>Ничего не найдено</h3>
              <p>Попробуйте изменить запрос</p>
            </div>
          ) : (
            <div className="empty-state">
              <h3>Пока нет клиентов</h3>
              <p>Нажмите «Добавить клиента», чтобы создать первого</p>
            </div>
          )
        ) : (
          <div className="table-wrap">
            <table className="crm-table customers-table">
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Телефон</th>
                  <th>Email</th>
                  <th>Добавлен</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr 
                    key={c.id} 
                    onClick={() => setSelectedCustomer(c)}
                    className="customers-row"
                  >
                    <td data-label="Имя">
                      <div className="customer-name-cell">
                        <div className="customer-avatar">
                          {getInitial(c.name || c.phone)}
                        </div>
                        <span>{c.name || <span className="customer-noname">Без имени</span>}</span>
                      </div>
                    </td>
                    <td data-label="Телефон">
                      <span className="customer-phone">{formatPhone(c.phone)}</span>
                    </td>
                    <td data-label="Email">
                      {c.email || <span className="customer-noname">—</span>}
                    </td>
                    <td data-label="Добавлен">
                      <span className="customer-date">{formatDate(c.created_at)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isCreating && (
        <CreateCustomerModal
          onClose={() => setIsCreating(false)}
          onCreated={handleCreated}
        />
      )}

      {selectedCustomer && (
        <CustomerModal
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}

function CreateCustomerModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit = phone.trim() && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API}/customers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          phone: phone.trim(),
          email: email.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Ошибка");
      onCreated(data);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Новый клиент</h2>

        {error && <div className="error-banner">{error}</div>}

        <div className="field">
          <label className="field-label">Телефон *</label>
          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+79991234567"
            disabled={submitting}
            autoFocus
          />
          <span className="field-hint">Можно вводить с пробелами и скобками</span>
        </div>

        <div className="field">
          <label className="field-label">Имя</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Анна Петрова"
            disabled={submitting}
          />
        </div>

        <div className="field">
          <label className="field-label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            disabled={submitting}
          />
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Создаём..." : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerModal({ customer, onClose, onUpdated, onDeleted }) {
  const [name, setName] = useState(customer.name || "");
  const [phone, setPhone] = useState(customer.phone || "");
  const [email, setEmail] = useState(customer.email || "");
  const [notes, setNotes] = useState(customer.notes || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const busy = saving || deleting;
  const hasChanges =
    (name || "") !== (customer.name || "") ||
    (phone || "") !== (customer.phone || "") ||
    (email || "") !== (customer.email || "") ||
    (notes || "") !== (customer.notes || "");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API}/customers/${customer.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          phone: phone.trim(),
          email: email.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Ошибка сохранения");
      onUpdated(data);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Удалить клиента ${customer.name || customer.phone}? Это действие необратимо.`)) {
      return;
    }
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`${API}/customers/${customer.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Ошибка удаления");
      }
      onDeleted(customer.id);
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-customer" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Закрыть">×</button>

        <div className="customer-modal-header">
          <div className="customer-modal-avatar">
            {getInitial(customer.name || customer.phone)}
          </div>
          <div className="customer-modal-heading">
            <div className="service-modal-eyebrow">Клиент</div>
            <h2 className="customer-modal-name">{customer.name || "Без имени"}</h2>
          </div>
        </div>

        <div className="customer-modal-body">
          {error && <div className="error-banner">{error}</div>}

          <div className="field">
            <label className="field-label">Имя</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder="Анна Петрова"
            />
          </div>

          <div className="field">
            <label className="field-label">Телефон</label>
            <input
              className="input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="field">
            <label className="field-label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              placeholder="email@example.com"
            />
          </div>

          <div className="field">
            <label className="field-label">Заметки</label>
            <textarea
              className="input textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              rows={3}
              placeholder="Аллергия, предпочтения, особенности..."
            />
          </div>
        </div>

        <div className="customer-modal-footer">
          <button
            className="btn-danger"
            onClick={handleDelete}
            disabled={busy}
            style={{ marginRight: "auto" }}
          >
            {deleting ? "Удаление..." : "Удалить"}
          </button>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button 
            className="btn-primary" 
            onClick={handleSave} 
            disabled={!hasChanges || busy}
          >
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
function ImportCustomersModal({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !importing && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, importing]);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    setResult(null);
    setFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError("");
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch(`${API}/customers/import`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Ошибка импорта");
      
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleDone = () => {
    onImported();
  };

  return (
    <div className="modal-backdrop" onClick={importing ? undefined : onClose}>
      <div className="modal modal-import" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Импорт клиентов</h2>

        {!result && (
          <>
            <div className="import-instructions">
              <p>Загрузите файл с клиентами в формате CSV или Excel (.xlsx, .xls). Система автоматически найдёт колонки.</p>
              <div className="import-hint">
                <strong>Поддерживаемые колонки</strong> (любые из вариантов):
                <ul>
                  <li><b>Имя</b>: Name, ФИО, Имя, Имя клиента, Client name...</li>
                  <li><b>Телефон</b> (обязательно): Phone, Телефон, Номер, Mobile...</li>
                  <li><b>Email</b>: Email, Почта, E-mail...</li>
                  <li><b>Заметки</b>: Notes, Заметки, Комментарий...</li>
                </ul>
                <p className="import-hint-note">
                  Остальные колонки будут проигнорированы. Дубликаты по телефону пропускаются.
                </p>
              </div>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="import-file-picker">
              <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={importing}
                  id="csv-file-input"
                  style={{ display: 'none' }}
              />
              <label htmlFor="csv-file-input" className="file-picker-label">
                {file ? (
                  <>
                    <FileIcon />
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-size">{(file.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <span className="file-change">Выбрать другой</span>
                  </>
                ) : (
                  <>
                    <UploadIcon />
                    <div>
                      <div className="file-picker-title">Выберите файл</div>
                      <div className="file-picker-hint">CSV или Excel · перетащите сюда</div>
                    </div>
                  </>
                )}
              </label>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose} disabled={importing}>
                Отмена
              </button>
              <button 
                className="btn-primary" 
                onClick={handleImport} 
                disabled={!file || importing}
              >
                {importing ? "Импортируем..." : "Импортировать"}
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <div className="import-result">
              <div className="import-stats">
                <div className="import-stat import-stat-success">
                  <div className="import-stat-number">{result.imported}</div>
                  <div className="import-stat-label">Импортировано</div>
                </div>
                {result.skipped_duplicate > 0 && (
                  <div className="import-stat import-stat-muted">
                    <div className="import-stat-number">{result.skipped_duplicate}</div>
                    <div className="import-stat-label">Уже было в базе</div>
                  </div>
                )}
                {result.errors_count > 0 && (
                  <div className="import-stat import-stat-warning">
                    <div className="import-stat-number">{result.errors_count}</div>
                    <div className="import-stat-label">Ошибки</div>
                  </div>
                )}
              </div>

              {result.detected_columns && (
                <div className="import-detected">
                  <strong>Использованы колонки:</strong>{' '}
                  {result.detected_columns.map(c => {
                    const labels = {
                      name: 'Имя', phone: 'Телефон', email: 'Email', notes: 'Заметки'
                    };
                    return labels[c] || c;
                  }).join(', ')}
                </div>
              )}

              {result.errors && result.errors.length > 0 && (
                <div className="import-errors">
                  <details>
                    <summary>Показать ошибки ({result.errors.length})</summary>
                    <ul>
                      {result.errors.map((e, i) => (
                        <li key={i}>Строка {e.row}: {e.reason}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-primary" onClick={handleDone}>
                Готово
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function getInitial(str) {
  if (!str) return "?";
  return str.trim()[0]?.toUpperCase() || "?";
}

function formatPhone(phone) {
  if (!phone) return "";
  // +79991234567 → +7 999 123-45-67
  const match = phone.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (match) {
    return `+7 ${match[1]} ${match[2]}-${match[3]}-${match[4]}`;
  }
  return phone;
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  if (diffDays < 7) return `${diffDays} дн. назад`;
  
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: now.getFullYear() === date.getFullYear() ? undefined : "numeric",
  });
}

function pluralize(count, [one, few, many]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}