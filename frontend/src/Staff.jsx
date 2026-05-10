import { useEffect, useState } from "react";

const API = "http://localhost:3000";

function Staff() {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadStaff = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/staff`, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить сотрудников");
      const data = await res.json();
      setStaff(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  // Генерация ссылки-приглашения
  const generateLink = async () => {
    setGenerating(true);
    setError("");
    setCopied(false);
    try {
      const res = await fetch(`${API}/generate-link`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Не удалось создать ссылку");
      const data = await res.json();
      setLink(data.link);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  // Копирование ссылки
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Не удалось скопировать. Скопируйте вручную.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Сотрудники</h1>
        <div className="page-actions">
          <button
            className="btn-primary"
            onClick={generateLink}
            disabled={generating}
          >
            {generating ? "Создаём ссылку..." : "+ Пригласить сотрудника"}
          </button>
        </div>
      </div>

      {/* Блок со ссылкой появляется после нажатия на кнопку */}
      {link && (
        <div className="copy-box" style={{ marginBottom: "var(--space-5)" }}>
          <input
            className="copy-input"
            value={link}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <button className="copy-btn" onClick={handleCopy}>
            {copied ? "Скопировано ✓" : "Скопировать"}
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {/* Список сотрудников */}
      {loading ? (
        <div className="spinner" />
      ) : staff.length === 0 ? (
        <div className="empty-state">
          <h3>Пока никого нет</h3>
          <p>Пригласите сотрудников по ссылке выше</p>
        </div>
      ) : (
        <div className="card-grid">
          {staff.map((s) => (
            <StaffCard key={s.id} staff={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function StaffCard({ staff }) {
  return (
    <div className="entity-card">
      <div className="entity-card-title">{staff.name || staff.username}</div>
      <div className="entity-card-meta">
        {staff.position || (staff.role === "owner" ? "Владелец" : "Сотрудник")}
      </div>
      {staff.email && (
        <div className="entity-card-meta">{staff.email}</div>
      )}
      <div style={{ marginTop: "auto" }}>
        <span className={`chip ${staff.is_active === false ? "chip-danger" : "chip-success"}`}>
          {staff.is_active === false ? "Неактивен" : "Активен"}
        </span>
      </div>
    </div>
  );
}

export default Staff;