export default function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="stat-card">
      <div className="stat-card-head">
        <span>{label}</span>
        {Icon && <Icon size={16} />}
      </div>
      <div className="stat-card-value">{value}</div>
    </div>
  );
}
