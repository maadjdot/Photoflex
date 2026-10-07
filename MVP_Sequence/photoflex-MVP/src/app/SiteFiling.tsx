export function SiteFiling() {
  const filingNumber = import.meta.env.VITE_ICP_FILING_NUMBER?.trim();
  if (!filingNumber) return null;
  return <footer className="site-filing">
    <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{filingNumber}</a>
  </footer>;
}
