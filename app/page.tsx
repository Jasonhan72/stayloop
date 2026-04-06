import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">S</div>
          <span className="text-lg font-bold text-blue-600">Stayloop</span>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2">Sign In</Link>
          <Link href="/dashboard" className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Get Started</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-6">
          Screen Tenants Smarter<br />
          <span className="text-blue-600">with AI</span>
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Ontario&apos;s most powerful tenant screening platform. AI-powered scoring, LTB record checks, and instant analysis — built for landlords.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/dashboard" className="bg-blue-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-blue-700">
            Start Screening Free
          </Link>
          <Link href="/dashboard" className="bg-white text-gray-700 px-8 py-4 rounded-xl text-lg font-semibold border border-gray-300 hover:bg-gray-50">
            View Demo
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-3 gap-8">
          {[
            { icon: '🤖', title: 'AI Scoring', desc: 'Claude AI analyzes every application and gives a risk score with detailed reasoning' },
            { icon: '⚖️', title: 'LTB Record Check', desc: 'Automatically searches Ontario LTB and court records for eviction history' },
            { icon: '🔒', title: 'PIPEDA Compliant', desc: 'Built-in consent forms and data handling that meet Ontario privacy law' },
          ].map(f => (
            <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
