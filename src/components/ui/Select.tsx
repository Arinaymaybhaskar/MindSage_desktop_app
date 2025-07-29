import { ChevronDownIcon } from 'lucide-react'
interface SelectProps {
  id: string
  label?: string
  value: string
  onChange: (value: string) => void
  options: {
    value: string
    label: string
  }[]
  className?: string
  size?: 'sm' | 'md' | 'lg'
}
const Select = ({
  id,
  label,
  value,
  onChange,
  options,
  className = '',
  size = 'md',
}: SelectProps) => {
  const sizeClasses = {
    sm: 'w-24',
    md: 'w-32',
    lg: 'w-40',
  }
  return (
    <div className="relative">
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
        </label>
      )}
      <div className={`relative ${sizeClasses[size]} ${className}`}>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full appearance-none rounded-md border border-gray-300 bg-white py-2 pl-3 pr-8 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
          <ChevronDownIcon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}
export default Select
