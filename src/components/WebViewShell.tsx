// Fallback untuk TypeScript. Metro memilih WebViewShell.native.tsx di Android/iOS
// dan WebViewShell.web.tsx di browser.
export default function WebViewShell() {
  return null;
}
