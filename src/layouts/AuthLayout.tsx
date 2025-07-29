import { type ReactNode } from 'react'
import { Logo } from './Logo'

interface AuthLayoutProps {
  children: ReactNode
  title: string
  subtitle: string
}
export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row">
      {/* Left side - decorative */}
      <div className="hidden md:flex md:w-1/2 bg-teal-600 p-8 flex-col justify-between">
        <Logo />
        <div className="text-white space-y-6 max-w-md">
          <h1 className="text-3xl font-bold">
            Capture your thoughts, one day at a time
          </h1>
          <p className="text-teal-100">
            Your personal space to reflect, grow, and document your journey
            through life.
          </p>
          <div className="flex gap-4">
            <div className="h-1 w-12 bg-teal-400 rounded-full"></div>
            <div className="h-1 w-12 bg-teal-300 rounded-full"></div>
            <div className="h-1 w-12 bg-teal-200 rounded-full"></div>
          </div>
        </div>
        <div className="text-teal-200 text-sm">
          © {new Date().getFullYear()} MindSage. All rights reserved.
        </div>
      </div>
      {/* Right side - form */}
      <div className="w-full md:w-1/2 p-6 md:p-12 flex flex-col justify-center">
        <div className="md:hidden mb-8">
          <Logo />
        </div>
        <div className="max-w-md w-full mx-auto space-y-8">
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="mt-2 text-sm text-gray-600">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
