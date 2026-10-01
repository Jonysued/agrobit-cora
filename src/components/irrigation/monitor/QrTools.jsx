import React, { useEffect, useRef, useState } from 'react';
import { qrUrl, parseQr } from '@/services/irrigation/monitoringUtils';

export async function downloadDeviceQrs(devices) {
  const [{ default: QRCode }, { jsPDF }] = await Promise.all([import('qrcode'), import('jspdf')]);
  const pdf = new jsPDF();
  for (let i = 0; i < devices.length; i++) {
    if (i && i % 6 === 0) pdf.addPage();
    const d = devices[i], col = i % 2, row = Math.floor((i % 6) / 2), x = 10 + col * 98, y = 10 + row * 91;
    const image = await QRCode.toDataURL(qrUrl(d.qr_token), { width: 600, margin: 4, errorCorrectionLevel: 'M' });
    pdf.setDrawColor(210); pdf.roundedRect(x, y, 92, 85, 3, 3);
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.text(`${d.kind === 'well' ? 'POZO' : 'VALVULA'} · ${d.name}`, x + 46, y + 9, { align: 'center', maxWidth: 86 });
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.text(d.farm, x + 46, y + 17, { align: 'center' });
    pdf.addImage(image, 'PNG', x + 19, y + 20, 54, 54);
    pdf.setFontSize(8); pdf.text('Lucient · Escanear para registrar el estado', x + 46, y + 80, { align: 'center' });
  }
  pdf.save('Lucient-QRs-riego.pdf');
}
export function QrCard({ device }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(qrUrl(device.qr_token), { width: 400, margin: 4 })).then(v => { if (alive) setImage(v); }).catch(() => { if (alive) setError('No se pudo generar el QR.'); });
    return () => { alive = false; };
  }, [device.qr_token]);
  return <div className="text-center">{image && <img src={image} alt={`QR de ${device.name}`} className="mx-auto w-56" />}{error && <p role="alert">{error}</p>}<p className="break-all text-xs text-slate-500">{qrUrl(device.qr_token)}</p><p className="mt-2 text-sm">Escanear abre la ficha. El estado cambia al confirmar la acción.</p></div>;
}
export function QrScanner({ onFound, autoStart = false }) {
  const video = useRef(null), controls = useRef(null);
  const [camera, setCamera] = useState(autoStart), [error, setError] = useState(''), [manual, setManual] = useState('');
  const find = value => {
    const token = parseQr(value);
    if (!token) { setError('Ese QR no corresponde a un equipo de riego de Lucient.'); return false; }
    controls.current?.stop(); setCamera(false); onFound(token); return true;
  };
  useEffect(() => {
    if (!camera) return;
    let cancelled = false;
    const element = video.current;
    const start = async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserQRCodeReader();
        const ctl = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, element, (result, _error, ctl) => {
          if (result && !cancelled && find(result.getText())) ctl.stop();
        });
        if (cancelled) ctl.stop(); else controls.current = ctl;
      } catch { if (!cancelled) { setError('No se pudo abrir la cámara. Revisá el permiso, escaneá con la cámara del celular o pegá el enlace del QR.'); setCamera(false); } }
    };
    start();
    return () => { cancelled = true; controls.current?.stop(); if (element?.srcObject) element.srcObject.getTracks().forEach(t => t.stop()); };
  }, [camera]);
  return <div className="space-y-4"><p className="text-sm text-slate-600">Escaneá el QR del pozo o la válvula. También podés usar la cámara del celular para abrir el enlace directamente.</p>
    {camera ? <video ref={video} autoPlay playsInline muted className="w-full rounded-xl bg-slate-900" /> : <button onClick={() => { setError(''); setCamera(true); }} className="w-full rounded-xl bg-emerald-900 py-3 font-bold text-white">Abrir cámara</button>}
    {camera && <button onClick={() => setCamera(false)} className="text-sm underline">Detener cámara</button>}
    <form onSubmit={e => { e.preventDefault(); find(manual); }} className="flex gap-2"><input aria-label="Enlace o código QR" value={manual} onChange={e => setManual(e.target.value)} placeholder="Pegar enlace o código QR" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" /><button className="rounded-lg border px-3 py-2 text-sm font-bold">Abrir</button></form>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
