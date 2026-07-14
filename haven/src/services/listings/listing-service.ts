import { createAdminClient } from '@/lib/supabase/admin'
import type { Listing, ListingFilters } from '@/types/listing'
import type { Database } from '@/types/database'

type ListingInsert = Database['public']['Tables']['listings']['Insert']
type ListingUpdate = Database['public']['Tables']['listings']['Update']

export async function getListings(
  filters: ListingFilters = {},
  page = 1,
  perPage = 20
): Promise<{ data: Listing[]; count: number }> {
  const supabase = createAdminClient()
  const offset = (page - 1) * perPage

  let query = supabase
    .from('listings')
    .select('*', { count: 'exact' })
    .eq('status', filters.status || 'active')
    .range(offset, offset + perPage - 1)
    .order('created_at', { ascending: false })

  if (filters.city) query = query.ilike('city', filters.city)
  if (filters.state) query = query.eq('state', filters.state)
  if (filters.minPrice) query = query.gte('price_monthly', filters.minPrice)
  if (filters.maxPrice) query = query.lte('price_monthly', filters.maxPrice)
  if (filters.bedrooms !== undefined) query = query.eq('bedrooms', filters.bedrooms)
  if (filters.propertyType) query = query.eq('property_type', filters.propertyType)
  if (filters.furnitureStatus) query = query.eq('furniture_status', filters.furnitureStatus)
  if (filters.availableFrom) query = query.lte('available_date', filters.availableFrom)
  if (filters.amenities?.length) query = query.contains('amenities', filters.amenities)

  const { data, count, error } = await query
  if (error) throw error

  return { data: data || [], count: count || 0 }
}

export async function getListingById(id: string): Promise<Listing | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('listings')
    .select('*, listing_photos(*)')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function createListing(
  userId: string,
  data: Partial<Listing>
): Promise<Listing> {
  const supabase = createAdminClient()
  const { data: listing, error } = await supabase
    .from('listings')
    .insert({ ...data, user_id: userId } as ListingInsert)
    .select()
    .single()

  if (error) throw error
  return listing
}

export async function updateListing(
  id: string,
  userId: string,
  data: Partial<Listing>
): Promise<Listing> {
  const supabase = createAdminClient()
  const { data: listing, error } = await supabase
    .from('listings')
    .update(data as ListingUpdate)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error
  return listing
}

export async function deleteListing(id: string, userId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('listings')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw error
}
