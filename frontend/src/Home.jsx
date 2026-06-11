import { useState } from "react";
import Staff from "./Staff";
import Services from "./Services";
import Schedule from "./Schedule";
import Appointments from "./Appointments";
import Clients from "./Clients";
import Stats from "./Stats";
const TABS = [
  { key: "appointments",   label: "Записи",        component: Appointments },
  { key: "staff",    label: "Сотрудники",    component: Staff },
  { key: "services", label: "Услуги",        component: Services },
  { key: "schedule", label: "График работы", component: Schedule },
  {key:"clients", label:'Клиенты', component: Clients},
  { key: "stats", label: "Статистика", component: Stats }
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("kanban");
  const [navOpen, setNavOpen] = useState(false);
  const ActiveComponent = TABS.find(t => t.key === activeTab)?.component ?? Appointments;

  const handleTabClick = (key) => {
    setActiveTab(key);
    setNavOpen(false);
  };

  return (
    <div className="crm">
      <button
        className="mobile-nav-toggle"
        onClick={() => setNavOpen(true)}
        aria-label="Открыть меню"
      >
        <span></span>
      </button>

      <div
        className={`sidebar-backdrop ${navOpen ? "open" : ""}`}
        onClick={() => setNavOpen(false)}
      />

      <aside className={`crm-sidebar ${navOpen ? "open" : ""}`}>
        <div className="crm-logo">Inboxio</div>
        <div className="crm-nav">
          {TABS.map(tab => (
            <NavItem
              key={tab.key}
              label={tab.label}
              active={activeTab === tab.key}
              onClick={() => handleTabClick(tab.key)}
            />
          ))}
        </div>
      </aside>

      <main className="crm-main">
        <ActiveComponent />
      </main>
    </div>
  );
}

function NavItem({ label, active, onClick }) {
  return (
    <div onClick={onClick} className={`crm-nav-item ${active ? "active" : ""}`}>
      {label}
    </div>
  );
}