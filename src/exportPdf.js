// Capture a DOM node and save it as a clean, single-page A4 PDF report.
// Libraries are dynamically imported so they stay out of the initial bundle.

export async function exportNodeToPdf(node, { title = "DataLence", filename = "datalence" } = {}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const headerH = 50;

  // Branded header band
  pdf.setFillColor(30, 64, 175); // --blue-dark
  pdf.rect(0, 0, pageW, headerH, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(String(title), margin, 32);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`DataLence  •  ${new Date().toLocaleString("en-IN")}`, pageW - margin, 32, { align: "right" });

  // Fit the captured chart within the remaining area, preserving aspect ratio
  const availW = pageW - margin * 2;
  const availH = pageH - headerH - margin * 2;
  const ratio = Math.min(availW / canvas.width, availH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  const x = (pageW - w) / 2;
  const y = headerH + margin + (availH - h) / 2;
  pdf.addImage(imgData, "PNG", x, y, w, h);

  pdf.save(`${filename}.pdf`);
}
