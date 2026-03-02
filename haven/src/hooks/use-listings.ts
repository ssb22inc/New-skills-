'use client'

import { useState, useCallback } from 'react'
import type { Listing, ListingFilters } from '@/types/listing'
import type { ApiResponse, PaginatedResponse } from '@/types/api'

export function useListings() {
  const [listings, setListings] = useState<Listing[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)

  const fetchListings = useCallback(async (filters?: ListingFilters, page = 1) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '20',
        ...filters,
      } as Record<string, string>)

      const res = await fetch(`/api/listings?${params}`)
      const json: ApiResponse<PaginatedResponse<Listing>> = await res.json()

      if (!res.ok) throw new Error(json.error)
      if (json.data) {
        setListings(json.data.data)
        setTotalCount(json.data.count)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch listings')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const createListing = useCallback(async (data: Partial<Listing>) => {
    const res = await fetch('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json: ApiResponse<Listing> = await res.json()
    if (!res.ok) throw new Error(json.error)
    return json.data!
  }, [])

  const updateListing = useCallback(async (id: string, data: Partial<Listing>) => {
    const res = await fetch(`/api/listings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json: ApiResponse<Listing> = await res.json()
    if (!res.ok) throw new Error(json.error)
    return json.data!
  }, [])

  const deleteListing = useCallback(async (id: string) => {
    const res = await fetch(`/api/listings/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json()
      throw new Error(json.error)
    }
  }, [])

  return { listings, isLoading, error, totalCount, fetchListings, createListing, updateListing, deleteListing }
}
