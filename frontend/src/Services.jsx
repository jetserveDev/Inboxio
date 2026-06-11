import { useEffect, useState } from "react"

const API = 'http://localhost:3000'

export default function Services() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedService, setSelectedService] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchServices = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API}/services`, { credentials: 'include' })
      const data = await res.json()
      setServices(Array.isArray(data) ? data : data.services || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchServices() }, [])

  const handleCreated = () => {
    setIsModalOpen(false)
    fetchServices()
  }

  const handleUpdated = (updatedService) => {
    setServices(prev =>
      prev.map(s => s.id === updatedService.id ? updatedService : s)
    )
    setSelectedService(null)
  }

  // НОВОЕ: после удаления убираем услугу из списка
  const handleDeleted = (deletedId) => {
    setServices(prev => prev.filter(s => s.id !== deletedId))
    setSelectedService(null)
  }

  const getInitial = (name) => (name?.trim()?.[0] || '?').toUpperCase()

  return (
    <>
      <div>
        <div className="page-header">
          <h1 className="page-title">Услуги</h1>
          <div className="page-actions">
            <button onClick={() => setIsModalOpen(true)} className="btn-primary">
              + Добавить услугу
            </button>
          </div>
        </div>

        {loading ? (
          <div className="spinner" />
        ) : services.length === 0 ? (
          <div className="empty-state">
            <h3>Пока нет ни одной услуги</h3>
            <p>Нажмите «Добавить услугу», чтобы создать первую</p>
          </div>
        ) : (
          <div className="services-grid">
            {services.map((service, i) => (
              <div
                key={service.id}
                role="button"
                tabIndex={0}
                className="service-card"
                style={{ animationDelay: `${i * 40}ms` }}
                onClick={() => setSelectedService(service)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedService(service)
                  }
                }}
              >
                <div className="service-card__top">
                  <div className="service-card__icon">
                    {getInitial(service.name)}
                  </div>
                  <h3 className="service-card__name" title={service.name}>
                    {service.name}
                  </h3>
                </div>
                <div className="service-card__meta">
                  <span className="service-card__chip">
                    {service.duration_minutes} мин
                  </span>
                  <span className="service-card__price">
                    {service.price} ₽
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <CreateServiceModal
          onClose={() => setIsModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {selectedService && (
        <EditServiceModal
          service={selectedService}
          onClose={() => setSelectedService(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </>
  )
}

function EditServiceModal({ service, onClose, onUpdated, onDeleted }) {
  const [name, setName] = useState(service.name || "")
  const [duration, setDuration] = useState(service.duration_minutes || "")
  const [price, setPrice] = useState(service.price || "")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const busy = saving || deleting

  const hasChanges =
    name.trim() !== (service.name || "") ||
    Number(duration) !== Number(service.duration_minutes) ||
    Number(price) !== Number(service.price)

  const canSave = hasChanges && name.trim() && duration && price !== "" && !busy

  const handleSave = async () => {
    setSaving(true)
    setError("")
    try {
      const res = await fetch(`${API}/services/${service.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          duration: Number(duration),
          price: Number(price),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Ошибка сохранения")
      onUpdated?.(data)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Удалить услугу «${service.name}»?`)) return
    setDeleting(true)
    setError("")
    try {
      const res = await fetch(`${API}/services/${service.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Ошибка удаления")
      onDeleted?.(service.id)
    } catch (e) {
      setError(e.message)
      setDeleting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-service" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>

        <div className="service-modal-header">
          <div className="service-modal-icon">
            {(service.name?.trim()?.[0] || "?").toUpperCase()}
          </div>
          <div className="service-modal-heading">
            <div className="service-modal-eyebrow">Услуга</div>
            <h2 className="service-modal-name">{service.name}</h2>
          </div>
        </div>

        <div className="service-modal-body">
          {error && <div className="error-banner">{error}</div>}

          <div className="field">
            <label className="field-label">Название</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="service-modal-row">
            <div className="field">
              <label className="field-label">
                <ClockIcon />
                Длительность
              </label>
              <div className="input-affix-wrap">
                <input
                  className="input input-with-affix"
                  type="number"
                  min="1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  disabled={busy}
                />
                <span className="input-affix">мин</span>
              </div>
            </div>

            <div className="field">
              <label className="field-label">
                <RubleIcon />
                Цена
              </label>
              <div className="input-affix-wrap">
                <input
                  className="input input-with-affix"
                  type="number"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={busy}
                />
                <span className="input-affix">₽</span>
              </div>
            </div>
          </div>
        </div>

        <div className="service-modal-footer">
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
          <button className="btn-primary" onClick={handleSave} disabled={!canSave}>
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  )
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function RubleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21V5h6a4 4 0 0 1 0 8H6" />
      <line x1="6" y1="17" x2="14" y2="17" />
    </svg>
  )
}

function CreateServiceModal({ onClose, onCreated }) {
  const [serviceName, setServiceName] = useState('')
  const [duration, setDuration] = useState('')
  const [price, setPrice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const createService = async () => {
    if (!serviceName.trim() || !String(duration).trim() || !String(price).trim()) return
    try {
      setSubmitting(true)
      const res = await fetch(`${API}/services`, {
        method: "POST",
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: serviceName,
          duration: Number(duration),
          price: Number(price),
        }),
      })
      const data = await res.json()
      console.log(data.message)
      onCreated?.()
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Новая услуга</h2>

        <div className="field">
          <label className="field-label">Название</label>
          <input
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            className="input"
            placeholder="Стрижка, маникюр, диагностика..."
            autoFocus
          />
        </div>

        <div className="field">
          <label className="field-label">Длительность (минуты)</label>
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="input"
            type="number"
            min="1"
            placeholder="60"
          />
        </div>

        <div className="field">
          <label className="field-label">Цена (₽)</label>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="input"
            type="number"
            min="0"
            placeholder="1500"
          />
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </button>
          <button onClick={createService} className="btn-primary" disabled={submitting}>
            {submitting ? "Создание..." : "Создать"}
          </button>
        </div>
      </div>
    </div>
  )
}