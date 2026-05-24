import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../utils/cn'

export function Modal({ open, onClose, title, children, size = 'md' }) {
  const [bottomOffset, setBottomOffset] = useState(0)
  const prevHeight = useRef(window.visualViewport?.height ?? window.innerHeight)

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else { document.body.style.overflow = ''; setBottomOffset(0) }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Shift modal up when software keyboard appears
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return
    function onResize() {
      const diff = prevHeight.current - vv.height
      setBottomOffset(diff > 50 ? diff : 0)
      prevHeight.current = vv.height
    }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [open])

  if (!open) return null

  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn('relative w-full rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-900 shadow-xl', sizes[size], 'flex flex-col')}
        style={{
          maxHeight: bottomOffset > 0 ? `calc(92svh - ${bottomOffset}px)` : '92svh',
          marginBottom: bottomOffset > 0 ? bottomOffset : undefined,
          transition: 'max-height 0.2s ease, margin-bottom 0.2s ease',
        }}
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
            <button onClick={onClose} className="btn-ghost p-2 -mr-1 rounded-xl">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-4 safe-bottom">
          {children}
        </div>
      </div>
    </div>
  )
}
