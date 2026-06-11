import { useEffect, useState } from "react";
import CreateAppointmentModal from "./assets/CreateAppointmentModal";

const API = "http://localhost:3000";
const HOUR_HEIGHT = 70;

export default function Appointments() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [date, setDate] = useState(new Date());
  const [staff, setStaff] = useState([]);
  const [businessHours, setBusinessHours] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [visibleStaffIds, setVisibleStaffIds] = useState(new Set()); // null = все
  const [loading, setLoading] = useState(true);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [error, setError] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [staffRes, hoursRes] = await Promise.all([
          fetch(`${API}/staff`, { credentials: "include" }),
          fetch(`${API}/business-hours`, { credentials: "include" }),
        ]);
        if (!staffRes.ok) throw new Error("Не удалось загрузить мастеров");
        if (!hoursRes.ok) throw new Error("Не удалось загрузить часы работы");
        const staffData = await staffRes.json();
        const hoursData = await hoursRes.json();
        const activeStaff = (Array.isArray(staffData) ? staffData : []).filter(
          s => s.is_active !== false
        );
        setStaff(activeStaff);
        setBusinessHours(Array.isArray(hoursData) ? hoursData : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Загрузка записей при смене даты
  const loadAppointments = async () => {
    setLoadingAppts(true);
    try {
      const from = formatDateISO(date) + "T00:00:00";
      const to = formatDateISO(addDays(date, 1)) + "T00:00:00";
      const res = await fetch(
        `${API}/appointments?from=${from}&to=${to}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setAppointments(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      // тихо — сетка всё равно отрисуется
    } finally {
      setLoadingAppts(false);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, [date]); // eslint-disable-line

  // День недели (ISO 1-7)
  const jsDay = date.getDay();
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;
  const todayHours = businessHours.find(h => h.day_of_week === dayOfWeek);
  const isOpen = todayHours?.is_open;
  const openTime = todayHours?.open_time?.slice(0, 5);
  const closeTime = todayHours?.close_time?.slice(0, 5);

  const isToday = isSameDay(date, new Date());

  const goPrev = () => setDate(d => addDays(d, -1));
  const goNext = () => setDate(d => addDays(d, 1));
  const goToday = () => setDate(new Date());

  // Какие мастера показаны: null = все
  const shownStaff = visibleStaffIds === null
    ? staff
    : staff.filter(s => visibleStaffIds.has(s.id));

  const toggleStaff = (id) => {
    setVisibleStaffIds(prev => {
      const base = prev === null ? new Set(staff.map(s => s.id)) : new Set(prev);
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return base;
    });
  };

  const showAll = () => setVisibleStaffIds(null);
  const hideAll = () => setVisibleStaffIds(new Set());

  const isStaffVisible = (id) =>
    visibleStaffIds === null || visibleStaffIds.has(id);

  return (
    <>
      <div className="page-header">
        <div className="page-title">Записи</div>
        <div className="page-actions">
          <button onClick={() => setIsModalOpen(true)} className="btn-primary">
            + Добавить запись
          </button>
        </div>
      </div>

      {/* Навигация по дням */}
      <div className="calendar-nav">
        <div className="calendar-nav-left">
          <button className="cal-nav-arrow" onClick={goPrev} aria-label="Предыдущий день">‹</button>
          <button className="cal-nav-arrow" onClick={goNext} aria-label="Следующий день">›</button>

          {/* Кнопка календаря + поповер */}
          <div className="cal-picker-wrap">
            <button
              className="cal-nav-arrow cal-picker-btn"
              onClick={() => setDatePickerOpen(o => !o)}
              aria-label="Выбрать дату"
            >
              <CalendarIcon />
            </button>
            {datePickerOpen && (
              <DatePickerPopover
                selected={date}
                onSelect={(d) => {
                  setDate(d);
                  setDatePickerOpen(false);
                }}
                onClose={() => setDatePickerOpen(false)}
              />
            )}
          </div>

          <button className="btn-secondary cal-today-btn" onClick={goToday} disabled={isToday}>
            Сегодня
          </button>
        </div>
        <div className="calendar-nav-date">
          {formatDateFull(date)}
          {isToday && <span className="cal-today-badge">сегодня</span>}
        </div>
      </div>

      {/* Фильтр мастеров */}
      {!loading && staff.length > 0 && (
        <div className="staff-filter">
          <div className="staff-filter-chips">
            {staff.map(s => (
              <button
                key={s.id}
                className={`staff-chip ${isStaffVisible(s.id) ? "active" : ""}`}
                onClick={() => toggleStaff(s.id)}
              >
                <span className="staff-chip-dot" />
                {s.name || s.username}
              </button>
            ))}
          </div>
          <div className="staff-filter-actions">
            <button className="staff-filter-link" onClick={showAll}>Все</button>
            <span className="staff-filter-sep">·</span>
            <button className="staff-filter-link" onClick={hideAll}>Снять все</button>
          </div>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="spinner" />
      ) : staff.length === 0 ? (
        <div className="empty-state">
          <h3>Нет мастеров</h3>
          <p>Добавьте сотрудников, чтобы вести расписание</p>
        </div>
      ) : !isOpen ? (
        <div className="empty-state">
          <h3>Заведение закрыто</h3>
          <p>{formatDateFull(date)} — нерабочий день</p>
        </div>
      ) : shownStaff.length === 0 ? (
        <div className="empty-state">
          <h3>Не выбрано ни одного мастера</h3>
          <p>Включите мастеров в фильтре выше</p>
        </div>
      ) : (
        <CalendarGrid
          staff={shownStaff}
          appointments={appointments}
          openTime={openTime}
          closeTime={closeTime}
          onApptClick={setSelectedAppt}
        />
      )}

      {isModalOpen && (
        <CreateAppointmentModal
          onClose={() => setIsModalOpen(false)}
          onCreated={() => {
            setIsModalOpen(false);
            loadAppointments();
          }}
        />
      )}

      {selectedAppt && (
        <AppointmentDetailsModal
          appointment={selectedAppt}
          onClose={() => setSelectedAppt(null)}
          onChanged={() => {
            setSelectedAppt(null);
            loadAppointments();
          }}
        />
      )}
    </>
  );
}

function DatePickerPopover({ selected, onSelect, onClose }) {
  const [viewMonth, setViewMonth] = useState(
    new Date(selected.getFullYear(), selected.getMonth(), 1)
  );

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onClickOutside = (e) => {
      if (!e.target.closest(".cal-picker-wrap")) onClose();
    };
    window.addEventListener("keydown", onKey);
    setTimeout(() => document.addEventListener("click", onClickOutside), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClickOutside);
    };
  }, [onClose]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  let startWeekday = firstDay.getDay();
  startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));

  const isSelectedDay = (d) =>
    selected.getFullYear() === year &&
    selected.getMonth() === month &&
    selected.getDate() === d;

  const isTodayDay = (d) =>
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === d;

  return (
    <div className="date-picker-popover">
      <div className="dp-header">
        <button className="dp-nav" onClick={prevMonth} aria-label="Предыдущий месяц">‹</button>
        <div className="dp-month-label">
          {MONTHS_NOM[month]} {year}
        </div>
        <button className="dp-nav" onClick={nextMonth} aria-label="Следующий месяц">›</button>
      </div>

      <div className="dp-weekdays">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(w => (
          <div key={w} className="dp-weekday">{w}</div>
        ))}
      </div>

      <div className="dp-grid">
        {cells.map((d, i) => (
          d === null ? (
            <div key={`empty-${i}`} className="dp-cell dp-cell-empty" />
          ) : (
            <button
              key={d}
              className={`dp-cell ${isSelectedDay(d) ? "dp-selected" : ""} ${isTodayDay(d) ? "dp-today" : ""}`}
              onClick={() => onSelect(new Date(year, month, d))}
            >
              {d}
            </button>
          )
        ))}
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CalendarGrid({ staff, appointments, openTime, closeTime, onApptClick }) {
  const startMin = timeToMinutes(openTime);
  const endMin = timeToMinutes(closeTime);
  const totalHeight = ((endMin - startMin) / 60) * HOUR_HEIGHT;
  const pxPerMin = HOUR_HEIGHT / 60;

  const firstHour = Math.ceil(startMin / 60);
  const lastHour = Math.floor(endMin / 60);
  const hourMarks = [];
  for (let h = firstHour; h <= lastHour; h++) {
    hourMarks.push({ hour: h, top: ((h * 60 - startMin) / 60) * HOUR_HEIGHT });
  }

  const apptsByStaff = new Map();
  for (const a of appointments) {
    if (a.status === "cancelled") continue;
    if (!apptsByStaff.has(a.staff_id)) apptsByStaff.set(a.staff_id, []);
    apptsByStaff.get(a.staff_id).push(a);
  }

  return (
    <div className="calendar">
      <div className="calendar-inner">
        <div className="calendar-head">
          <div className="calendar-corner" />
          {staff.map(s => (
            <div key={s.id} className="calendar-head-col">
              <div className="calendar-master-avatar">
                {(s.name || s.username || "?")[0]?.toUpperCase()}
              </div>
              <span className="calendar-master-name">{s.name || s.username}</span>
            </div>
          ))}
        </div>

        <div className="calendar-body" style={{ height: totalHeight + "px" }}>
          <div className="calendar-axis">
            {hourMarks.map(({ hour, top }) => (
              <div key={hour} className="calendar-axis-label" style={{ top: top + "px" }}>
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          <div className="calendar-cols">
            {hourMarks.map(({ hour, top }) => (
              <div key={hour} className="calendar-line" style={{ top: top + "px" }} />
            ))}

            {staff.map(s => {
              const appts = apptsByStaff.get(s.id) || [];
              return (
                <div key={s.id} className="calendar-col">
                 {appts.map(a => {
  const aStart = toMinutesOfDay(a.starts_at);
  const aEnd = toMinutesOfDay(a.ends_at);
  const top = (aStart - startMin) * pxPerMin;
  const rawHeight = (aEnd - aStart) * pxPerMin;
  const height = Math.max(rawHeight, 22); // минимум 22px, чтобы блок был кликабелен

  // Режим вёрстки по высоте
  const isCompact = height < 45;   // короткий — всё в строку
  const isMedium = height >= 34 && height < 56;

  return (
    <div
      key={a.id}
      className={`appt-block status-${a.status} ${isCompact ? "appt-compact" : ""}`}
      style={{ top: top + "px", height: height + "px" }}
      title={`${a.customer_name || "Без имени"} · ${formatTimeRange(a.starts_at, a.ends_at)}${a.services?.length ? " · " + a.services.map(s => s.name).join(", ") : ""}`}
      onClick={() => onApptClick(a)}
    >
      {isCompact ? (
        <div className="appt-compact-row">
          <span className="appt-time">{formatTimeRange(a.starts_at, a.ends_at)}</span>
          <span className="appt-client-inline">{a.customer_name || "Без имени"}</span>
          <span className="appt-services" >{a.services.map(s => s.name).join(", ")}</span>
        </div>
      ) : (
        <>
          <div className="appt-time">
            {formatTimeRange(a.starts_at, a.ends_at)}
          </div>
          <div className="appt-client">
            {a.customer_name || "Без имени"}
          </div>
          {!isMedium && a.services?.length > 0 && (
            <div className="appt-services">
              {a.services.map(srv => srv.name).join(", ")}
            </div>
          )}
        </>
      )}
    </div>
  );
})}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABELS = {
  scheduled: "Запланирована",
  completed: "Выполнена",
  cancelled: "Отменена",
  no_show: "Не пришёл",
};

function AppointmentDetailsModal({ appointment, onClose, onChanged }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !working && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, working]);

  const a = appointment;
  const currentStatus = a.status;

  const changeStatus = async (newStatus) => {
    setWorking(true);
    setError("");
    try {
      const res = await fetch(`${API}/appointments/${a.id}/status`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Ошибка");
      onChanged();
    } catch (e) {
      setError(e.message);
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    setWorking(true);
    setError("");
    try {
      const res = await fetch(`${API}/appointments/${a.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Ошибка удаления");
      }
      onChanged();
    } catch (e) {
      setError(e.message);
      setWorking(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={working ? undefined : onClose}>
      <div className="modal modal-appt-details" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Закрыть">×</button>

        <div className="appt-details-header">
          <div className="appt-details-avatar">
            {(a.customer_name || a.customer_phone || "?")[0]?.toUpperCase()}
          </div>
          <div className="appt-details-heading">
            <h2 className="appt-details-name">{a.customer_name || "Без имени"}</h2>
            <a href={`tel:${a.customer_phone}`} className="appt-details-phone">
              {a.customer_phone}
            </a>
          </div>
          <span className={`appt-status-badge status-${currentStatus}`}>
            {STATUS_LABELS[currentStatus]}
          </span>
        </div>

        <div className="appt-details-body">
          {error && <div className="error-banner">{error}</div>}

          <div className="appt-details-row">
            <span className="appt-details-key">Время</span>
            <span className="appt-details-value">
              {formatTimeRange(a.starts_at, a.ends_at)}
              {" · "}
              {formatDuration(a.total_duration)}
            </span>
          </div>
          <div className="appt-details-row">
            <span className="appt-details-key">Мастер</span>
            <span className="appt-details-value">{a.staff_name || a.staff_username}</span>
          </div>

          <div className="appt-details-services">
            <div className="appt-details-key">Услуги</div>
            {a.services?.map((s, i) => (
              <div key={i} className="appt-service-line">
                <span>{s.name}</span>
                <span className="appt-service-price">
                  {s.duration} мин · {s.price} ₽
                </span>
              </div>
            ))}
            <div className="appt-service-total">
              <span>Итого</span>
              <span>{a.total_price} ₽</span>
            </div>
          </div>

          {a.notes && (
            <div className="appt-details-row">
              <span className="appt-details-key">Заметка</span>
              <span className="appt-details-value">{a.notes}</span>
            </div>
          )}
        </div>

        <div className="appt-details-actions">
          {!confirmDelete ? (
            <>
              {currentStatus === "scheduled" && (
                <div className="appt-status-buttons">
                  <button
                    className="btn-status btn-status-done"
                    onClick={() => changeStatus("completed")}
                    disabled={working}
                  >
                    Выполнена
                  </button>
                  <button
                    className="btn-status btn-status-noshow"
                    onClick={() => changeStatus("no_show")}
                    disabled={working}
                  >
                    Не пришёл
                  </button>
                  <button
                    className="btn-status btn-status-cancel"
                    onClick={() => changeStatus("cancelled")}
                    disabled={working}
                  >
                    Отменить
                  </button>
                </div>
              )}

              {currentStatus !== "scheduled" && (
                <button
                  className="btn-secondary"
                  onClick={() => changeStatus("scheduled")}
                  disabled={working}
                >
                  Вернуть в запланированные
                </button>
              )}

              <button
                className="btn-ghost appt-delete-trigger"
                onClick={() => setConfirmDelete(true)}
                disabled={working}
              >
                Удалить запись
              </button>
            </>
          ) : (
            <div className="appt-delete-confirm">
              <span>Удалить запись безвозвратно?</span>
              <div className="appt-delete-confirm-btns">
                <button
                  className="btn-secondary"
                  onClick={() => setConfirmDelete(false)}
                  disabled={working}
                >
                  Отмена
                </button>
                <button
                  className="btn-danger"
                  onClick={handleDelete}
                  disabled={working}
                >
                  {working ? "Удаляем..." : "Удалить"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// === Утилиты ===

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const MONTHS_NOM = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const WEEKDAYS = [
  "воскресенье", "понедельник", "вторник", "среда",
  "четверг", "пятница", "суббота",
];

function formatDateFull(date) {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${WEEKDAYS[date.getDay()]}`;
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function toMinutesOfDay(timestamp) {
  const timePart = timestamp.split("T")[1] || "00:00:00";
  const [h, m] = timePart.split(":").map(Number);
  return h * 60 + m;
}

function formatTimeRange(start, end) {
  const s = (start.split("T")[1] || "").slice(0, 5);
  const e = (end.split("T")[1] || "").slice(0, 5);
  return `${s}–${e}`;
}

function formatDuration(minutes) {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}