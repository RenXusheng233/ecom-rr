import Image from 'next/image'
import Link from 'next/link'

const Footer = () => {
  return (
    <div className="mt-16 flex flex-col items-center gap-8 md:flex-row md:items-start md:justify-between md:gap-0 bg-gray-800 p-8 rounded-lg">
      <div className="flex flex-col gap-4 items-center md:items-start">
        <Link href="/" className="flex items-center">
          <Image src="/logo.png" alt="TrendRR" width={36} height={36} />
          <p className="hidden md:block text-lg font-medium tracking-wider text-white">
            TRENDRR.
          </p>
        </Link>
        <p className="text-sm text-gray-400 ">© 2025 TrendRR.</p>
        <p className="text-sm text-gray-400 ">All rights reserved.</p>
      </div>
      <div className="flex flex-col gap-4 items-center md:items-start text-gray-400 text-sm">
        <p className="text-sm text-amber-50 font-semibold">Link</p>
        <Link href="/">Homepage</Link>
        <Link href="/">Privacy Policy</Link>
        <Link href="/">Terms of Service</Link>
        <Link href="/">Affiliate Program</Link>
      </div>
      <div className="flex flex-col gap-4 items-center md:items-start text-gray-400 text-sm">
        <p className="text-sm text-amber-50 font-semibold">Link</p>
        <Link href="/">Sale</Link>
        <Link href="/">All Products</Link>
        <Link href="/">New Arrivals</Link>
        <Link href="/">Best Sellers</Link>
      </div>
      <div className="flex flex-col gap-4 items-center md:items-start text-gray-400 text-sm">
        <p className="text-sm text-amber-50 font-semibold">Link</p>
        <Link href="/">Blog</Link>
        <Link href="/">About</Link>
        <Link href="/">Payment</Link>
        <Link href="/">Contract</Link>
      </div>
    </div>
  )
}

export default Footer
