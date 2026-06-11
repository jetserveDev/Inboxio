import { useState, useEffect } from "react";

const API = "http://localhost:3000";

export default function CreateAppointmentModal({ onClose, onCreated }) {
  const [customers, setCustomers] = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [staffServices, setStaffServices] = useState({});
  const [loadingData, setLoadingData] = useState(true);
  const [customerId, setCustomerId] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [staffId, setStaffId] = useState(null);
  const [date, setDate] = useState(getToday());
  const [time, setTime] = useState("");

  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsReason, setSlotsReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [newCustomerName, setNewCustomerName] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoadingData(true);
      try {
        const [customersRes, servicesRes, staffRes] = await Promise.all([
          fetch(`${API}/customers`, { credentials: "include" }),
          fetch(`${API}/services`, { credentials: "include" }),
          fetch(`${API}/staff`, { credentials: "include" }),
        ]);
        const customersData = await customersRes.json();
        const servicesData = await servicesRes.json();
        const staffData = await staffRes.json();

        setCustomers(Array.isArray(customersData) ? customersData : []);
        setAllServices(Array.isArray(servicesData) ? servicesData : []);
        setAllStaff(
          (Array.isArray(staffData) ? staffData : []).filter(s => s.is_active !== false)
        );

        const staffList = Array.isArray(staffData) ? staffData : [];
        const servicesMap = {};
        await Promise.all(
          staffList.map(async (s) => {
            const res = await fetch(`${API}/staff/${s.id}/services`, {
              credentials: "include",
            });
            servicesMap[s.id] = res.ok ? await res.json() : [];
          })
        );
        setStaffServices(servicesMap);
      } catch (e) {
        setError("Не удалось загрузить данные");
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, []);
  const handleCreateCustomer = async () => {
  // Берём то, что введено в поиске, как телефон
  const phone = customerSearch.trim();
  if (!phone) return;

  setCreatingCustomer(true);
  setError("");
  try {
    const res = await fetch(`${API}/customers/find-or-create`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phone,
        name: newCustomerName.trim() || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Не удалось создать клиента");

    const customer = data.customer;
    setCustomers((prev) => {
      if (prev.find((c) => c.id === customer.id)) return prev;
      return [customer, ...prev];
    });
    setCustomerId(customer.id);
    setCustomerSearch("");
    setNewCustomerName("");
  } catch (e) {
    setError(e.message);
  } finally {
    setCreatingCustomer(false);
  }
};

  
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !submitting && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);


  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q)
    );
  });

  // Какие мастера умеют все выбранные услуги
  const availableStaff = allStaff.filter((s) => {
    if (selectedServiceIds.length === 0) return true;
    const masterServices = staffServices[s.id] || [];
    return selectedServiceIds.every((sid) => masterServices.includes(sid));
  });

  // Суммарная длительность и цена выбранных услуг
  const selectedServices = allServices.filter((s) =>
    selectedServiceIds.includes(s.id)
  );
  const totalDuration = selectedServices.reduce(
    (sum, s) => sum + s.duration_minutes,
    0
  );
  const totalPrice = selectedServices.reduce(
    (sum, s) => sum + parseFloat(s.price),
    0
  );

  // Если выбранный мастер больше не подходит под услуги — сбрасываем
  useEffect(() => {
    if (staffId && !availableStaff.find((s) => s.id === staffId)) {
      setStaffId(null);
    }
  }, [selectedServiceIds]); // eslint-disable-line

  // Загрузка свободных слотов — при изменении мастера, даты или длительности
  useEffect(() => {
    if (!staffId || !date || totalDuration === 0) {
      setSlots([]);
      setSlotsReason("");
      return;
    }

    const loadSlots = async () => {
      setLoadingSlots(true);
      setSlotsReason("");
      setTime(""); // сбрасываем выбранное время при смене параметров
      try {
        const res = await fetch(
          `${API}/staff/${staffId}/free-slots?date=${date}&duration=${totalDuration}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (res.ok) {
          setSlots(data.slots || []);
          if (!data.slots || data.slots.length === 0) {
            setSlotsReason(data.reason || "Нет свободного времени на эту дату");
          }
        } else {
          setSlotsReason(data.message || "Не удалось загрузить время");
        }
      } catch (e) {
        setSlotsReason("Не удалось загрузить свободное время");
      } finally {
        setLoadingSlots(false);
      }
    };

    loadSlots();
  }, [staffId, date, totalDuration]);

  const toggleService = (serviceId) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const canSubmit =
    customerId &&
    selectedServiceIds.length > 0 &&
    staffId &&
    date &&
    time &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const startsAt = `${date}T${time}:00`;

      const res = await fetch(`${API}/appointments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          staff_id: staffId,
          starts_at: startsAt,
          service_ids: selectedServiceIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Ошибка создания записи");
      onCreated();
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={submitting ? undefined : onClose}>
      <div className="modal modal-appointment" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>

        <h2 className="modal-title" style={{ padding: "24px 24px 0" }}>
          Новая запись
        </h2>

        {loadingData ? (
          <div className="spinner" style={{ margin: "40px auto" }} />
        ) : (
          <div className="appointment-form">
            {error && <div className="error-banner">{error}</div>}

        {/* Шаг 1: Клиент */}
        <div className="field">
          <label className="field-label">Клиент</label>
          {customerId ? (
            <div className="selected-customer">
              <span>
                {customers.find((c) => c.id === customerId)?.name ||
                  customers.find((c) => c.id === customerId)?.phone}
              </span>
              <button
                className="btn-ghost"
                onClick={() => {
                  setCustomerId(null);
                  setCustomerSearch("");
                  setNewCustomerName("");
                }}
              >
                Изменить
              </button>
            </div>
          ) : (
            <>
              <input
                className="input"
                placeholder="Поиск по имени или телефону..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              {customerSearch.trim() && (
                <div className="customer-dropdown">
                  {filteredCustomers.length === 0 ? (
                    // Никто не найден — предлагаем создать
                    <div className="customer-create-block">
                      <div className="customer-create-hint">
                        Клиент не найден. Создать нового?
                      </div>
                      <input
                        className="input"
                        placeholder="Имя (необязательно)"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                      />
                      <button
                        className="btn-primary"
                        onClick={handleCreateCustomer}
                        disabled={creatingCustomer}
                        style={{ width: "100%" }}
                      >
                        {creatingCustomer
                          ? "Создаём..."
                          : `Создать клиента ${customerSearch.trim()}`}
                      </button>
                    </div>
                  ) : (
                    <>
                      {filteredCustomers.slice(0, 6).map((c) => (
                        <div
                          key={c.id}
                          className="customer-dropdown-item"
                          onClick={() => {
                            setCustomerId(c.id);
                            setCustomerSearch("");
                          }}
                        >
                          <span className="cdi-name">{c.name || "Без имени"}</span>
                          <span className="cdi-phone">{c.phone}</span>
                        </div>
                      ))}
                      {/* Даже если кто-то найден, даём создать нового по этому номеру */}
                      <div className="customer-create-divider">
                        <button
                          className="customer-create-link"
                          onClick={handleCreateCustomer}
                          disabled={creatingCustomer}
                        >
                          + Создать нового по «{customerSearch.trim()}»
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

            {/* Шаг 2: Услуги */}
            <div className="field">
              <label className="field-label">Услуги</label>
              {allServices.length === 0 ? (
                <div className="services-empty">Сначала создайте услуги</div>
              ) : (
                <div className="appointment-services-list">
                  {allServices.map((s) => {
                    const checked = selectedServiceIds.includes(s.id);
                    return (
                      <div
                        key={s.id}
                        className={`service-check-row ${checked ? "checked" : ""}`}
                        onClick={() => toggleService(s.id)}
                      >
                        <span className="service-check-box">
                          <CheckIcon />
                        </span>
                        <span className="service-check-name">{s.name}</span>
                        <span className="service-check-meta">
                          {s.duration_minutes} мин · {s.price} ₽
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Шаг 3: Мастер */}
            <div className="field">
              <label className="field-label">Мастер</label>
              {selectedServiceIds.length === 0 ? (
                <div className="field-hint">Сначала выберите услуги</div>
              ) : availableStaff.length === 0 ? (
                <div className="services-empty">
                  Нет мастеров, выполняющих все выбранные услуги
                </div>
              ) : (
                <div className="staff-select-list">
                  {availableStaff.map((s) => (
                    <div
                      key={s.id}
                      className={`staff-select-item ${staffId === s.id ? "selected" : ""}`}
                      onClick={() => setStaffId(s.id)}
                    >
                      <div className="staff-select-avatar">
                        {(s.name || s.username || "?")[0]?.toUpperCase()}
                      </div>
                      <span>{s.name || s.username}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Шаг 4: Дата */}
            <div className="field">
              <label className="field-label">Дата</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={getToday()}
                style={{ colorScheme: "dark" }}
              />
            </div>

            {/* Шаг 5: Свободное время */}
            {staffId && totalDuration > 0 && (
              <div className="field">
                <label className="field-label">Свободное время</label>
                {loadingSlots ? (
                  <div className="spinner" style={{ margin: "12px auto" }} />
                ) : slots.length === 0 ? (
                  <div className="services-empty">
                    {slotsReason || "Нет свободного времени"}
                  </div>
                ) : (
                  <div className="time-slots">
                    {slots.map((slot) => (
                      <button
                        key={slot}
                        className={`time-slot ${time === slot ? "selected" : ""}`}
                        onClick={() => setTime(slot)}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Итого */}
            {selectedServiceIds.length > 0 && (
              <div className="appointment-summary">
                <div className="summary-row">
                  <span>Длительность</span>
                  <strong>{formatDuration(totalDuration)}</strong>
                </div>
                <div className="summary-row">
                  <span>Стоимость</span>
                  <strong>{totalPrice} ₽</strong>
                </div>
                {time && (
                  <div className="summary-row">
                    <span>Окончание</span>
                    <strong>{calcEndTime(time, totalDuration)}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="appointment-footer">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? "Создаём..." : "Создать запись"}
          </button>
        </div>
      </div>
    </div>
  );
}

// === Утилиты ===

function getToday() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

function formatDuration(minutes) {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

function calcEndTime(startTime, durationMin) {
  if (!startTime || !durationMin) return "—";
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + durationMin;
  const endH = Math.floor(total / 60) % 24;
  const endM = total % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}