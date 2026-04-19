// Navigation helper to avoid Next.js router initialization issues
export function navigate(href: string) {
  window.location.href = href;
}

// For use in onClick handlers
export function createNavigateHandler(href: string) {
  return (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    window.location.href = href;
  };
}
