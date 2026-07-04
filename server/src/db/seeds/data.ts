export type SeedCustomer = {
  name: string
  phone: string
  email?: string
  addresses: Array<{
    label: string
    address: string
    city: string
    lat: number
    lng: number
    isDefault: boolean
  }>
  vehicles: Array<{
    make: string
    model: string
    color?: string
    licensePlate?: string
    vehicleType: 'sedan' | 'suv' | 'hatchback'
    isDefault: boolean
  }>
}

export type SeedVendorOwner = {
  name: string
  phone: string
}

export type SeedVendor = {
  ownerPhone: string
  businessName: string
  phone: string
  address: string
  city: string
  lat: number
  lng: number
  isVerified: boolean
  status: 'pending' | 'active' | 'suspended'
  doorstepEnabled: boolean
  dropinEnabled: boolean
  slotIntervalMins: 30 | 45 | 60
  serviceAreas: Array<{ areaName: string; pincode: string }>
  services: Array<{
    name: string
    category: 'car_wash' | 'detailing' | 'coating' | 'scratch_removal'
    price: string
    durationMins: number
    description?: string
  }>
}

/** Customers — OTP login with purpose `login` */
export const SEED_CUSTOMERS: SeedCustomer[] = [
  {
    name: 'Rahul Sharma',
    phone: '9876543210',
    email: 'rahul@example.com',
    addresses: [
      {
        label: 'Home',
        address: '14, Gandhi Nagar, Adyar, Chennai',
        city: 'Adyar',
        lat: 13.0067,
        lng: 80.2574,
        isDefault: true,
      },
      {
        label: 'Office',
        address: '42, IT Park, Sholinganallur, Chennai',
        city: 'Sholinganallur',
        lat: 12.901,
        lng: 80.2279,
        isDefault: false,
      },
    ],
    vehicles: [
      {
        make: 'Honda',
        model: 'City',
        color: 'White',
        licensePlate: 'TN09AB1234',
        vehicleType: 'sedan',
        isDefault: true,
      },
      {
        make: 'Hyundai',
        model: 'Creta',
        color: 'Grey',
        licensePlate: 'TN07CD5678',
        vehicleType: 'suv',
        isDefault: false,
      },
    ],
  },
  {
    name: 'Priya Nair',
    phone: '9876543211',
    addresses: [
      {
        label: 'Home',
        address: '8, 4th Avenue, Besant Nagar, Chennai',
        city: 'Besant Nagar',
        lat: 13.0001,
        lng: 80.2666,
        isDefault: true,
      },
    ],
    vehicles: [
      {
        make: 'Maruti',
        model: 'Swift',
        color: 'Red',
        licensePlate: 'TN10EF9012',
        vehicleType: 'hatchback',
        isDefault: true,
      },
    ],
  },
  {
    name: 'Dev Customer',
    phone: '9876510002',
    addresses: [
      {
        label: 'Home',
        address: '22, Lake View Road, Adyar, Chennai',
        city: 'Adyar',
        lat: 13.0067,
        lng: 80.2574,
        isDefault: true,
      },
    ],
    vehicles: [
      {
        make: 'Tata',
        model: 'Nexon',
        licensePlate: 'TN14GH3456',
        vehicleType: 'suv',
        isDefault: true,
      },
    ],
  },
]

/** Vendor owners — OTP login with audience `vendor` */
export const SEED_VENDOR_OWNERS: SeedVendorOwner[] = [
  { name: 'Raj Kumar', phone: '9876510001' },
  { name: 'Vikram Sundaram', phone: '9876510003' },
  { name: 'Mohan Reddy', phone: '9876510004' },
]

export const SEED_VENDORS: SeedVendor[] = [
  {
    ownerPhone: '9876510001',
    businessName: 'Sparkle Auto Care',
    phone: '9876510001',
    address: '14, Gandhi Nagar, Adyar, Chennai – 600020',
    city: 'Adyar',
    lat: 13.0067,
    lng: 80.2574,
    isVerified: true,
    status: 'active',
    doorstepEnabled: true,
    dropinEnabled: true,
    slotIntervalMins: 30,
    serviceAreas: [
      { areaName: 'Adyar', pincode: '600020' },
      { areaName: 'Velachery', pincode: '600042' },
    ],
    services: [
      {
        name: 'Basic Wash',
        category: 'car_wash',
        price: '299.00',
        durationMins: 30,
      },
      {
        name: 'Premium Detailing',
        category: 'detailing',
        price: '1499.00',
        durationMins: 120,
      },
      {
        name: 'Ceramic Coating',
        category: 'coating',
        price: '4999.00',
        durationMins: 180,
      },
    ],
  },
  {
    ownerPhone: '9876510003',
    businessName: 'Elite Detailing Studio',
    phone: '9876510003',
    address: '55, Velachery Main Road, Chennai – 600042',
    city: 'Velachery',
    lat: 12.9815,
    lng: 80.218,
    isVerified: true,
    status: 'active',
    doorstepEnabled: false,
    dropinEnabled: true,
    slotIntervalMins: 45,
    serviceAreas: [{ areaName: 'Velachery', pincode: '600042' }],
    services: [
      {
        name: 'Interior Detailing',
        category: 'detailing',
        price: '1999.00',
        durationMins: 90,
      },
      {
        name: 'Paint Coating',
        category: 'coating',
        price: '5999.00',
        durationMins: 240,
      },
    ],
  },
  {
    ownerPhone: '9876510004',
    businessName: 'Quick Wash Hub',
    phone: '9876510004',
    address: '12, Usman Road, T Nagar, Chennai – 600017',
    city: 'T Nagar',
    lat: 13.0418,
    lng: 80.2341,
    isVerified: true,
    status: 'active',
    doorstepEnabled: true,
    dropinEnabled: false,
    slotIntervalMins: 30,
    serviceAreas: [
      { areaName: 'T Nagar', pincode: '600017' },
      { areaName: 'Nandanam', pincode: '600035' },
    ],
    services: [
      {
        name: 'Express Wash',
        category: 'car_wash',
        price: '199.00',
        durationMins: 20,
      },
      {
        name: 'Scratch Removal',
        category: 'scratch_removal',
        price: '899.00',
        durationMins: 60,
      },
    ],
  },
]

export const DEFAULT_WORKING_HOURS = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  openTime: '09:00:00',
  closeTime: '18:00:00',
  isClosed: false,
}))
