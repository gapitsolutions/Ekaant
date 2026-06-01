'use client'

/**
 * Multi-select dropdown built on top of {@link Popover}.
 *
 * Used by the reception patient list to let a receptionist filter by *several*
 * states / districts / addiction types at once. Within a single MultiSelect the
 * semantics are OR (a row matches if its value is in the selection); the parent
 * combines several MultiSelects with AND. An empty selection means "no filter".
 *
 * The trigger summarises the current selection (`All States` / `Bihar, Assam` /
 * `3 selected`) so the form stays compact when many options are picked. The
 * body is a scrollable checkbox list with an inline search input so longer
 * option lists are still navigable.
 */

import * as React from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type MultiSelectOption = {
  /** Wire value sent to the API. */
  value: string
  /** Human label rendered in the dropdown and trigger summary. */
  label: string
}

export type MultiSelectProps = {
  options: MultiSelectOption[]
  value: string[]
  onChange: (next: string[]) => void
  /** Shown on the trigger when the selection is empty. */
  placeholder?: string
  /** Plural noun used in the "N <noun> selected" summary, e.g. "states". */
  selectedNoun?: string
  /** Placeholder for the in-popover search input. */
  searchPlaceholder?: string
  /** Renders when no options match the search query. */
  emptyText?: string
  /** Disables the trigger; useful when a parent filter (state) has no value. */
  disabled?: boolean
  /** Extra className for the trigger button. */
  className?: string
  /** How many selected labels to inline before collapsing to "N selected". */
  maxLabelsBeforeCount?: number
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  selectedNoun = 'items',
  searchPlaceholder = 'Search…',
  emptyText = 'No options',
  disabled = false,
  className,
  maxLabelsBeforeCount = 2,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')

  // Lookup table for value → label so the trigger summary works even when the
  // option list has been filtered down by the search box.
  const labelByValue = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const opt of options) {
      map.set(opt.value, opt.label)
    }
    return map
  }, [options])

  const filteredOptions = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q),
    )
  }, [options, query])

  const selectedSet = React.useMemo(() => new Set(value), [value])

  const toggleValue = React.useCallback(
    (val: string) => {
      const next = new Set(selectedSet)
      if (next.has(val)) {
        next.delete(val)
      } else {
        next.add(val)
      }
      // Preserve master-list order so toggling on/off is stable across renders.
      onChange(options.filter((opt) => next.has(opt.value)).map((o) => o.value))
    },
    [options, selectedSet, onChange],
  )

  const handleClear = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange([])
    },
    [onChange],
  )

  // Trigger summary: nothing selected → placeholder; few → inline labels;
  // many → collapsed count so wide selections don't stretch the trigger.
  const triggerLabel = React.useMemo(() => {
    if (value.length === 0) {
      return <span className="text-muted-foreground">{placeholder}</span>
    }
    if (value.length <= maxLabelsBeforeCount) {
      const labels = value.map((v) => labelByValue.get(v) ?? v).join(', ')
      return <span className="truncate">{labels}</span>
    }
    return <span>{`${value.length} ${selectedNoun} selected`}</span>
  }, [value, placeholder, maxLabelsBeforeCount, labelByValue, selectedNoun])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-10 w-full justify-between bg-[#f9fafb] border-slate-200 font-normal',
            value.length > 0 && 'text-foreground',
            className,
          )}
        >
          <span className="flex-1 min-w-0 text-left truncate">
            {triggerLabel}
          </span>
          <div className="flex items-center gap-1 pl-2">
            {value.length > 0 && !disabled ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear selection"
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onChange([])
                  }
                }}
                className="rounded-sm p-0.5 hover:bg-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <X className="h-3 w-3 text-slate-500" />
              </span>
            ) : null}
            <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
          </div>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-[14rem] p-0"
      >
        <div className="border-b border-slate-100 p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-7 bg-white"
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto py-1">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {emptyText}
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const checked = selectedSet.has(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggleValue(opt.value)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none',
                    checked && 'bg-slate-50',
                  )}
                >
                  {/*
                    Pure-visual checkbox. The row <button> is the click/keyboard
                    target; nesting Radix's <Checkbox> (which renders its own
                    <button>) inside another <button> is invalid HTML and
                    triggers a hydration error.
                  */}
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                      checked
                        ? 'border-primary bg-primary text-white'
                        : 'border-input bg-white',
                    )}
                  >
                    {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span className="flex-1 truncate">{opt.label}</span>
                </button>
              )
            })
          )}
        </div>

        {value.length > 0 ? (
          <div className="border-t border-slate-100 px-2 py-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {value.length} selected
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange([])}
              className="h-7 text-xs text-muted-foreground hover:text-primary"
            >
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
