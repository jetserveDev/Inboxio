import { useState } from "react"

function Subscription() {
    const [plan, setPlan] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handlePayment = async () => {
        if (!plan) {
            setError('Выберите тариф')
            return
        }
        setLoading(true)
        setError('')
        try {
            const res = await fetch('http://localhost:3000/subscription/create-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ plan })
            })
            const data = await res.json()

            if (!res.ok) {
                setError(data.message || 'Ошибка при создании платежа')
                return
            }

            // Редиректим на страницу ЮКассы
            window.location.href = data.confirmation_url

        } catch (err) {
            setError('Ошибка сервера')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="subs-wrapper">
            <div className="pricing-box">
                <h1 className="pricing-title">Выберите тариф</h1>
                <p className="pricing-subtitle">Подключите Inboxio для вашего бизнеса</p>
                <div className="main-subs-box">
                    <div
                        className={plan === 'month' ? 'sub active' : 'sub'}
                        onClick={() => setPlan('month')}
                    >
                        <h2>Месяц</h2>
                        <p className="price">900 ₽</p>
                        <span className="desc">Идеально для старта</span>
                    </div>
                    <div
                        className={plan === 'threemonth' ? 'sub active popular' : 'sub'}
                        onClick={() => setPlan('threemonth')}
                    >
                        <div className="badge">Популярный</div>
                        <h2>3 месяца</h2>
                        <p className="price">2 500 ₽</p>
                        <span className="desc">Экономия 20%</span>
                    </div>
                    <div
                        className={plan === 'year' ? 'sub active' : 'sub'}
                        onClick={() => setPlan('year')}
                    >
                        <h2>Год</h2>
                        <p className="price">7 000 ₽</p>
                        <span className="desc">Максимальная выгода</span>
                    </div>
                </div>

                {error && <p className="error-msg">{error}</p>}

                <button
                    className="pay-btn"
                    onClick={handlePayment}
                    disabled={loading}
                >
                    {loading ? 'Загрузка...' : 'Оплатить'}
                </button>
            </div>
        </div>
    )
}

export default Subscription