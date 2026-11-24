import React from 'react';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Docto.id UI error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#E5EBF4] dark:bg-[#09090B] text-slate-900 dark:text-zinc-100">
          <div className="max-w-md w-full space-y-4 text-center">
            <h1 className="h2">Terjadi Gangguan</h1>
            <p className="text-base text-slate-600 dark:text-zinc-400">
              Tampilan mengalami kendala tak terduga. Data lokal tetap aman. Muat ulang untuk melanjutkan.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] px-5 py-3 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-base cursor-pointer"
            >
              Muat Ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
