export default function Modal({
  isOpen,
  onClose,
  title,
  message,
  type = "info",
  onConfirm,
  confirmText = "OK",
  showCancel = false,
  onCancel,
  cancelText = "Отмена",
}) {
  if (!isOpen) return null;

  const icons = {
    info: "💡",
    success: "✅",
    error: "❌",
    warning: "⚠️",
    confirm: "❓",
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      if (showCancel && onCancel) onCancel();
      else onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      if (showCancel && onCancel) onCancel();
      else onClose();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabIndex={-1}
    >
      <div className={`modal-card ${type}`}>
        <div className="modal-header">
          <span className="modal-icon" aria-hidden="true">
            {icons[type]}
          </span>
          <h3 id="modal-title" className="modal-title">
            {title}
          </h3>
        </div>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          {showCancel && onCancel && (
            <button
              className="modal-btn secondary"
              onClick={onCancel}
              type="button"
            >
              {cancelText}
            </button>
          )}
          <button
            className="modal-btn primary"
            onClick={onConfirm || onClose}
            type="button"
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}