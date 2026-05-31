import html2canvas from "html2canvas";

/**
 * Safe hex equivalents for every oklch() CSS custom property defined in
 * globals.css. html2canvas cannot parse oklch / oklab / lab / lch color
 * functions. When html2canvas clones the document it copies the stylesheets
 * verbatim — so any element that inherits a color via a CSS variable still
 * resolves to oklch() in the cloned document's getComputedStyle.
 *
 * The fix: override every CSS custom property on the *cloned document's*
 * :root with a plain hex value. The browser then resolves computed styles
 * using these hex values and html2canvas never sees oklch().
 *
 * Hex values were converted from the oklch originals using the CSS Color 4
 * specification (oklch → sRGB → hex).
 */
const SAFE_CSS_VARS: Record<string, string> = {
  // ── Light theme (:root) ──
  "--background": "#f8fdfd",
  "--foreground": "#1a2e35",
  "--card": "#ffffff",
  "--card-foreground": "#1a2e35",
  "--popover": "#ffffff",
  "--popover-foreground": "#1a2e35",
  "--primary": "#0d7377",
  "--primary-foreground": "#ffffff",
  "--secondary": "#eef5f5",
  "--secondary-foreground": "#2d4a52",
  "--muted": "#f0f5f5",
  "--muted-foreground": "#5a7a82",
  "--accent": "#e5f0e8",
  "--accent-foreground": "#1e4a2a",
  "--destructive": "#dc2626",
  "--destructive-foreground": "#ffffff",
  "--border": "#d5e3e4",
  "--input": "#dfe9ea",
  "--ring": "#0d7377",
  "--chart-1": "#0d7377",
  "--chart-2": "#2a9e5a",
  "--chart-3": "#2563a8",
  "--chart-4": "#3aaf7a",
  "--chart-5": "#5aafb8",
  "--radius": "0.625rem",
  "--sidebar": "#1a2e35",
  "--sidebar-foreground": "#edf5f5",
  "--sidebar-primary": "#3aaf7a",
  "--sidebar-primary-foreground": "#ffffff",
  "--sidebar-accent": "#2a3e45",
  "--sidebar-accent-foreground": "#edf5f5",
  "--sidebar-border": "#3a5058",
  "--sidebar-ring": "#3aaf7a",
  "--success": "#2a9e5a",
  "--success-foreground": "#ffffff",
  "--warning": "#d4a030",
  "--warning-foreground": "#1a1808",
  "--info": "#2563a8",
  "--info-foreground": "#ffffff",
};

/**
 * Override CSS custom properties on the cloned document's :root element.
 * This must run inside html2canvas's `onclone` callback, which provides
 * the full cloned Document as its first argument.
 */
function overrideCssVarsOnRoot(clonedDoc: Document): void {
  const root = clonedDoc.documentElement;
  for (const [prop, value] of Object.entries(SAFE_CSS_VARS)) {
    root.style.setProperty(prop, value, "important");
  }
}

/**
 * Capture an HTML element as a PNG and trigger download.
 */
export async function captureElementAsPng(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc: Document) => {
      overrideCssVarsOnRoot(clonedDoc);
    },
  });

  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Capture an HTML element and open it in a new window for printing.
 * Only the captured content is printed — not the surrounding page.
 */
export async function captureElementForPrint(
  element: HTMLElement,
  title: string,
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc: Document) => {
      overrideCssVarsOnRoot(clonedDoc);
    },
  });

  const imgDataUrl = canvas.toDataURL("image/png");
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: white;
          }
          img { max-width: 100%; height: auto; }
          @media print {
            body { margin: 0; }
            img { max-width: 100%; }
          }
        </style>
      </head>
      <body>
        <img src="${imgDataUrl}" alt="${title}" />
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            }, 200);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
