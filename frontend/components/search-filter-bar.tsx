'use client';

import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';

interface SearchFilterBarProps {
  onSearch: (query: string) => void;
  onFilterChange: (filters: Record<string, string>) => void;
  filterOptions?: {
    label: string;
    key: string;
    options: { value: string; label: string }[];
  }[];
  placeholder?: string;
}

export function SearchFilterBar({
  onSearch,
  onFilterChange,
  filterOptions = [],
  placeholder = 'Search...',
}: SearchFilterBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onSearch(value);
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters };
    if (value === '' || value === 'all') {
      delete newFilters[key];
    } else {
      newFilters[key] = value;
    }
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilters({});
    onSearch('');
    onFilterChange({});
  };

  const activeFilterCount = Object.keys(filters).length + (searchQuery ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="flex-1"
        />
        {activeFilterCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearFilters}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Clear ({activeFilterCount})
          </Button>
        )}
      </div>

      {filterOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <Select
              key={option.key}
              value={filters[option.key] || 'all'}
              onValueChange={(value) => handleFilterChange(option.key, value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={option.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {option.label}</SelectItem>
                {option.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      )}
    </div>
  );
}
