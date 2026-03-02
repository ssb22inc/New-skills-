export const AMENITIES = {
  essential: [
    { id: 'wifi', label: 'WiFi', icon: 'wifi' },
    { id: 'parking', label: 'Parking', icon: 'car' },
    { id: 'laundry_in_unit', label: 'Laundry In-Unit', icon: 'washer' },
    { id: 'laundry_in_building', label: 'Laundry In Building', icon: 'washer' },
    { id: 'air_conditioning', label: 'Air Conditioning', icon: 'thermometer' },
    { id: 'heating', label: 'Heating', icon: 'flame' },
    { id: 'dishwasher', label: 'Dishwasher', icon: 'sparkles' },
    { id: 'kitchen', label: 'Full Kitchen', icon: 'utensils' },
  ],
  building: [
    { id: 'gym', label: 'Gym/Fitness Center', icon: 'dumbbell' },
    { id: 'pool', label: 'Pool', icon: 'waves' },
    { id: 'rooftop', label: 'Rooftop Access', icon: 'building' },
    { id: 'doorman', label: 'Doorman', icon: 'shield' },
    { id: 'elevator', label: 'Elevator', icon: 'arrow-up' },
    { id: 'storage', label: 'Storage Unit', icon: 'archive' },
    { id: 'bike_storage', label: 'Bike Storage', icon: 'bike' },
    { id: 'package_room', label: 'Package Room', icon: 'package' },
    { id: 'concierge', label: 'Concierge', icon: 'bell' },
  ],
  outdoor: [
    { id: 'balcony', label: 'Balcony', icon: 'sun' },
    { id: 'patio', label: 'Patio', icon: 'tree' },
    { id: 'backyard', label: 'Backyard', icon: 'leaf' },
    { id: 'garden', label: 'Garden', icon: 'flower' },
    { id: 'bbq_grill', label: 'BBQ Grill', icon: 'flame' },
  ],
  features: [
    { id: 'furnished', label: 'Fully Furnished', icon: 'sofa' },
    { id: 'hardwood_floors', label: 'Hardwood Floors', icon: 'grid' },
    { id: 'high_ceilings', label: 'High Ceilings', icon: 'arrow-up' },
    { id: 'natural_light', label: 'Great Natural Light', icon: 'sun' },
    { id: 'city_views', label: 'City Views', icon: 'building' },
    { id: 'smart_home', label: 'Smart Home', icon: 'cpu' },
    { id: 'ev_charging', label: 'EV Charging', icon: 'zap' },
    { id: 'workspace', label: 'Dedicated Workspace', icon: 'monitor' },
  ],
}

export const ALL_AMENITIES = Object.values(AMENITIES).flat()

export const AMENITY_LABELS: Record<string, string> = Object.fromEntries(
  ALL_AMENITIES.map((a) => [a.id, a.label])
)
