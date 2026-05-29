"use client";

import * as React from "react";
import { Check, ChevronsUpDown, PenLine } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchableSelectOption {
  /** The value stored when selected. */
  value: string;
  /** The label shown in the list and on the trigger button. */
  label: string;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /**
   * When true the user may type a value that is not in the options list.
   * A "Use «typed text»" item appears at the bottom so they can confirm
   * the custom entry.
   */
  allowCustomValue?: boolean;
}

/**
 * A searchable select dropdown built on shadcn Popover + Command (cmdk).
 *
 * By default only predefined options can be selected.  Set
 * `allowCustomValue` to also accept arbitrary typed values.
 */
export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No results found.",
  disabled = false,
  className,
  allowCustomValue = false,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedLabel = React.useMemo(() => {
    if (!value) return "";
    return options.find((o) => o.value === value)?.label ?? value;
  }, [options, value]);

  // Whether the current search text already matches an existing option
  // (case-insensitive) so we can decide whether to show the custom-value
  // item.
  const searchMatchesOption = React.useMemo(() => {
    if (!search.trim()) return true; // nothing typed — hide custom item
    const needle = search.trim().toLowerCase();
    return options.some((o) => o.label.toLowerCase() === needle);
  }, [search, options]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {value ? selectedLabel : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {!allowCustomValue && (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            )}
            {allowCustomValue && !searchMatchesOption && (
              <CommandGroup heading="Custom">
                <CommandItem
                  value={`__custom__${search}`}
                  onSelect={() => {
                    onValueChange(search.trim());
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <PenLine className="mr-2 h-4 w-4 opacity-70" />
                  Use &ldquo;{search.trim()}&rdquo;
                </CommandItem>
              </CommandGroup>
            )}
            {allowCustomValue && searchMatchesOption && options.length > 0 && search.trim() !== "" ? null : allowCustomValue && options.length === 0 && searchMatchesOption ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : null}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onValueChange(option.value === value ? "" : option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
