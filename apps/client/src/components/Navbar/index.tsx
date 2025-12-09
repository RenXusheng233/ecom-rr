import Image from 'next/image'
import Link from 'next/link'
import SearchBar from './Searchbar'
import { Bell, Home } from 'lucide-react'
import ShoppingCartIcon from './ShoppingCartIcon'
import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs'
import ProfileButton from '../ProfileButton'

const Navbar = () => {
  return (
    <nav className="w-full flex items-center justify-between border-b border-gray-200 pb-4">
      {/* Left */}
      <Link href="/" className="flex items-center">
        <Image
          src="/logo.png"
          alt="TrendRR"
          width={36}
          height={36}
          className="w-6 h-6 md:w-9 md:h-9"
        />
        <p className="hidden md:block text-lg font-medium tracking-wider">
          TRENDRR.
        </p>
      </Link>
      {/* Right */}
      <div className="flex items-center gap-6">
        <SearchBar />
        <Link href="/">
          <Home className="w-4 h-4 text-gray-600" />
        </Link>
        <Link href="/">
          <Bell className="w-4 h-4 text-gray-600" />
        </Link>
        <ShoppingCartIcon />
        <SignedOut>
          <SignInButton />
        </SignedOut>
        <SignedIn>
          <ProfileButton />
        </SignedIn>
      </div>
    </nav>
  )
}

export default Navbar
