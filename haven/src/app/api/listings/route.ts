import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getListings, createListing } from '@/services/listings/listing-service'
import type { ListingFilters } from '@/types/listing'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filters: ListingFilters = {
      city: searchParams.get('city') || undefined,
      state: searchParams.get('state') || undefined,
      min_price: searchParams.get('min_price') ? Number(searchParams.get('min_price')) : undefined,
      max_price: searchParams.get('max_price') ? Number(searchParams.get('max_price')) : undefined,
      bedrooms: searchParams.get('bedrooms') ? Number(searchParams.get('bedrooms')) : undefined,
    }
    const page = Number(searchParams.get('page') || 1)
    const perPage = Number(searchParams.get('per_page') || 20)

    const result = await getListings(filters, page, perPage)

    return NextResponse.json({
      data: {
        data: result.data,
        count: result.count,
        page,
        per_page: perPage,
        total_pages: Math.ceil(result.count / perPage),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch listings' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const listing = await createListing(user.id, body)

    return NextResponse.json({ data: listing }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create listing' },
      { status: 500 }
    )
  }
}
