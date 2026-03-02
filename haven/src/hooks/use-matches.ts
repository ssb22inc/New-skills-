'use client'

import { useState, useCallback } from 'react'
import type { MatchWithDetails, SeekerAction } from '@/types/matching'
import type { ApiResponse } from '@/types/api'

export function useMatches() {
  const [matches, setMatches] = useState<MatchWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMatches = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/matches')
      const json: ApiResponse<MatchWithDetails[]> = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (json.data) setMatches(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch matches')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const recordAction = useCallback(async (matchId: string, action: SeekerAction) => {
    const res = await fetch(`/api/matches/${matchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seeker_action: action }),
    })
    const json: ApiResponse = await res.json()
    if (!res.ok) throw new Error(json.error as string)
  }, [])

  return { matches, isLoading, error, fetchMatches, recordAction }
}
