import { auth } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'

const TestPage = async () => {
  if (process.env.NODE_ENV !== 'development') notFound()

  const { getToken } = await auth()
  const token = await getToken()
  if (!token) notFound()

  const services = [
    { name: 'Product', url: 'http://localhost:8000/test' },
    { name: 'Order', url: 'http://localhost:8001/test' },
    { name: 'Payment', url: 'http://localhost:8002/test' },
  ]
  const statuses = await Promise.all(
    services.map(async ({ name, url }) => {
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        })
        return { name, ok: response.ok }
      } catch {
        return { name, ok: false }
      }
    }),
  )

  return (
    <ul>
      {statuses.map(({ name, ok }) => (
        <li key={name}>
          {name}: {ok ? 'Available' : 'Unavailable'}
        </li>
      ))}
    </ul>
  )
}

export default TestPage
