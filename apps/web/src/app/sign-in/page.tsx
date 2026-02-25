const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50">
      <div className="w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary-600 text-white text-sm font-bold flex items-center justify-center">
            CA
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              AI for Accountants
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Search documents, emails &amp; spreadsheets — get citation-backed
              answers.
            </p>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <p className="text-sm text-gray-600 text-center font-medium">
            Sign in with your Google Workspace account
          </p>

          <a
            href={`${API_BASE}/api/auth/google`}
            className="flex items-center justify-center gap-3 w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm"
          >
            {/* Google logo */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                fill="#34A853"
              />
              <path
                d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </a>

          <p className="text-xs text-gray-400 text-center">
            Only Google Workspace accounts for your CA firm are supported.
          </p>
        </div>

        <p className="text-center text-xs text-gray-400">
          Your data is encrypted and isolated to your firm under Indian data
          residency standards.
        </p>
      </div>
    </main>
  );
}
