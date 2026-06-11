import { useEffect, useState } from "react";

const API = "http://localhost:3000";

function Staff() {
  const [selectedStaff, setSelectedStaff] = useState(null);
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

  useEffect(() => { loadStaff(); }, []);

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
          <button className="btn-primary" onClick={generateLink} disabled={generating}>
            {generating ? "Создаём ссылку..." : "+ Пригласить сотрудника"}
          </button>
        </div>
      </div>

      {link && (
        <div className="copy-box" style={{ marginBottom: "var(--space-5)" }}>
          <input className="copy-input" value={link} readOnly onFocus={(e) => e.target.select()} />
          <button className="copy-btn" onClick={handleCopy}>
            {copied ? "Скопировано ✓" : "Скопировать"}
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

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
            <StaffCard key={s.id} staff={s} onClick={setSelectedStaff} />
          ))}
        </div>
      )}

      {selectedStaff && (
        <StaffModal
          staff={selectedStaff}
          onClose={() => setSelectedStaff(null)}
        />
      )}
    </div>
  );
}

function StaffCard({ staff, onClick }) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(staff);
    }
  };

  return (
    <div
      className="entity-card entity-card-clickable"
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(staff)}
      onKeyDown={handleKeyDown}
    >
      <div className="entity-card-title">{staff.name || staff.username}</div>
      <div className="entity-card-meta">
        {staff.position || (staff.role === "owner" ? "Владелец" : "Сотрудник")}
      </div>
      {staff.email && <div className="entity-card-meta">{staff.email}</div>}
      {staff.phone && <div className="entity-card-meta">{staff.phone}</div>}
      <div style={{ marginTop: "auto" }}>
        <span className={`chip ${staff.is_active === false ? "chip-danger" : "chip-success"}`}>
          {staff.is_active === false ? "Неактивен" : "Активен"}
        </span>
      </div>
    </div>
  );
}

function StaffModal({ staff, onClose }) {
  const displayName = staff.name || staff.username;
  const initials = getInitials(displayName);
  const roleLabel = staff.position || (staff.role === "owner" ? "Владелец" : "Сотрудник");
  const isActive = staff.is_active !== false;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-staff" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Закрыть">×</button>

        <div className="staff-modal-header">
          <div className="avatar" aria-hidden>{initials}</div>
          <div className="staff-modal-heading">
            <h2 className="staff-modal-name">{displayName}</h2>
            <div className="staff-modal-role">{roleLabel}</div>
            <div className="status-indicator">
              <span className={`status-dot ${isActive ? "is-active" : "is-inactive"}`} />
              <span className="status-text">{isActive ? "Активен" : "Неактивен"}</span>
            </div>
          </div>
        </div>

        <div className="staff-modal-section">
          <div className="section-label">Контакты</div>

          {staff.phone ? (
            <a href={`tel:${staff.phone}`} className="contact-row">
              <span className="contact-icon"><PhoneIcon /></span>
              <span className="contact-value">{staff.phone}</span>
              <span className="contact-hint">Позвонить</span>
            </a>
          ) : (
            <div className="contact-row contact-row-empty">
              <span className="contact-icon"><PhoneIcon /></span>
              <span className="contact-value">Телефон не указан</span>
            </div>
          )}

          {staff.email ? (
            <a href={`mailto:${staff.email}`} className="contact-row">
              <span className="contact-icon"><MailIcon /></span>
              <span className="contact-value">{staff.email}</span>
              <span className="contact-hint">Написать</span>
            </a>
          ) : (
            <div className="contact-row contact-row-empty">
              <span className="contact-icon"><MailIcon /></span>
              <span className="contact-value">Email не указан</span>
            </div>
          )}
        </div>

        <div className="staff-modal-section">
          <div className="section-label">Учётная запись</div>
          <div className="meta-row">
            <span className="meta-key">Логин</span>
            <span className="meta-value">{staff.username}</span>
          </div>
        </div>

        <StaffServicesSection staffId={staff.id} />
        <StaffHoursSection staffId={staff.id} />
      </div>
    </div>
  );
}

function StaffServicesSection({ staffId }) {
  const [allServices, setAllServices] = useState([]);
  const [assignedIds, setAssignedIds] = useState(new Set());
  const [initialIds, setInitialIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [servicesRes, assignedRes] = await Promise.all([
          fetch(`${API}/services`, { credentials: "include" }),
          fetch(`${API}/staff/${staffId}/services`, { credentials: "include" }),
        ]);
        if (!servicesRes.ok) throw new Error("Не удалось загрузить услуги");
        if (!assignedRes.ok) throw new Error("Не удалось загрузить назначения");

        const services = await servicesRes.json();
        const assigned = await assignedRes.json();

        setAllServices(Array.isArray(services) ? services : services.services || []);
        const ids = new Set(assigned);
        setAssignedIds(ids);
        setInitialIds(new Set(ids));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [staffId]);

  const toggle = (serviceId) => {
    setAssignedIds(prev => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
  };

  const hasChanges =
    assignedIds.size !== initialIds.size ||
    [...assignedIds].some(id => !initialIds.has(id));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API}/staff/${staffId}/services`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_ids: [...assignedIds] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Ошибка сохранения");
      setInitialIds(new Set(assignedIds));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="staff-modal-section">
      <div className="section-header">
        <div className="section-label">Услуги</div>
        {hasChanges && (
          <button
            className="btn-primary section-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="spinner" style={{ margin: "12px auto" }} />
      ) : allServices.length === 0 ? (
        <div className="services-empty">
          Сначала создайте услуги на странице «Услуги»
        </div>
      ) : (
        <div className="services-checklist">
          {allServices.map((service) => {
            const checked = assignedIds.has(service.id);
            return (
              <div
                key={service.id}
                role="checkbox"
                aria-checked={checked}
                tabIndex={0}
                className={`service-check-row ${checked ? "checked" : ""}`}
                onClick={() => toggle(service.id)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    toggle(service.id);
                  }
                }}
              >
                <span className="service-check-box">
                  <CheckIcon />
                </span>
                <span className="service-check-name">{service.name}</span>
                <span className="service-check-meta">
                  {service.duration_minutes} мин · {service.price} ₽
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DAY_NAMES_SHORT = {
  1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб", 7: "Вс",
};
const DAY_NAMES_FULL = {
  1: "Понедельник", 2: "Вторник", 3: "Среда", 4: "Четверг",
  5: "Пятница", 6: "Суббота", 7: "Воскресенье",
};

function StaffHoursSection({ staffId }) {
  const [hours, setHours] = useState(null);
  const [initialHours, setInitialHours] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedVersion, setSavedVersion] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API}/staff/${staffId}/hours`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Не удалось загрузить график");
        const data = await res.json();
        setHours(data);
        setInitialHours(JSON.parse(JSON.stringify(data)));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [staffId]);

  const updateDay = (day_of_week, patch) => {
    setHours(prev => prev.map(d =>
      d.day_of_week === day_of_week ? { ...d, ...patch } : d
    ));
  };

  const overrideDay = (day_of_week) => {
    const day = hours.find(d => d.day_of_week === day_of_week);
    updateDay(day_of_week, {
      is_overridden: true,
      is_working: day.is_working,
      start_time: day.start_time || day.business_start_time || "10:00",
      end_time: day.end_time || day.business_end_time || "20:00",
    });
  };

  const resetDay = (day_of_week) => {
    const day = hours.find(d => d.day_of_week === day_of_week);
    updateDay(day_of_week, {
      is_overridden: false,
      is_working: day.business_is_open,
      start_time: day.business_start_time,
      end_time: day.business_end_time,
    });
  };

  const toggleWorking = (day_of_week) => {
    const day = hours.find(d => d.day_of_week === day_of_week);
    if (day.is_working) {
      updateDay(day_of_week, { is_working: false });
    } else {
      updateDay(day_of_week, {
        is_working: true,
        start_time: day.start_time || day.business_start_time || "10:00",
        end_time: day.end_time || day.business_end_time || "20:00",
      });
    }
  };

  const hasChanges = hours && initialHours &&
    JSON.stringify(hours) !== JSON.stringify(initialHours);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const overrides = hours
        .filter(d => d.is_overridden)
        .map(d => ({
          day_of_week: d.day_of_week,
          is_working: d.is_working,
          start_time: d.is_working ? d.start_time : null,
          end_time: d.is_working ? d.end_time : null,
        }));

      const res = await fetch(`${API}/staff/${staffId}/hours`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Ошибка сохранения");

      setInitialHours(JSON.parse(JSON.stringify(hours)));
      setSavedVersion(v => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="staff-modal-section">
      <div className="section-header">
        <div className="section-label">График работы</div>
        {hasChanges && (
          <button
            className="btn-primary section-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="spinner" style={{ margin: "12px auto" }} />
      ) : (
        <div className="hours-list">
          {hours.map(day => (
            <HourRow
              key={day.day_of_week}
              day={day}
              savedVersion={savedVersion}
              onOverride={() => overrideDay(day.day_of_week)}
              onReset={() => resetDay(day.day_of_week)}
              onToggleWorking={() => toggleWorking(day.day_of_week)}
              onChangeStart={(v) => updateDay(day.day_of_week, { start_time: v })}
              onChangeEnd={(v) => updateDay(day.day_of_week, { end_time: v })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HourRow({ day, savedVersion, onOverride, onReset, onToggleWorking, onChangeStart, onChangeEnd }) {
  const [editing, setEditing] = useState(false);

  // После успешного сохранения родителем — сворачиваемся в режим показа
  useEffect(() => {
    if (savedVersion > 0) setEditing(false);
  }, [savedVersion]);

  const inherited = !day.is_overridden;
  const businessClosed = !day.business_is_open;
  const showValues = inherited || !editing;

  const handleEdit = () => {
    if (inherited) onOverride();
    setEditing(true);
  };

  const handleReset = () => {
    onReset();
    setEditing(false);
  };

  return (
    <div className={`hour-row ${inherited ? "is-inherited" : ""} ${!day.is_working ? "is-off" : ""}`}>
      <div className="hour-row-day">
        <div className="hour-row-day-short">{DAY_NAMES_SHORT[day.day_of_week]}</div>
        <div className="hour-row-day-full">{DAY_NAMES_FULL[day.day_of_week]}</div>
      </div>

      <div className="hour-row-body">
        {showValues ? (
          // ============ ПОКАЗ — только данные + кнопка "Изменить" ============
          <div className="hour-row-inherited">
            {businessClosed ? (
              <span className="hour-inherited-text">Заведение закрыто</span>
            ) : day.is_working ? (
              <span className="hour-inherited-text">
                {day.start_time?.slice(0, 5)}–{day.end_time?.slice(0, 5)}
              </span>
            ) : (
              <span className="hour-inherited-text">Выходной</span>
            )}

            {!businessClosed && (
              <button className="hour-link-btn" onClick={handleEdit}>
                Изменить
              </button>
            )}
          </div>
        ) : (
          // ============ РЕДАКТИРОВАНИЕ — инпуты + кнопки управления ============
          <div className="hour-row-override">
            {day.is_working ? (
              <div className="hour-time-row">
                <input
                  type="time"
                  className="input time-input"
                  value={day.start_time || ""}
                  onChange={(e) => onChangeStart(e.target.value)}
                  min={day.business_start_time?.slice(0, 5)}
                  max={day.business_end_time?.slice(0, 5)}
                />
                <span className="time-dash">—</span>
                <input
                  type="time"
                  className="input time-input"
                  value={day.end_time || ""}
                  onChange={(e) => onChangeEnd(e.target.value)}
                  min={day.business_start_time?.slice(0, 5)}
                  max={day.business_end_time?.slice(0, 5)}
                />
              </div>
            ) : (
              <span className="hour-off-label">Выходной</span>
            )}

            <div className="hour-row-buttons">
              <button className="hour-link-btn" onClick={onToggleWorking}>
                {day.is_working ? "Выходной" : "Рабочий"}
              </button>
              <button className="hour-link-btn hour-link-btn-muted" onClick={handleReset}>
                Сбросить
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default Staff;