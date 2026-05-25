export const printPdfBlob = (blob: Blob) => {
  const blobUrl = URL.createObjectURL(blob);
  const printWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');
  if (!printWindow) return;
  const cleanup = () => {
    URL.revokeObjectURL(blobUrl);
  };
  printWindow.addEventListener('load', () => {
    printWindow.print();
    setTimeout(cleanup, 5000);
  });
};
