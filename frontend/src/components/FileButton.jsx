import React, { useRef, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'

// Styled file picker used across tabs (replaces the native "Choose File").
// Renders a themed button + the selected filename; calls onSelect(file).
export default function FileButton({ onSelect, disabled = false, accept = 'image/*', label }) {
  const { t } = useT()
  const [name, setName] = useState('')
  const inputRef = useRef(null)

  return (
    <div className="file-btn-wrap">
      <button
        type="button"
        className="btn-ghost file-btn"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <span aria-hidden="true">🖼️</span> {label || t('common.chooseFile')}
      </button>
      <span className="file-btn-name" title={name || undefined}>
        {name || t('common.noFile')}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            setName(f.name)
            onSelect(f)
          }
          e.target.value = ''
        }}
      />
    </div>
  )
}
