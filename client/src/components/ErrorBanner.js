export default function ErrorBanner({ message, onDismiss, onRetry }) {
  if (!message) return null;
  return (
    <div className="alert" role="alert">
      <span>{message}</span>
      <div className="alert-actions">
        {onRetry && <button className="btn btn-small" onClick={onRetry}>Retry</button>}
        {onDismiss && (
          <button className="alert-close" onClick={onDismiss} aria-label="Dismiss">×</button>
        )}
      </div>
    </div>
  );
}
