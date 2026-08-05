import Image from 'next/image'
import { Card, CardContent, CardFooter, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { OrderType, ProductType } from '@repo/types'
import { auth } from '@clerk/nextjs/server'

export const POPULAR_PRODUCTS = 'Popular Products'
export const LATEST_TRANSACTIONS = 'Latest Transactions'

const CardList = async ({ title }: { title: string }) => {
  const { getToken } = await auth()
  const token = await getToken()

  let products: ProductType[] = []
  let orders: OrderType[] = []

  if (title === POPULAR_PRODUCTS) {
    products = await fetch(
      `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/products?limit=5&popular=true`,
    ).then((res) => res.json())
  } else {
    orders = await fetch(
      `${process.env.NEXT_PUBLIC_ORDER_SERVICE_URL}/orders?limit=5`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    ).then((res) => res.json())
  }

  return (
    <div>
      <div className="text-lg font-medium mb-6">{title}</div>
      <div className="flex flex-col gap-2">
        {title === POPULAR_PRODUCTS
          ? products.map(({ id, name, images, price }) => (
              <Card
                key={id}
                className="flex-row items-center justify-between gap-4 p-4"
              >
                <div className="w-12 h-12 rounded-sm relative overflow-hidden">
                  <Image
                    src={
                      Object.values(images as Record<string, string>)[0] || ''
                    }
                    alt={name}
                    fill
                    sizes="auto"
                    loading="eager"
                    className="object-cover"
                  />
                </div>
                <CardContent className="p-0 flex-1">
                  <CardTitle className="text-sm font-medium">{name}</CardTitle>
                </CardContent>
                <CardFooter className="p-0">${price}</CardFooter>
              </Card>
            ))
          : orders.map(({ _id, email, status, amount }) => (
              <Card
                key={_id}
                className="flex-row items-center justify-between gap-4 p-4"
              >
                <CardContent className="p-0 flex-1">
                  <CardTitle className="text-sm font-medium">{email}</CardTitle>
                  <Badge variant="secondary">{status}</Badge>
                </CardContent>
                <CardFooter className="p-0">${amount / 100}</CardFooter>
              </Card>
            ))}
      </div>
    </div>
  )
}

export default CardList
