export default function SplashScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white dark:bg-gray-950 z-50">
      <img src="/evoq_logo.png" alt="EVOQ" className="h-20 w-auto mb-6" />
      <p className="text-sm text-gray-400 mt-2">Rapports de visite</p>
      <p className="text-xs text-gray-300 mt-1">v1.0.0</p>
      <div className="mt-8">
        <div className="w-8 h-8 border-2 border-evoq border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}
