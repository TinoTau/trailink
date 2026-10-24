import { useRef } from 'react'

export function FileField({
  label,
  accept,
  disabled,
  className = 'account-chip',
  onPick,
}: {
  label: string
  accept: string
  disabled?: boolean
  className?: string
  onPick: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) {
            onPick(file)
          }
        }}
      />
      <button type="button" className={className} disabled={disabled} onClick={() => inputRef.current?.click()}>
        {label}
      </button>
    </>
  )
}
