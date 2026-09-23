import React from "react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f7f2] px-4 py-10">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#79B14C]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-20 h-96 w-96 rounded-full bg-[#2B5541]/10 blur-3xl" />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/brand/lucient-logo-color.svg" alt="Lucient" className="mx-auto mb-7 h-24 w-auto" />
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="rounded-3xl border border-emerald-900/10 bg-white/90 p-8 shadow-[0_24px_70px_rgba(11,37,38,.10)] backdrop-blur">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
