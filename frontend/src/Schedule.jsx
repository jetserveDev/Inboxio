import { useEffect, useState } from "react";

const API = "http://localhost:3000";

const DAY_NAMES = {
    1: "Понедельник",
    2: "Вторник",
    3: "Среда",
    4: "Четверг",
    5: "Пятница",
    6: "Суббота",
    7: "Воскресенье",
};

const DAY_SHORT = {
    1: "Пн",
    2: "Вт",
    3: "Ср",
    4: "Чт",
    5: "Пт",
    6: "Сб",
    7: "Вс",
};

export default function Schedule() {
    const [hours, setHours] = useState(null);
    const [initialHours, setInitialHours] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [savedAt, setSavedAt] = useState(null);

    const loadHours = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${API}/business-hours`, { credentials: "include" });
            if (!res.ok) throw new Error("Не удалось загрузить график");
            const data = await res.json();
            // Нормализуем время в формат "HH:MM" (Postgres возвращает "HH:MM:SS")
            const normalized = data.map(d => ({
                ...d,
                open_time: d.open_time ? d.open_time.slice(0, 5) : "",
                close_time: d.close_time ? d.close_time.slice(0, 5) : "",
            }));
            setHours(normalized);
            setInitialHours(JSON.parse(JSON.stringify(normalized)));
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadHours(); }, []);

    const updateDay = (day_of_week, patch) => {
        setHours(prev => prev.map(d =>
            d.day_of_week === day_of_week ? { ...d, ...patch } : d
        ));
    };

    const toggleDay = (day_of_week) => {
        const day = hours.find(d => d.day_of_week === day_of_week);
        if (day.is_open) {
            updateDay(day_of_week, { is_open: false });
        } else {
            // Включаем: ставим часы по умолчанию, если их нет
            updateDay(day_of_week, {
                is_open: true,
                open_time: day.open_time || "10:00",
                close_time: day.close_time || "20:00",
            });
        }
    };

    const hasChanges = hours && initialHours &&
        JSON.stringify(hours) !== JSON.stringify(initialHours);

    const handleSave = async () => {
        setSaving(true);
        setError("");
        try {
            // Перед отправкой превращаем "HH:MM" обратно для бэка
            const payload = hours.map(d => ({
                day_of_week: d.day_of_week,
                is_open: d.is_open,
                open_time: d.is_open ? d.open_time : null,
                close_time: d.is_open ? d.close_time : null,
            }));

            const res = await fetch(`${API}/business-hours`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hours: payload }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Ошибка сохранения");

            const normalized = data.map(d => ({
                ...d,
                open_time: d.open_time ? d.open_time.slice(0, 5) : "",
                close_time: d.close_time ? d.close_time.slice(0, 5) : "",
            }));
            setHours(normalized);
            setInitialHours(JSON.parse(JSON.stringify(normalized)));
            setSavedAt(Date.now());
            setTimeout(() => setSavedAt(null), 2500);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setHours(JSON.parse(JSON.stringify(initialHours)));
    };

    // Применить часы первого открытого дня ко всем рабочим дням (быстрая настройка)
    const applyToAllOpen = () => {
        const firstOpen = hours.find(d => d.is_open);
        if (!firstOpen) return;
        setHours(prev => prev.map(d =>
            d.is_open
                ? { ...d, open_time: firstOpen.open_time, close_time: firstOpen.close_time }
                : d
        ));
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">График работы</h1>
                <div className="page-actions">
                    {hasChanges && (
                        <button className="btn-secondary" onClick={handleReset} disabled={saving}>
                            Отменить
                        </button>
                    )}
                    {hasChanges && (
                        <button className="btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? "Сохраняем..." : "Сохранить"}
                        </button>
                    )}
                    {!hasChanges && savedAt && (
                        <span className="saved-indicator">Сохранено ✓</span>
                    )}
                </div>
            </div>

            {error && <div className="error-banner">{error}</div>}

            {loading ? (
                <div className="spinner" />
            ) : (
                <div className="schedule-card">
                    <div className="schedule-hint">
                    <div className="schedule-hint-text">
                        Часы работы заведения. Графики сотрудников будут ограничены этими рамками.
                    </div>
                    {hours?.some(d => d.is_open) && (
                        <button className="apply-all-btn" onClick={applyToAllOpen}>
                        <CopyIcon />
                        Применить ко всем рабочим дням
                        </button>
                    )}
                    </div>

                    <div className="schedule-rows">
                        {hours.map(day => (
                            <DayRow
                                key={day.day_of_week}
                                day={day}
                                onToggle={() => toggleDay(day.day_of_week)}
                                onChangeOpen={(v) => updateDay(day.day_of_week, { open_time: v })}
                                onChangeClose={(v) => updateDay(day.day_of_week, { close_time: v })}
                            />
                        ))}
                    </div>
                </div>
            )}
            {!loading && <DateExceptionsSection />}
        </div>
    );
}
function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function DayRow({ day, onToggle, onChangeOpen, onChangeClose }) {
    return (
        <div className={`schedule-row ${day.is_open ? "" : "is-closed"}`}>
            <div className="schedule-day">
                <div className="schedule-day-short">{DAY_SHORT[day.day_of_week]}</div>
                <div className="schedule-day-full">{DAY_NAMES[day.day_of_week]}</div>
            </div>

            <button
                className={`day-toggle ${day.is_open ? "is-open" : ""}`}
                onClick={onToggle}
                aria-label={day.is_open ? "Закрыть день" : "Открыть день"}
            >
                <span className="day-toggle-thumb" />
            </button>

            {day.is_open ? (
                <div className="schedule-time-row">
                    <input
                        type="time"
                        className="input time-input"
                        value={day.open_time}
                        onChange={(e) => onChangeOpen(e.target.value)}
                    />
                    <span className="time-dash">—</span>
                    <input
                        type="time"
                        className="input time-input"
                        value={day.close_time}
                        onChange={(e) => onChangeClose(e.target.value)}
                    />
                </div>
            ) : (
                <div className="schedule-closed-label">Выходной</div>
            )}
        </div>
    );
}
const MONTHS_GEN = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function formatExceptionDate(isoDate) {
    // "2026-01-01" → "1 января 2026"
    const [y, m, d] = isoDate.split("-").map(Number);
    return `${d} ${MONTHS_GEN[m - 1]} ${y}`;
}

function DateExceptionsSection() {
    const [exceptions, setExceptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [isAdding, setIsAdding] = useState(false);

    const load = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${API}/date-exceptions`, { credentials: "include" });
            if (!res.ok) throw new Error("Не удалось загрузить особые дни");
            const data = await res.json();
            setExceptions(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleAdded = (newExc) => {
        setExceptions(prev => {
            // Если на эту дату уже было — заменяем (upsert)
            const without = prev.filter(e => e.exception_date !== newExc.exception_date);
            return [...without, newExc].sort((a, b) =>
                a.exception_date.localeCompare(b.exception_date)
            );
        });
        setIsAdding(false);
    };

    const handleDelete = async (id) => {
        try {
            const res = await fetch(`${API}/date-exceptions/${id}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) throw new Error("Не удалось удалить");
            setExceptions(prev => prev.filter(e => e.id !== id));
        } catch (e) {
            setError(e.message);
        }
    };

    // Прошедшие даты отделяем от будущих
    const todayISO = new Date().toISOString().split("T")[0];
    const upcoming = exceptions.filter(e => e.exception_date >= todayISO);
    const past = exceptions.filter(e => e.exception_date < todayISO);

    return (
        <div className="schedule-card exceptions-card">
            <div className="exceptions-header">
                <div>
                    <div className="exceptions-title">Особые дни</div>
                    <div className="exceptions-subtitle">
                        Праздники, выходные и дни с другими часами работы
                    </div>
                </div>
                {!isAdding && (
                    <button className="btn-secondary" onClick={() => setIsAdding(true)}>
                        + Добавить
                    </button>
                )}
            </div>

            {error && <div className="error-banner">{error}</div>}

            {isAdding && (
                <ExceptionForm
                    onAdded={handleAdded}
                    onCancel={() => setIsAdding(false)}
                />
            )}

            {loading ? (
                <div className="spinner" style={{ margin: "20px auto" }} />
            ) : exceptions.length === 0 && !isAdding ? (
                <div className="exceptions-empty">
                    Пока нет особых дней. Добавьте выходной или праздник.
                </div>
            ) : (
                <div className="exceptions-list">
                    {upcoming.map(exc => (
                        <ExceptionRow key={exc.id} exc={exc} onDelete={handleDelete} />
                    ))}
                    {past.length > 0 && (
                        <>
                            <div className="exceptions-past-label">Прошедшие</div>
                            {past.map(exc => (
                                <ExceptionRow
                                    key={exc.id}
                                    exc={exc}
                                    onDelete={handleDelete}
                                    isPast
                                />
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function ExceptionRow({ exc, onDelete, isPast }) {
    return (
        <div className={`exception-row ${isPast ? "is-past" : ""}`}>
            <div className="exception-date-badge">
                <div className="exception-date-day">{exc.exception_date.split("-")[2]}</div>
                <div className="exception-date-month">
                    {MONTHS_GEN[Number(exc.exception_date.split("-")[1]) - 1].slice(0, 3)}
                </div>
            </div>

            <div className="exception-info">
                <div className="exception-label">
                    {exc.label || (exc.is_open ? "Особый день" : "Выходной")}
                </div>
                <div className="exception-detail">
                    {formatExceptionDate(exc.exception_date)}
                    {" · "}
                    {exc.is_open ? (
                        <span className="exception-hours">
                            {exc.open_time?.slice(0, 5)}–{exc.close_time?.slice(0, 5)}
                        </span>
                    ) : (
                        <span className="exception-closed">Закрыто</span>
                    )}
                </div>
            </div>

            <button
                className="exception-delete"
                onClick={() => onDelete(exc.id)}
                aria-label="Удалить"
            >
                <TrashIcon />
            </button>
        </div>
    );
}

function ExceptionForm({ onAdded, onCancel }) {
    const [date, setDate] = useState("");
    const [isOpen, setIsOpen] = useState(false); // по умолчанию выходной
    const [openTime, setOpenTime] = useState("10:00");
    const [closeTime, setCloseTime] = useState("18:00");
    const [label, setLabel] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const canSubmit = date && !submitting && (!isOpen || (openTime && closeTime));

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError("");
        try {
            const res = await fetch(`${API}/date-exceptions`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    exception_date: date,
                    is_open: isOpen,
                    open_time: isOpen ? openTime : null,
                    close_time: isOpen ? closeTime : null,
                    label: label.trim() || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Ошибка сохранения");
            onAdded(data);
        } catch (e) {
            setError(e.message);
            setSubmitting(false);
        }
    };

    return (
        <div className="exception-form">
            {error && <div className="error-banner">{error}</div>}

            <div className="exception-form-grid">
                <div className="field">
                    <label className="field-label">Дата</label>
                    <input
                        type="date"
                        className="input"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        style={{ colorScheme: "dark" }}
                        autoFocus
                    />
                </div>

                <div className="field">
                    <label className="field-label">Название (необязательно)</label>
                    <input
                        className="input"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Новый год, Короткий день..."
                    />
                </div>
            </div>

            {/* Переключатель: выходной / особые часы */}
            <div className="exception-mode">
                <button
                    className={`exception-mode-btn ${!isOpen ? "active" : ""}`}
                    onClick={() => setIsOpen(false)}
                >
                    Выходной
                </button>
                <button
                    className={`exception-mode-btn ${isOpen ? "active" : ""}`}
                    onClick={() => setIsOpen(true)}
                >
                    Особые часы
                </button>
            </div>

            {isOpen && (
                <div className="exception-time-row">
                    <input
                        type="time"
                        className="input time-input"
                        value={openTime}
                        onChange={(e) => setOpenTime(e.target.value)}
                        style={{ colorScheme: "dark" }}
                    />
                    <span className="time-dash">—</span>
                    <input
                        type="time"
                        className="input time-input"
                        value={closeTime}
                        onChange={(e) => setCloseTime(e.target.value)}
                        style={{ colorScheme: "dark" }}
                    />
                </div>
            )}

            <div className="exception-form-actions">
                <button className="btn-secondary" onClick={onCancel} disabled={submitting}>
                    Отмена
                </button>
                <button className="btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
                    {submitting ? "Сохраняем..." : "Сохранить"}
                </button>
            </div>
        </div>
    );
}

function TrashIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
    );
}